import { SquareClient, SquareEnvironment } from 'square';
import { pool } from "../db/connection";

// Simple in-memory cache for stock values with TTL
interface StockCacheEntry {
  stock: number;
  timestamp: number;
}

const stockCache = new Map<string, StockCacheEntry>();
const CACHE_TTL = parseInt(process.env.SQUARE_STOCK_SYNC_CACHE_TTL || "60") * 1000; // Convert to milliseconds

export class SquareService {
  /**
   * Get Square client instance for a retailer
   */
  private getClient(accessToken: string, environment: SquareEnvironment = SquareEnvironment.Production): SquareClient {
    return new SquareClient({
      token: accessToken,
      environment: environment,
    });
  }

  /**
   * Validate Square connection by fetching location info
   */
  async validateConnection(accessToken: string, locationId: string): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.locations.get({ locationId });
      
      if (response.location) {
        return true;
      }
      return false;
    } catch (error) {
      console.error("[Square] Connection validation failed:", error);
      return false;
    }
  }

  /**
   * Get stock quantity for a Square catalog item
   */
  async getItemStock(accessToken: string, locationId: string, squareItemId: string): Promise<number | null> {
    try {
      // Check cache first
      const cacheKey = `${locationId}:${squareItemId}`;
      const cached = stockCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.stock;
      }

      const client = this.getClient(accessToken);

      // Get inventory counts for the item at the location
      // Use listInventoryCounts to retrieve counts by location and catalog object
      const response = await client.inventory.get({
        locationIds: locationId,
        catalogObjectId: squareItemId,
      });      
      // If no inventory count found, return 0
      return 0;
    } catch (error: any) {
      console.error(`[Square] Failed to get stock for item ${squareItemId}:`, error);
      
      // If we have cached value, return it as fallback
      const cacheKey = `${locationId}:${squareItemId}`;
      const cached = stockCache.get(cacheKey);
      if (cached) {
        console.warn(`[Square] Using cached stock value for ${squareItemId}`);
        return cached.stock;
      }
      
      return null;
    }
  }

  /**
   * Sync stock for a single product from Square
   */
  async syncProductStock(productId: string): Promise<{ success: boolean; stock: number | null; error?: string }> {
    try {
      // Get product with retailer info
      const productResult = await pool.query(
        `SELECT p.id, p.square_item_id, p.sync_from_epos, r.square_access_token, r.square_location_id, r.square_sync_enabled
         FROM products p
         JOIN retailers r ON p.retailer_id = r.id
         WHERE p.id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        return { success: false, stock: null, error: "Product not found" };
      }

      const product = productResult.rows[0];

      // Check if sync is enabled
      if (!product.sync_from_epos || !product.square_sync_enabled) {
        return { success: false, stock: null, error: "EPOS sync not enabled for this product" };
      }

      if (!product.square_item_id) {
        return { success: false, stock: null, error: "Square Item ID not configured" };
      }

      if (!product.square_access_token || !product.square_location_id) {
        return { success: false, stock: null, error: "Retailer Square connection not configured" };
      }

      // Fetch stock from Square
      const stock = await this.getItemStock(
        product.square_access_token,
        product.square_location_id,
        product.square_item_id
      );

      if (stock === null) {
        return { success: false, stock: null, error: "Failed to fetch stock from Square" };
      }

      // Update product stock in database
      await pool.query(
        `UPDATE products 
         SET stock = $1, last_epos_sync_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [stock, productId]
      );

      return { success: true, stock };
    } catch (error: any) {
      console.error(`[Square] Error syncing product stock for ${productId}:`, error);
      return { success: false, stock: null, error: error.message || "Unknown error" };
    }
  }

  /**
   * Clear cache for a specific item (useful after manual stock updates)
   */
  clearCache(locationId: string, squareItemId: string): void {
    const cacheKey = `${locationId}:${squareItemId}`;
    stockCache.delete(cacheKey);
  }

  /**
   * Clear all cache (useful for testing or manual refresh)
   */
  clearAllCache(): void {
    stockCache.clear();
  }

  /**
   * Get list of catalog items from Square
   */
  async getCatalogItems(accessToken: string, locationId: string): Promise<Array<{ id: string; name: string; price?: number }>> {
    try {
      const client = this.getClient(accessToken);
      
      // List catalog items - filter by ITEM type
      const response = await client.catalog.list({
        types: 'ITEM',
      });

      if (response.data.length === 0) {
        return [];
      }

      // Map to simplified format (already filtered by ITEM type, but double-check)
      const items = response.data
        .filter((obj: any) => obj.type === 'ITEM')
        .map((obj: any) => {
          const itemData = obj.itemData;
          const price = itemData?.variations?.[0]?.itemVariationData?.priceMoney?.amount 
            ? Number(itemData.variations[0].itemVariationData.priceMoney.amount) / 100 // Convert bigint to number, then cents to dollars
            : undefined;
          
          return {
            id: obj.id,
            name: itemData?.name || 'Unnamed Item',
            price,
          };
        });

      return items;
    } catch (error: any) {
      console.error('[Square] Failed to get catalog items:', error);
      throw error;
    }
  }

  /**
   * Get item details (price, stock) from Square
   */
  async getItemDetails(accessToken: string, locationId: string, squareItemId: string): Promise<{ price: number | null; stock: number | null }> {
    try {
      const client = this.getClient(accessToken);
      
      // Get catalog object details
      const catalogResponse = await client.catalog.object.get({ 
        objectId: squareItemId
      });
      
      let price: number | null = null;
      const data = catalogResponse.object
      if (data && data.type === 'ITEM_VARIATION' && data.itemVariationData?.priceMoney) {
        // Get price from first variation
        const priceMoney = data.itemVariationData?.priceMoney;
        price = priceMoney.amount ? Number(priceMoney.amount) / 100 : null; // Convert bigint to number, then cents to dollars
      }

      // Get stock
      const stock = await this.getItemStock(accessToken, locationId, squareItemId);

      return { price, stock: stock !== null ? stock : 0 };
    } catch (error: any) {
      console.error(`[Square] Failed to get item details for ${squareItemId}:`, error);
      return { price: null, stock: null };
    }
  }
}

export const squareService = new SquareService();

