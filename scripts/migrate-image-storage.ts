import { pool } from "../src/db/connection";
import {
  isManagedLocalImagePath,
  migrateExistingUploadToManaged,
  saveManagedImageDataUrl,
} from "../src/services/imageVariantService";

type Row = {
  id: string;
  images: string[] | null;
};

async function migrateRowImages(images: string[] | null): Promise<{ images: string[]; changed: boolean }> {
  if (!images || images.length === 0) return { images: [], changed: false };

  let changed = false;
  const migrated = await Promise.all(
    images.map(async (img) => {
      try {
        if (!img) return img;
        if (img.startsWith("http://") || img.startsWith("https://") || isManagedLocalImagePath(img)) {
          return img;
        }
        if (img.startsWith("data:") && img.includes("base64,")) {
          const next = await saveManagedImageDataUrl(img);
          if (next) {
            changed = true;
            return next;
          }
          return img;
        }
        if (img.startsWith("/uploads/")) {
          const next = await migrateExistingUploadToManaged(img);
          if (next) {
            changed = true;
            return next;
          }
        }
        return img;
      } catch (error) {
        console.error("[migrate-image-storage] Skipping image due to error:", error);
        return img;
      }
    })
  );

  return { images: migrated, changed };
}

async function migrateTable(tableName: "products" | "services") {
  const result = await pool.query<Row>(`SELECT id, images FROM ${tableName} WHERE images IS NOT NULL`);
  let updated = 0;

  for (const row of result.rows) {
    const { images, changed } = await migrateRowImages(row.images);
    if (!changed) continue;

    await pool.query(`UPDATE ${tableName} SET images = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
      images,
      row.id,
    ]);
    updated++;
    console.log(`[migrate-image-storage] Updated ${tableName}/${row.id}`);
  }

  console.log(`[migrate-image-storage] ${tableName}: ${updated}/${result.rows.length} rows updated`);
}

async function main() {
  console.log("[migrate-image-storage] Starting migration...");
  await migrateTable("products");
  await migrateTable("services");
  await pool.end();
  console.log("[migrate-image-storage] Done");
}

main().catch(async (error) => {
  console.error("[migrate-image-storage] Failed:", error);
  await pool.end();
  process.exit(1);
});
