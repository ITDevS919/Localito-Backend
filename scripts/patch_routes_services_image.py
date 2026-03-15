#!/usr/bin/env python3
"""Patch routes: add GET /services/:id/image/:index and services list first-image URL only."""
path = "src/routes/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1) Insert service image route before "// Get service by ID (public)"
service_image_route = r'''// Serve a single service image by index (list uses URL instead of inline base64)
router.get("/services/:id/image/:index", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT images FROM services WHERE id = $1 AND is_approved = true",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }
    const images = result.rows[0].images || [];
    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= images.length) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    const img = images[idx];
    if (img.startsWith("data:") && img.includes("base64,")) {
      const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      const mimeMatch = img.match(/^data:(image\/\w+);/);
      res.setHeader("Content-Type", mimeMatch ? mimeMatch[1] : "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
      return;
    }
    if (img.startsWith("http://") || img.startsWith("https://")) {
      return res.redirect(302, img);
    }
    if (img.startsWith("/")) {
      const baseUrl = (process.env.BACKEND_URL || process.env.API_URL || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "");
      return res.redirect(302, baseUrl + img);
    }
    res.status(404).json({ success: false, message: "Image not found" });
  } catch (error) {
    next(error);
  }
});

'''

marker = "// Get service by ID (public)"
if marker in content and 'router.get("/services/:id/image/:index"' not in content:
    content = content.replace(marker, service_image_route + marker, 1)
    print("Inserted service image route")
else:
    print("Service image route already present or marker not found")

# 2) Replace GET /services list to return first image URL only (not full base64)
old_services = """    query += ` ORDER BY s.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get pending services (admin only) - MUST be before /services/:id route"""

new_services = """    query += ` ORDER BY s.created_at DESC`;

    const result = await pool.query(query, params);
    const baseUrl = (process.env.BACKEND_URL || process.env.API_URL || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "");
    const listServices = result.rows.map((s) => {
      const first = s.images && s.images[0];
      let firstImageUrl = null;
      if (first) {
        if (first.startsWith("http://") || first.startsWith("https://")) firstImageUrl = first;
        else if (first.startsWith("/")) firstImageUrl = baseUrl + first;
        else if (first.startsWith("data:") && first.includes("base64,")) firstImageUrl = baseUrl + "/api/services/" + s.id + "/image/0";
        else firstImageUrl = baseUrl + "/api/services/" + s.id + "/image/0";
      }
      return { ...s, images: firstImageUrl ? [firstImageUrl] : [] };
    });
    res.json({ success: true, data: listServices });
  } catch (error) {
    next(error);
  }
});

// Get pending services (admin only) - MUST be before /services/:id route"""

if "res.json({ success: true, data: result.rows });" in content and "const listServices = result.rows.map" not in content:
    # Replace only in the GET /services handler (first occurrence that has the ORDER BY s.created_at above it)
    content = content.replace(old_services, new_services, 1)
    print("Added services list image URL mapping")
else:
    print("Services list mapping already present or block not found")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
