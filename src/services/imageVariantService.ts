import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const heicConvert = require("heic-convert");

const MANAGED_PREFIX = "/uploads/media";
const PUBLIC_UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads");
const MANAGED_ROOT_DIR = path.join(PUBLIC_UPLOADS_DIR, "media");

type VariantName = "thumb" | "card" | "detail" | "original";

const VARIANT_WIDTHS: Record<Exclude<VariantName, "original">, number> = {
  thumb: 300,
  card: 600,
  detail: 1200,
};

export function ensureManagedUploadDir(): void {
  fs.mkdirSync(MANAGED_ROOT_DIR, { recursive: true });
}

export function isManagedLocalImagePath(value: string | null | undefined): boolean {
  return !!value && value.startsWith(`${MANAGED_PREFIX}/`);
}

export function getManagedVariantPath(value: string, variant: VariantName): string {
  if (!isManagedLocalImagePath(value)) return value;
  const dir = value.replace(/\/[^/]+$/, "");
  const file =
    variant === "original"
      ? "original.webp"
      : `${variant}_${VARIANT_WIDTHS[variant]}.webp`;
  return `${dir}/${file}`;
}

export function toAbsoluteImageUrl(
  source: string,
  origin: string,
  variant: VariantName = "original"
): string {
  if (!source) return source;
  if (source.startsWith("http://") || source.startsWith("https://")) return source;
  if (isManagedLocalImagePath(source)) return `${origin}${getManagedVariantPath(source, variant)}`;
  if (source.startsWith("/")) return `${origin}${source}`;
  return source;
}

async function writeWebp(buffer: Buffer, targetPath: string, maxWidth?: number, quality: number = 82) {
  const attemptWrite = async (input: Buffer) => {
    let pipeline = sharp(input).rotate();
    if (maxWidth) {
      pipeline = pipeline.resize(maxWidth, maxWidth, { fit: "inside", withoutEnlargement: true });
    }
    await pipeline.webp({ quality }).toFile(targetPath);
  };

  try {
    await attemptWrite(await normalizeImageBuffer(buffer));
  } catch (error) {
    const converted = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.92,
    });
    await attemptWrite(Buffer.from(converted));
  }
}

async function normalizeImageBuffer(buffer: Buffer): Promise<Buffer> {
  try {
    await sharp(buffer).metadata();
    return buffer;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("heif") && !message.includes("heic")) {
      throw error;
    }
    const converted = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.92,
    });
    return Buffer.from(converted);
  }
}

export async function saveManagedImageBuffer(
  buffer: Buffer,
  assetId: string = crypto.randomUUID()
): Promise<string> {
  ensureManagedUploadDir();
  const assetDir = path.join(MANAGED_ROOT_DIR, assetId);
  fs.mkdirSync(assetDir, { recursive: true });

  const originalPath = path.join(assetDir, "original.webp");
  const thumbPath = path.join(assetDir, "thumb_300.webp");
  const cardPath = path.join(assetDir, "card_600.webp");
  const detailPath = path.join(assetDir, "detail_1200.webp");

  await writeWebp(buffer, originalPath, undefined, 88);
  await writeWebp(buffer, thumbPath, VARIANT_WIDTHS.thumb, 68);
  await writeWebp(buffer, cardPath, VARIANT_WIDTHS.card, 76);
  await writeWebp(buffer, detailPath, VARIANT_WIDTHS.detail, 82);

  return `${MANAGED_PREFIX}/${assetId}/original.webp`;
}

export async function saveManagedImageDataUrl(dataUrl: string): Promise<string | null> {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  return saveManagedImageBuffer(buffer);
}

export async function migrateExistingUploadToManaged(localUploadPath: string): Promise<string | null> {
  if (!localUploadPath.startsWith("/uploads/")) return null;
  const relative = localUploadPath.replace(/^\/uploads\//, "");
  const fullPath = path.join(PUBLIC_UPLOADS_DIR, relative);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) return null;
  const buffer = await fs.promises.readFile(fullPath);
  return saveManagedImageBuffer(buffer);
}
