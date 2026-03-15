import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const THUMB_WIDTH = 300;
const THUMB_QUALITY = 60;
const DETAIL_MAX_WIDTH = 1200; // High-res for detail/gallery; smaller than full 3MB
const cache = new Map<string, Buffer>();
const MAX_CACHE = 500;

/** Resize base64 image; returns Buffer for JPEG. Use width or default 300 for thumb. */
export async function resizeBase64(
  base64DataUrl: string,
  maxWidth: number = THUMB_WIDTH,
  quality: number = maxWidth <= 300 ? THUMB_QUALITY : 82
): Promise<Buffer | null> {
  if (!base64DataUrl || !base64DataUrl.includes("base64,")) return null;
  const cacheKey = `${base64DataUrl.substring(0, 60)}_w${maxWidth}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const match = base64DataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!match) return null;
    const buf = Buffer.from(match[1], "base64");
    const out = await sharp(buf)
      .resize(maxWidth, maxWidth, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (cache.size >= MAX_CACHE) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(cacheKey, out);
    return out;
  } catch {
    return null;
  }
}

export async function makeThumb(base64DataUrl: string): Promise<string> {
  if (!base64DataUrl) return "";
  // Pass through URLs; only process base64 data URLs
  if (base64DataUrl.startsWith("http://") || base64DataUrl.startsWith("https://") || base64DataUrl.startsWith("/")) {
    return base64DataUrl;
  }

  const out = await resizeBase64(base64DataUrl, THUMB_WIDTH, THUMB_QUALITY);
  if (!out) return base64DataUrl;
  return "data:image/jpeg;base64," + out.toString("base64");
}
