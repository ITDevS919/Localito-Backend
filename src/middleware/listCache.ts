/**
 * In-memory cache for public list endpoints (GET /products, GET /services).
 * Short TTL to reduce DB load and improve response time for repeat requests.
 * See docs/PERFORMANCE_OPTIONS_DIGITALOCEAN.md
 */

const TTL_MS = 3 * 60 * 1000; // 3 minutes – repeat visits stay fast

interface Entry {
  body: unknown;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

function cacheKey(prefix: string, query: Record<string, unknown>): string {
  const sorted = Object.keys(query)
    .sort()
    .filter((k) => query[k] !== undefined && query[k] !== "")
    .map((k) => `${k}=${String(query[k])}`)
    .join("&");
  return `${prefix}:${sorted || "_"}`;
}

export function getCachedList<T>(prefix: string, query: Record<string, unknown>): T | null {
  const key = cacheKey(prefix, query);
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.body as T;
}

export function setCachedList(
  prefix: string,
  query: Record<string, unknown>,
  body: unknown
): void {
  const key = cacheKey(prefix, query);
  cache.set(key, {
    body,
    expiresAt: Date.now() + TTL_MS,
  });
  // Prevent unbounded growth: if cache has many keys, drop a few old ones
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt < now) cache.delete(k);
      if (cache.size <= 150) break;
    }
  }
}
