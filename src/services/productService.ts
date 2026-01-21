import { pool } from "../db/connection";
import type { Product } from "../../shared/schema";
import { squareService } from "./squareService";
import { geocodingService } from "./geocodingService";

export class ProductService {
  async getProducts(filters?: {
    category?: string;
    retailerId?: string;
    isApproved?: boolean;
    search?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    page?: number;  // Add page parameter
    limit?: number; // Add limit parameter
  }): Promise<{ products: Product[]; total: number; page: number; limit: number; totalPages: number }> {
      let query = `
      SELECT p.*, r.business_name as retailer_name, r.postcode, r.city, r.latitude, r.longitude,
             COALESCE(p.review_count, 0) as review_count,
             COALESCE(p.average_rating, 0) as average_rating,
             p.sync_from_epos, p.square_item_id, p.last_epos_sync_at,
             r.square_sync_enabled, r.square_access_token, r.square_location_id
      FROM products p
      JOIN retailers r ON p.retailer_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (filters?.category) {
      query += ` AND p.category = $${paramCount}`;
      params.push(filters.category);
      paramCount++;
    }

    if (filters?.retailerId) {
      query += ` AND p.retailer_id = $${paramCount}`;
      params.push(filters.retailerId);
      paramCount++;
    }

    if (filters?.isApproved !== undefined) {
      query += ` AND p.is_approved = $${paramCount}`;
      params.push(filters.isApproved);
      paramCount++;
    }

    if (filters?.search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    // Handle location-based filtering
    const isRadiusSearch = filters?.latitude && filters?.longitude && filters?.radiusKm;
    
    if (isRadiusSearch) {
      // Radius-based search: filter retailers with coordinates within radius
      // We'll filter by bounding box first (for performance), then calculate exact distance
      query += ` AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL`;
    } else if (filters?.location) {
      // Fallback to text-based search by postcode or city
      const locationParam = filters.location.trim();
      console.log(`[ProductService] Using text-based search for location: "${locationParam}"`);
      console.log(`[ProductService] Current query before location filter:`, query);
      
      // Compare against retailers table postcode and city fields
      // Handle NULL values and trim whitespace for better matching
      // Use ILIKE for case-insensitive matching (supports both exact and partial matches)
      query += ` AND (
        (r.postcode IS NOT NULL AND TRIM(r.postcode) ILIKE $${paramCount})
        OR (r.city IS NOT NULL AND TRIM(r.city) ILIKE $${paramCount + 1})
        OR (r.postcode IS NOT NULL AND TRIM(r.postcode) ILIKE $${paramCount + 2})
        OR (r.postcode IS NOT NULL AND TRIM(r.postcode) ILIKE $${paramCount + 3})
        OR (r.city IS NOT NULL AND TRIM(r.city) ILIKE $${paramCount + 4})
      )`;
      params.push(`%${locationParam}%`); // For partial postcode match
      params.push(`%${locationParam}%`); // For partial city match
      params.push(`${locationParam}%`); // For postcode prefix match (e.g., "M1" matches "M1 1AA")
      params.push(locationParam); // For exact postcode match (ILIKE without % works as equals)
      params.push(locationParam); // For exact city match (ILIKE without % works as equals)
      console.log(`[ProductService] Location filter params:`, {
        partialPostcode: `%${locationParam}%`,
        partialCity: `%${locationParam}%`,
        prefixPostcode: `${locationParam}%`,
        exactPostcode: locationParam,
        exactCity: locationParam
      });
      console.log(`[ProductService] Filtering retailers where r.postcode or r.city matches: "${locationParam}"`);
      paramCount += 5;
    }

    query += ` ORDER BY p.created_at DESC`;

    // For radius search, we need to fetch all products first, filter by distance, then paginate
    // For other searches, we can paginate in SQL
    const page = filters?.page || 1;
    const limit = filters?.limit || 12; // Default 12 items per page
    const offset = (page - 1) * limit;

    let total = 0;
    let result;

    if (isRadiusSearch) {
      // Fetch all products without pagination for radius filtering
      result = await pool.query(query, params);
    } else {
      // Get total count first (before pagination) for non-radius searches
      const countQuery = query
        .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ORDER BY.*$/, '')
        .replace(/LIMIT.*$/, '')
        .replace(/OFFSET.*$/, '');

      const countParams = [...params];
      try {
      const countResult = await pool.query(countQuery, countParams);
        if (!countResult.rows || countResult.rows.length === 0) {
          console.error('[ProductService] Count query returned no rows. Query:', countQuery);
          total = 0;
        } else {
      total = parseInt(countResult.rows[0].total) || 0;
        }
      } catch (error) {
        console.error('[ProductService] Error executing count query:', error);
        console.error('[ProductService] Count query:', countQuery);
        console.error('[ProductService] Count params:', countParams);
        total = 0;
      }

    // Add pagination to main query
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    paramCount += 2;

    console.log(`[ProductService] Final query:`, query);
    console.log(`[ProductService] Query params:`, params);
    result = await pool.query(query, params);
    console.log(`[ProductService] Query returned ${result.rows.length} rows`);
    }
  
    // Sync stock from Square for products with EPOS sync enabled
    // Do this in parallel for better performance
    const syncPromises = result.rows
      .filter((row) => row.sync_from_epos && row.square_item_id && row.square_sync_enabled && row.square_access_token && row.square_location_id)
      .map(async (row) => {
        try {
          const syncResult = await squareService.syncProductStock(row.id);
          if (syncResult.success && syncResult.stock !== null) {
            // Update the row with synced stock
            row.stock = syncResult.stock;
            row.last_epos_sync_at = new Date();
          }
        } catch (error) {
          console.error(`[ProductService] Failed to sync stock for product ${row.id}:`, error);
          // Continue with local stock value on error
        }
      });

    // Wait for all syncs to complete (but don't fail if some fail)
    await Promise.allSettled(syncPromises);

    let products = result.rows.map((row) => ({
      id: row.id,
      retailerId: row.retailer_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: parseInt(row.stock) || 0,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Include retailer information
      retailer_name: row.retailer_name,
      postcode: row.postcode,
      city: row.city,
      // Include retailer location data for distance calculation
      retailerLatitude: row.latitude ? parseFloat(row.latitude) : null,
      retailerLongitude: row.longitude ? parseFloat(row.longitude) : null,
      // Include review data
      reviewCount: parseInt(row.review_count) || 0,
      averageRating: parseFloat(row.average_rating) || 0,
      // Include EPOS sync fields
      syncFromEpos: row.sync_from_epos || false,
      squareItemId: row.square_item_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
        }));

    // If radius search is enabled, filter by exact distance
    if (isRadiusSearch) {
      products = products.filter((product) => {
        if (!product.retailerLatitude || !product.retailerLongitude) {
          return false;
        }

        const distance = geocodingService.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          product.retailerLatitude,
          product.retailerLongitude
        );

        return distance <= filters.radiusKm!;
      });

      // Sort by distance (closest first)
      products.sort((a, b) => {
        if (!a.retailerLatitude || !a.retailerLongitude) return 1;
        if (!b.retailerLatitude || !b.retailerLongitude) return -1;

        const distA = geocodingService.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          a.retailerLatitude,
          a.retailerLongitude
        );

        const distB = geocodingService.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          b.retailerLatitude,
          b.retailerLongitude
        );

        return distA - distB;
      });

      // Calculate total after radius filtering
      total = products.length;

      // Apply pagination after radius filtering
      const paginatedProducts = products.slice(offset, offset + limit);
      
      // Calculate total pages
      const totalPages = Math.ceil(total / limit);

      // Remove temporary location fields before returning
      return {
        products: paginatedProducts.map(({ retailerLatitude, retailerLongitude, ...product }) => product),
        total,
        page,
        limit,
        totalPages,
      };
    }

    // Calculate total pages for non-radius searches
    const totalPages = Math.ceil(total / limit);

    // Remove temporary location fields before returning
    return {
      products: products.map(({ retailerLatitude, retailerLongitude, ...product }) => product),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const result = await pool.query(
      `SELECT p.*, r.business_name as retailer_name, r.id as retailer_user_id,
              COALESCE(p.review_count, 0) as review_count,
              COALESCE(p.average_rating, 0) as average_rating,
              p.sync_from_epos, p.square_item_id, p.last_epos_sync_at,
              r.square_sync_enabled, r.square_access_token, r.square_location_id
       FROM products p
       JOIN retailers r ON p.retailer_id = r.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];

    // Sync stock from Square if EPOS sync is enabled
    if (row.sync_from_epos && row.square_item_id && row.square_sync_enabled && row.square_access_token && row.square_location_id) {
      try {
        const syncResult = await squareService.syncProductStock(id);
        if (syncResult.success && syncResult.stock !== null) {
          row.stock = syncResult.stock;
          row.last_epos_sync_at = new Date();
        }
      } catch (error) {
        console.error(`[ProductService] Failed to sync stock for product ${id}:`, error);
        // Continue with local stock value on error
      }
    }

    return {
      id: row.id,
      retailerId: row.retailer_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: parseInt(row.stock) || 0,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewCount: parseInt(row.review_count) || 0,
      averageRating: parseFloat(row.average_rating) || 0,
      syncFromEpos: row.sync_from_epos || false,
      squareItemId: row.square_item_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
    };
  }

  async createProduct(product: {
    retailerId: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    images?: string[];
    syncFromEpos?: boolean;
    squareItemId?: string;
  }): Promise<Product> {
    let finalStock = product.stock;
    let lastEposSyncAt: Date | null = null;
    
    // If EPOS sync is enabled, fetch stock from Square
    if (product.syncFromEpos && product.squareItemId) {
      try {
        // Get retailer's Square credentials
        const retailerResult = await pool.query(
          `SELECT square_access_token, square_location_id, square_sync_enabled
           FROM retailers WHERE id = $1`,
          [product.retailerId]
        );
        
        if (retailerResult.rows.length > 0) {
          const retailer = retailerResult.rows[0];
          
          if (retailer.square_sync_enabled && 
              retailer.square_access_token && 
              retailer.square_location_id) {
            
            // Fetch stock from Square
            const stock = await squareService.getItemStock(
              retailer.square_access_token,
              retailer.square_location_id,
              product.squareItemId
            );
            
            if (stock !== null) {
              finalStock = stock;
              lastEposSyncAt = new Date();
              console.log(`[ProductService] Synced stock from Square: ${stock} for item ${product.squareItemId}`);
            } else {
              console.warn(`[ProductService] Failed to sync stock from Square for item ${product.squareItemId}, using provided stock: ${product.stock}`);
            }
          }
        }
      } catch (error: any) {
        console.error(`[ProductService] Error syncing stock from Square during product creation:`, error);
        // Continue with provided stock value on error
      }
    }
    
    const result = await pool.query(
      `INSERT INTO products (retailer_id, name, description, price, stock, category, images, is_approved, sync_from_epos, square_item_id, last_epos_sync_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        product.retailerId,
        product.name,
        product.description,
        product.price,
        finalStock, // Use synced stock
        product.category,
        product.images || [],
        false, // Products need admin approval
        product.syncFromEpos || false,
        product.squareItemId || null,
        lastEposSyncAt, // Set sync timestamp if syncing
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      retailerId: row.retailer_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: parseInt(row.stock) || 0,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncFromEpos: row.sync_from_epos || false,
      squareItemId: row.square_item_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
    };
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    // Check if we need to sync stock from Square
    // This happens when syncFromEpos is enabled and squareItemId is set/updated
    let shouldSyncStock = false;
    let squareItemId: string | null = null;
    let syncFromEpos = false;
    
    // Get current product to check EPOS sync status
    const currentProduct = await pool.query(
      `SELECT p.sync_from_epos, p.square_item_id, p.retailer_id
       FROM products p
       WHERE p.id = $1`,
      [id]
    );
    
    if (currentProduct.rows.length > 0) {
      const current = currentProduct.rows[0];
      // Determine final values after update
      const finalSyncFromEpos = updates.syncFromEpos !== undefined ? updates.syncFromEpos : current.sync_from_epos;
      const finalSquareItemId = updates.squareItemId !== undefined ? (updates.squareItemId || null) : current.square_item_id;
      
      // Sync stock if EPOS sync is enabled and squareItemId is set
      shouldSyncStock = finalSyncFromEpos && !!finalSquareItemId;
      squareItemId = finalSquareItemId;
      syncFromEpos = finalSyncFromEpos;
    }
    
    let syncedStock: number | null = null;
    let lastEposSyncAt: Date | null = null;
    
    // Sync stock from Square if needed
    if (shouldSyncStock && squareItemId) {
      try {
        const currentProduct = await pool.query(
          `SELECT p.retailer_id
           FROM products p
           WHERE p.id = $1`,
          [id]
        );
        
        if (currentProduct.rows.length > 0) {
          const retailerId = currentProduct.rows[0].retailer_id;
          
          // Get retailer's Square credentials
          const retailerResult = await pool.query(
            `SELECT square_access_token, square_location_id, square_sync_enabled
             FROM retailers WHERE id = $1`,
            [retailerId]
          );
          
          if (retailerResult.rows.length > 0) {
            const retailer = retailerResult.rows[0];
            
            if (retailer.square_sync_enabled && 
                retailer.square_access_token && 
                retailer.square_location_id) {
              
              // Fetch stock from Square
              const stock = await squareService.getItemStock(
                retailer.square_access_token,
                retailer.square_location_id,
                squareItemId
              );
              
              if (stock !== null) {
                syncedStock = stock;
                lastEposSyncAt = new Date();
                console.log(`[ProductService] Synced stock from Square during update: ${stock} for item ${squareItemId}`);
              } else {
                console.warn(`[ProductService] Failed to sync stock from Square during update for item ${squareItemId}`);
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`[ProductService] Error syncing stock from Square during product update:`, error);
        // Continue with provided stock value on error
      }
    }
    
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.price !== undefined) {
      fields.push(`price = $${paramCount++}`);
      values.push(updates.price);
    }
    // Use synced stock if available, otherwise use provided stock
    if (syncedStock !== null) {
      fields.push(`stock = $${paramCount++}`);
      values.push(syncedStock);
    } else if (updates.stock !== undefined) {
      fields.push(`stock = $${paramCount++}`);
      values.push(updates.stock);
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${paramCount++}`);
      values.push(updates.category);
    }
    if (updates.images !== undefined) {
      fields.push(`images = $${paramCount++}`);
      values.push(updates.images);
    }
    if (updates.syncFromEpos !== undefined) {
      fields.push(`sync_from_epos = $${paramCount++}`);
      values.push(updates.syncFromEpos);
    }
    if (updates.squareItemId !== undefined) {
      fields.push(`square_item_id = $${paramCount++}`);
      values.push(updates.squareItemId || null);
    }
    // Update sync timestamp if we synced stock
    if (lastEposSyncAt !== null) {
      fields.push(`last_epos_sync_at = $${paramCount++}`);
      values.push(lastEposSyncAt);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    const row = result.rows[0];
    return {
      id: row.id,
      retailerId: row.retailer_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: parseInt(row.stock) || 0,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncFromEpos: row.sync_from_epos || false,
      squareItemId: row.square_item_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
    };
  }

  async approveProduct(id: string): Promise<Product> {
    const result = await pool.query(
      `UPDATE products SET is_approved = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      retailerId: row.retailer_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: row.stock,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async deleteProduct(id: string, retailerId: string): Promise<boolean> {
    // Verify the product belongs to the retailer before deleting
    const checkResult = await pool.query(
      "SELECT id FROM products WHERE id = $1 AND retailer_id = $2",
      [id, retailerId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error("Product not found or you don't have permission to delete it");
    }

    // Delete the product
    await pool.query("DELETE FROM products WHERE id = $1", [id]);
    return true;
  }

  async getRetailerIdByUserId(userId: string): Promise<string | undefined> {
    const result = await pool.query(
      "SELECT id FROM retailers WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    return result.rows[0].id;
  }
}

export const productService = new ProductService();

