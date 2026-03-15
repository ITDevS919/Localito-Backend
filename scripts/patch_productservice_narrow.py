#!/usr/bin/env python3
"""Add narrow data query for simple products list (first image only) to hit <3s cold."""
path = "src/services/productService.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_data = """      const countParams = isSimpleList ? [] : [...params];
      const dataQuery = query + ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      const dataParams = [...params, limit, offset];"""

new_data = """      const countParams = isSimpleList ? [] : [...params];
      const dataQuery = isSimpleList
        ? `SELECT p.id, p.business_id, p.name, p.description, p.price, p.stock, p.category, (p.images)[1] as first_image, p.is_approved, p.created_at, p.updated_at, p.sync_from_epos, p.square_item_id, p.shopify_product_id, p.last_epos_sync_at, b.business_name as business_name, b.postcode, b.city, b.latitude, b.longitude, u.username as business_username, COALESCE(p.review_count, 0) as review_count, COALESCE(p.average_rating, 0) as average_rating, b.square_sync_enabled, b.square_access_token, b.square_location_id, b.shopify_sync_enabled, b.shopify_access_token, b.shopify_shop FROM products p JOIN businesses b ON p.business_id = b.id JOIN users u ON b.user_id = u.id WHERE p.is_approved = true AND b.is_suspended = false ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`
        : query + ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      const dataParams = isSimpleList ? [limit, offset] : [...params, limit, offset];"""

old_images = "images: row.images || []"
new_images = "images: row.first_image !== undefined ? (row.first_image ? [row.first_image] : []) : (row.images || [])"

if "first_image" in content and "isSimpleList ? `SELECT" in content:
    print("Narrow data query already present")
else:
    if old_data in content:
        content = content.replace(old_data, new_data, 1)
        print("Added narrow data query for simple list")
    else:
        print("Could not find dataQuery block")

if "row.first_image !== undefined" in content:
    print("Images mapping already updated")
else:
    if old_images in content:
        content = content.replace(old_images, new_images, 1)
        print("Updated images mapping for first_image")
    else:
        print("Could not find images mapping")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
