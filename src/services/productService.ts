import { pool } from "../db/connection";
import type { Product } from "../../shared/schema";
import { squareService } from "./squareService";
import * as shopifyService from "./shopifyService";
import { geocodingService } from "./geocodingService";

export class ProductService {
  async getProducts(filters?: {
    category?: string;
    businessId?: string;
    businessTypeCategoryId?: string; // business's primary_category_id (business type)
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
      SELECT p.*, b.business_name as business_name, b.postcode, b.city, b.latitude, b.longitude,
             COALESCE(p.review_count, 0) as review_count,
             COALESCE(p.average_rating, 0) as average_rating,
             p.sync_from_epos, p.square_item_id, p.shopify_product_id, p.last_epos_sync_at,
             b.square_sync_enabled, b.square_access_token, b.square_location_id,
             b.shopify_sync_enabled, b.shopify_access_token, b.shopify_shop
      FROM products p
      JOIN businesses b ON p.business_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    if (filters?.category) {
      query += ` AND p.category = $${paramCount}`;
      params.push(filters.category);
      paramCount++;
    }

    if (filters?.businessId) {
      query += ` AND p.business_id = $${paramCount}`;
      params.push(filters.businessId);
      paramCount++;
    }

    if (filters?.businessTypeCategoryId) {
      query += ` AND b.primary_category_id = $${paramCount}`;
      params.push(filters.businessTypeCategoryId);
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
      // Radius-based search: filter businesses with coordinates within radius
      // We'll filter by bounding box first (for performance), then calculate exact distance
      query += ` AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL`;
    } else if (filters?.location) {
      // Fallback to text-based search by postcode or city
      const locationParam = filters.location.trim();
      console.log(`[ProductService] Using text-based search for location: "${locationParam}"`);
      console.log(`[ProductService] Current query before location filter:`, query);
      
      // Compare against businesses table postcode and city fields
      // Handle NULL values and trim whitespace for better matching
      // Use ILIKE for case-insensitive matching (supports both exact and partial matches)
      query += ` AND (
        (b.postcode IS NOT NULL AND TRIM(b.postcode) ILIKE $${paramCount})
        OR (b.city IS NOT NULL AND TRIM(b.city) ILIKE $${paramCount + 1})
        OR (b.postcode IS NOT NULL AND TRIM(b.postcode) ILIKE $${paramCount + 2})
        OR (b.postcode IS NOT NULL AND TRIM(b.postcode) ILIKE $${paramCount + 3})
        OR (b.city IS NOT NULL AND TRIM(b.city) ILIKE $${paramCount + 4})
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
      console.log(`[ProductService] Filtering businesses where b.postcode or b.city matches: "${locationParam}"`);
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
      .filter((row) => {
        if (!row.sync_from_epos) return false;
        if (row.square_item_id && row.square_sync_enabled && row.square_access_token && row.square_location_id) return true;
        if (row.shopify_product_id && row.shopify_sync_enabled && row.shopify_access_token && row.shopify_shop) return true;
        return false;
      })
      .map(async (row) => {
        try {
          const syncResult = row.square_item_id
            ? await squareService.syncProductStock(row.id)
            : row.shopify_product_id
              ? await shopifyService.syncProductStock(row.id)
              : { success: false as const, stock: null };
          if (syncResult.success && syncResult.stock !== null) {
            row.stock = syncResult.stock;
            row.last_epos_sync_at = new Date();
          }
        } catch (error) {
          console.error(`[ProductService] Failed to sync stock for product ${row.id}:`, error);
        }
      });

    // Wait for all syncs to complete (but don't fail if some fail)
    await Promise.allSettled(syncPromises);

    let products = result.rows.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: parseInt(row.stock) || 0,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Include business information
      business_name: row.business_name,
      postcode: row.postcode,
      city: row.city,
      // Include business location data for distance calculation
      businessLatitude: row.latitude ? parseFloat(row.latitude) : null,
      businessLongitude: row.longitude ? parseFloat(row.longitude) : null,
      // Include review data
      reviewCount: parseInt(row.review_count) || 0,
      averageRating: parseFloat(row.average_rating) || 0,
      // Include EPOS sync fields
      syncFromEpos: row.sync_from_epos || false,
      squareItemId: row.square_item_id || null,
      shopifyProductId: row.shopify_product_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
        }));

    // If radius search is enabled, filter by exact distance
    if (isRadiusSearch) {
      products = products.filter((product) => {
        if (!product.businessLatitude || !product.businessLongitude) {
          return false;
        }

        const distance = geocodingService.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          product.businessLatitude,
          product.businessLongitude
        );

        return distance <= filters.radiusKm!;
      });

      // Sort by distance (closest first)
      products.sort((a, b) => {
        if (!a.businessLatitude || !a.businessLongitude) return 1;
        if (!b.businessLatitude || !b.businessLongitude) return -1;

        const distA = geocodingService.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          a.businessLatitude,
          a.businessLongitude
        );

        const distB = geocodingService.calculateDistance(
          filters.latitude!,
          filters.longitude!,
          b.businessLatitude,
          b.businessLongitude
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
        products: paginatedProducts.map(({ businessLatitude, businessLongitude, ...product }) => product),
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
      products: products.map(({ businessLatitude, businessLongitude, ...product }) => product),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const result = await pool.query(
      `SELECT p.*, b.business_name as business_name, b.id as business_user_id,
              COALESCE(p.review_count, 0) as review_count,
              COALESCE(p.average_rating, 0) as average_rating,
              p.sync_from_epos, p.square_item_id, p.shopify_product_id, p.last_epos_sync_at,
              b.square_sync_enabled, b.square_access_token, b.square_location_id,
              b.shopify_sync_enabled, b.shopify_access_token, b.shopify_shop
       FROM products p
       JOIN businesses b ON p.business_id = b.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];

    // Sync stock from Square or Shopify if EPOS sync is enabled
    if (row.sync_from_epos) {
      try {
        const syncResult = row.square_item_id && row.square_sync_enabled && row.square_access_token && row.square_location_id
          ? await squareService.syncProductStock(id)
          : row.shopify_product_id && row.shopify_sync_enabled && row.shopify_access_token && row.shopify_shop
            ? await shopifyService.syncProductStock(id)
            : { success: false as const, stock: null };
        if (syncResult.success && syncResult.stock !== null) {
          row.stock = syncResult.stock;
          row.last_epos_sync_at = new Date();
        }
      } catch (error) {
        console.error(`[ProductService] Failed to sync stock for product ${id}:`, error);
      }
    }

    return {
      id: row.id,
      businessId: row.business_id,
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
      shopifyProductId: row.shopify_product_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
    };
  }

  async createProduct(product: {
    businessId: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    images?: string[];
    syncFromEpos?: boolean;
    squareItemId?: string;
    shopifyProductId?: string;
  }): Promise<Product> {
    let finalStock = product.stock;
    let lastEposSyncAt: Date | null = null;

    // If EPOS sync is enabled, fetch stock from Square or Shopify
    if (product.syncFromEpos) {
      try {
        const businessResult = await pool.query(
          `SELECT square_access_token, square_location_id, square_sync_enabled,
                  shopify_access_token, shopify_shop, shopify_sync_enabled
           FROM businesses WHERE id = $1`,
          [product.businessId]
        );
        if (businessResult.rows.length > 0) {
          const business = businessResult.rows[0];
          if (product.squareItemId && business.square_sync_enabled && business.square_access_token && business.square_location_id) {
            const stock = await squareService.getItemStock(
              business.square_access_token,
              business.square_location_id,
              product.squareItemId
            );
            if (stock !== null) {
              finalStock = stock;
              lastEposSyncAt = new Date();
            }
          } else if (product.shopifyProductId && business.shopify_sync_enabled && business.shopify_access_token && business.shopify_shop) {
            const stock = await shopifyService.getProductStock(
              business.shopify_access_token,
              business.shopify_shop,
              product.shopifyProductId
            );
            if (stock !== null) {
              finalStock = stock;
              lastEposSyncAt = new Date();
            }
          }
        }
      } catch (error: unknown) {
        console.error("[ProductService] Error syncing stock during product creation:", error);
      }
    }

    const result = await pool.query(
      `INSERT INTO products (business_id, name, description, price, stock, category, images, is_approved, sync_from_epos, square_item_id, shopify_product_id, last_epos_sync_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        product.businessId,
        product.name,
        product.description,
        product.price,
        finalStock,
        product.category,
        product.images || [],
        false,
        product.syncFromEpos || false,
        product.squareItemId || null,
        product.shopifyProductId || null,
        lastEposSyncAt,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      businessId: row.business_id,
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
      shopifyProductId: row.shopify_product_id || null,
      lastEposSyncAt: row.last_epos_sync_at || null,
    };
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    let shouldSyncSquare = false;
    let shouldSyncShopify = false;
    let squareItemId: string | null = null;
    let shopifyProductId: string | null = null;

    const currentProduct = await pool.query(
      `SELECT p.sync_from_epos, p.square_item_id, p.shopify_product_id, p.business_id
       FROM products p WHERE p.id = $1`,
      [id]
    );

    if (currentProduct.rows.length > 0) {
      const current = currentProduct.rows[0];
      const finalSyncFromEpos = updates.syncFromEpos !== undefined ? updates.syncFromEpos : current.sync_from_epos;
      const finalSquareItemId = updates.squareItemId !== undefined ? (updates.squareItemId || null) : current.square_item_id;
      const finalShopifyProductId = updates.shopifyProductId !== undefined ? (updates.shopifyProductId || null) : current.shopify_product_id;
      shouldSyncSquare = finalSyncFromEpos && !!finalSquareItemId;
      shouldSyncShopify = finalSyncFromEpos && !!finalShopifyProductId;
      squareItemId = finalSquareItemId;
      shopifyProductId = finalShopifyProductId;
    }

    let syncedStock: number | null = null;
    let lastEposSyncAt: Date | null = null;

    if (shouldSyncSquare && squareItemId) {
      try {
        const biz = await pool.query(
          `SELECT business_id FROM products WHERE id = $1`,
          [id]
        );
        if (biz.rows.length > 0) {
          const creds = await pool.query(
            `SELECT square_access_token, square_location_id, square_sync_enabled FROM businesses WHERE id = $1`,
            [biz.rows[0].business_id]
          );
          if (creds.rows.length > 0 && creds.rows[0].square_sync_enabled && creds.rows[0].square_access_token && creds.rows[0].square_location_id) {
            const stock = await squareService.getItemStock(
              creds.rows[0].square_access_token,
              creds.rows[0].square_location_id,
              squareItemId
            );
            if (stock !== null) {
              syncedStock = stock;
              lastEposSyncAt = new Date();
            }
          }
        }
      } catch (err) {
        console.error("[ProductService] Error syncing stock from Square during update:", err);
      }
    } else if (shouldSyncShopify && shopifyProductId) {
      try {
        const biz = await pool.query(
          `SELECT business_id FROM products WHERE id = $1`,
          [id]
        );
        if (biz.rows.length > 0) {
          const creds = await pool.query(
            `SELECT shopify_access_token, shopify_shop, shopify_sync_enabled FROM businesses WHERE id = $1`,
            [biz.rows[0].business_id]
          );
          if (creds.rows.length > 0 && creds.rows[0].shopify_sync_enabled && creds.rows[0].shopify_access_token && creds.rows[0].shopify_shop) {
            const stock = await shopifyService.getProductStock(
              creds.rows[0].shopify_access_token,
              creds.rows[0].shopify_shop,
              shopifyProductId
            );
            if (stock !== null) {
              syncedStock = stock;
              lastEposSyncAt = new Date();
            }
          }
        }
      } catch (err) {
        console.error("[ProductService] Error syncing stock from Shopify during update:", err);
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
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
    if (updates.shopifyProductId !== undefined) {
      fields.push(`shopify_product_id = $${paramCount++}`);
      values.push(updates.shopifyProductId || null);
    }
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
      businessId: row.business_id,
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
      shopifyProductId: row.shopify_product_id || null,
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
      businessId: row.business_id,
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

  async deleteProduct(id: string, businessId: string): Promise<boolean> {
    // Verify the product belongs to the business before deleting
    const checkResult = await pool.query(
      "SELECT id FROM products WHERE id = $1 AND business_id = $2",
      [id, businessId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error("Product not found or you don't have permission to delete it");
    }

    // Delete the product
    await pool.query("DELETE FROM products WHERE id = $1", [id]);
    return true;
  }

  async getBusinessIdByUserId(userId: string): Promise<string | undefined> {
    const result = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    return result.rows[0].id;
  }
}

export const productService = new ProductService();

