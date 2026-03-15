/**
 * Cloudinary integration for image upload and URL transformation.
 * When CLOUDINARY_CLOUD_NAME is set, uploads go to Cloudinary (CDN).
 * Cloudinary URLs support on-the-fly transforms: w_300 for list, w_1200 for detail.
 * @see https://cloudinary.com/documentation/node_integration
 */

import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const hasCloudinary = !!cloudName;

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/** Check if Cloudinary is configured. */
export function isCloudinaryEnabled(): boolean {
  return hasCloudinary;
}

/** Upload a file buffer to Cloudinary. Returns secure_url or null. */
export async function uploadImage(
  buffer: Buffer,
  folder: string = "localito"
): Promise<string | null> {
  if (!hasCloudinary) return null;
  try {
    return new Promise((resolve) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (err, result) => {
          if (err) {
            console.error("[Cloudinary] Upload error:", err);
            resolve(null);
            return;
          }
          resolve(result?.secure_url ?? null);
        }
      );
      uploadStream.end(buffer);
    });
  } catch (e) {
    console.error("[Cloudinary] Upload failed:", e);
    return null;
  }
}

/**
 * Build a Cloudinary transform URL for display.
 * Example: https://res.cloudinary.com/xxx/image/upload/v1/sample.jpg
 *      -> https://res.cloudinary.com/xxx/image/upload/w_800,f_auto,q_auto/v1/sample.jpg
 */
export function transformCloudinaryUrl(
  url: string,
  options: { width?: number; height?: number; quality?: "auto" | number } = {}
): string {
  if (!url || !url.includes("res.cloudinary.com")) return url;
  const { width = 0, height = 0, quality = "auto" } = options;
  const parts: string[] = [];
  if (width > 0) parts.push(`w_${width}`);
  if (height > 0) parts.push(`h_${height}`);
  parts.push("f_auto", "q_auto");
  const transform = parts.join(",");
  // Insert transform after /upload/ and before version or path
  return url.replace("/image/upload/", `/image/upload/${transform}/`);
}
