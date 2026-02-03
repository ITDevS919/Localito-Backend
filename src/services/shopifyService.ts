/**
 * Shopify integration for Localito: OAuth, product list, and connection validation.
 * Uses Shopify Admin REST API (no embedded app / session token).
 */

const SHOPIFY_API_VERSION = "2024-01";
const DEFAULT_SCOPES = "read_products,read_inventory,read_locations,read_orders,write_orders";

function getApiKey(): string {
  const key = process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID;
  if (!key) throw new Error("SHOPIFY_API_KEY or SHOPIFY_CLIENT_ID is required");
  return key;
}

function getApiSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET or SHOPIFY_CLIENT_SECRET is required");
  return secret;
}

/**
 * Normalize shop domain to myshopify.com format (exported for use in OAuth callback)
 */
export function normalizeShop(shop: string): string {
  const s = shop.trim().toLowerCase();
  if (s.endsWith(".myshopify.com")) return s;
  return `${s.replace(/\.myshopify\.com$/i, "").replace(/^https?:\/\//, "").split("/")[0]}.myshopify.com`;
}

/**
 * Build Shopify OAuth authorization URL for the merchant to install/authorize the app
 */
export function getAuthUrl(shop: string, state: string, redirectUri: string): string {
  const normalized = normalizeShop(shop);
  const clientId = getApiKey();
  const scopes = process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${normalized}/admin/oauth/authorize?${params.toString()}`;
}

/** Error thrown when Shopify token exchange fails; body may contain error from Shopify */
export class ShopifyTokenError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
    this.name = "ShopifyTokenError";
  }
}

/**
 * Exchange authorization code for a permanent access token
 */
export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const normalized = normalizeShop(shop);
  const clientId = getApiKey();
  const clientSecret = getApiSecret();
  const url = `https://${normalized}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ShopifyTokenError(
      `Shopify token exchange failed: ${res.status} ${text}`,
      res.status,
      text
    );
  }
  let data: { access_token?: string };
  try {
    data = JSON.parse(text) as { access_token?: string };
  } catch {
    throw new ShopifyTokenError("Shopify returned invalid JSON", res.status, text);
  }
  if (!data.access_token) {
    throw new ShopifyTokenError("Shopify did not return an access token", res.status, text);
  }
  return data.access_token;
}

/**
 * Validate connection by fetching shop info
 */
export async function validateConnection(accessToken: string, shop: string): Promise<boolean> {
  try {
    const normalized = normalizeShop(shop);
    const url = `https://${normalized}/admin/api/${SHOPIFY_API_VERSION}/shop.json`;
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { shop?: unknown };
    return !!data.shop;
  } catch (err) {
    console.error("[Shopify] Connection validation failed:", err);
    return false;
  }
}

export interface ShopifyProductItem {
  id: string;
  name: string;
  price?: number;
  variantId?: string;
}

/**
 * List products from Shopify store (Admin API)
 */
export async function getProducts(accessToken: string, shop: string): Promise<ShopifyProductItem[]> {
  const normalized = normalizeShop(shop);
  const url = `https://${normalized}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify products fetch failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { products?: Array<{ id: number; title: string; variants?: Array<{ id: number; price: string }> }> };
  const products = data.products || [];
  return products.map((p) => {
    const variant = p.variants?.[0];
    const price = variant?.price ? parseFloat(variant.price) : undefined;
    return {
      id: String(p.id),
      name: p.title || "Untitled",
      price,
      variantId: variant ? String(variant.id) : undefined,
    };
  });
}

/**
 * Get product details (price, inventory) for a single Shopify product
 */
export async function getProductDetails(
  accessToken: string,
  shop: string,
  productId: string
): Promise<{ price: number | null; stock: number | null }> {
  const normalized = normalizeShop(shop);
  const url = `https://${normalized}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) return { price: null, stock: null };
  const data = (await res.json()) as {
    product?: {
      variants?: Array<{ price: string; inventory_item_id?: number }>;
    };
  };
  const product = data.product;
  if (!product?.variants?.length) return { price: null, stock: null };
  const price = parseFloat(product.variants[0].price) || null;
  const stock = await getItemStock(accessToken, normalized, product.variants[0].inventory_item_id);
  return { price, stock: stock !== null ? stock : 0 };
}

/**
 * Get inventory quantity for a Shopify product (first variant's inventory_item_id)
 * Used for stock sync like Square.
 */
export async function getItemStock(
  accessToken: string,
  shop: string,
  inventoryItemId: number | undefined
): Promise<number | null> {
  if (inventoryItemId == null) return null;
  const normalized = normalizeShop(shop);
  const url = `https://${normalized}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { inventory_levels?: Array<{ available?: number }> };
  const levels = data.inventory_levels || [];
  if (levels.length === 0) return null;
  const total = levels.reduce((sum, l) => sum + (l.available ?? 0), 0);
  return total;
}

/**
 * Sync stock for a product linked to Shopify (by product id).
 * Fetches product to get first variant's inventory_item_id, then inventory_levels.
 */
export async function getProductStock(
  accessToken: string,
  shop: string,
  shopifyProductId: string
): Promise<number | null> {
  const normalized = normalizeShop(shop);
  const productUrl = `https://${normalized}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json?fields=id,variants`;
  const res = await fetch(productUrl, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { product?: { variants?: Array<{ inventory_item_id?: number }> } };
  const variant = data.product?.variants?.[0];
  if (!variant?.inventory_item_id) return null;
  return getItemStock(accessToken, normalized, variant.inventory_item_id);
}

/**
 * Sync stock for a Localito product by id (looks up business Shopify creds and product's shopify_product_id).
 * Mirrors squareService.syncProductStock for use in productService.
 */
export async function syncProductStock(productId: string): Promise<{ success: boolean; stock: number | null; error?: string }> {
  const { pool } = await import("../db/connection");
  try {
    const productResult = await pool.query(
      `SELECT p.id, p.shopify_product_id, p.sync_from_epos, b.shopify_access_token, b.shopify_shop, b.shopify_sync_enabled
       FROM products p
       JOIN businesses b ON p.business_id = b.id
       WHERE p.id = $1`,
      [productId]
    );
    if (productResult.rows.length === 0) {
      return { success: false, stock: null, error: "Product not found" };
    }
    const product = productResult.rows[0];
    if (!product.sync_from_epos || !product.shopify_sync_enabled) {
      return { success: false, stock: null, error: "EPOS sync not enabled for this product" };
    }
    if (!product.shopify_product_id) {
      return { success: false, stock: null, error: "Shopify product ID not configured" };
    }
    if (!product.shopify_access_token || !product.shopify_shop) {
      return { success: false, stock: null, error: "Business Shopify connection not configured" };
    }
    const stock = await getProductStock(
      product.shopify_access_token,
      product.shopify_shop,
      product.shopify_product_id
    );
    if (stock === null) {
      return { success: false, stock: null, error: "Failed to fetch stock from Shopify" };
    }
    await pool.query(
      `UPDATE products SET stock = $1, last_epos_sync_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [stock, productId]
    );
    return { success: true, stock };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Shopify] Error syncing product stock for", productId, err);
    return { success: false, stock: null, error: message };
  }
}
