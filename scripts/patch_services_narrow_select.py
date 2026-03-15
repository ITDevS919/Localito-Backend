#!/usr/bin/env python3
"""Use narrow SELECT for services list (first image only) to reduce DB I/O for <3s cold."""
path = "src/routes/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_select = """    let query = `
      SELECT s.*, b.business_name as business_name, b.business_address, b.city
      FROM services s
      JOIN businesses b ON s.business_id = b.id
      WHERE s.is_approved = true AND b.is_approved = true
    `;"""

new_select = """    let query = `
      SELECT s.id, s.name, s.description, s.price, s.category, s.duration_minutes, s.max_participants,
             s.location_type, s.requires_staff, s.created_at, s.updated_at, s.business_id, s.is_approved,
             s.review_count, s.average_rating, (s.images)[1] as first_image, b.business_name as business_name,
             b.business_address, b.city
      FROM services s
      JOIN businesses b ON s.business_id = b.id
      WHERE s.is_approved = true AND b.is_approved = true
    `;"""

old_map = """    const listServices = result.rows.map((s) => {
      const first = s.images && s.images[0];
      let firstImageUrl = null;
      if (first) {
        if (first.startsWith("http://") || first.startsWith("https://")) firstImageUrl = first;
        else if (first.startsWith("/")) firstImageUrl = baseUrl + first;
        else if (first.startsWith("data:") && first.includes("base64,")) firstImageUrl = baseUrl + "/api/services/" + s.id + "/image/0";
        else firstImageUrl = baseUrl + "/api/services/" + s.id + "/image/0";
      }
      return { ...s, images: firstImageUrl ? [firstImageUrl] : [] };
    });"""

new_map = """    const listServices = result.rows.map((s) => {
      const first = s.first_image;
      let firstImageUrl = null;
      if (first) {
        if (first.startsWith("http://") || first.startsWith("https://")) firstImageUrl = first;
        else if (first.startsWith("/")) firstImageUrl = baseUrl + first;
        else if (first.startsWith("data:") && first.includes("base64,")) firstImageUrl = baseUrl + "/api/services/" + s.id + "/image/0";
        else firstImageUrl = baseUrl + "/api/services/" + s.id + "/image/0";
      }
      const { first_image: _drop, ...rest } = s;
      return { ...rest, images: firstImageUrl ? [firstImageUrl] : [] };
    });"""

if "first_image" in content and "(s.images)[1] as first_image" in content:
    print("Narrow select already present")
else:
    if old_select in content:
        content = content.replace(old_select, new_select, 1)
        print("Replaced with narrow SELECT")
    else:
        print("Could not find SELECT s.* block")
    if old_map in content:
        content = content.replace(old_map, new_map, 1)
        print("Replaced map to use first_image")
    else:
        print("Could not find listServices map block")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
