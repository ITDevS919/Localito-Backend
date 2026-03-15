#!/usr/bin/env python3
"""Patch routes/index.ts: add GET /products/:id/image/:index and list image URL mapping."""
import re

path = "src/routes/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1) Insert product image route before "// Get product by ID (public)"
image_route = r'''// Serve a single product image by index (list uses URL instead of inline base64)
router.get("/products/:id/image/:index", async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const images = (product && product.images) || [];
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

marker = "// Get product by ID (public)"
if marker in content and "router.get(\"/products/:id/image/:index\"" not in content:
    content = content.replace(marker, image_route + marker, 1)
    print("Inserted product image route")
else:
    print("Product image route already present or marker not found")

# 2) Replace list response: add baseUrl + listProducts mapping, use listProducts in res.json
old_block = """    });
    
    res.json({ 
      success: true, 
      data: result.products,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all products for admin (admin only) - MUST be before /products/:id route"""

new_block = """    });
    const baseUrl = (process.env.BACKEND_URL || process.env.API_URL || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "");
    const listProducts = result.products.map((p) => {
      const first = p.images && p.images[0];
      let firstImageUrl = null;
      if (first) {
        if (first.startsWith("http://") || first.startsWith("https://")) firstImageUrl = first;
        else if (first.startsWith("/")) firstImageUrl = baseUrl + first;
        else if (first.startsWith("data:") && first.includes("base64,")) firstImageUrl = baseUrl + "/api/products/" + p.id + "/image/0";
        else firstImageUrl = baseUrl + "/api/products/" + p.id + "/image/0";
      }
      return { ...p, images: firstImageUrl ? [firstImageUrl] : [] };
    });
    res.json({ 
      success: true, 
      data: listProducts,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all products for admin (admin only) - MUST be before /products/:id route"""

if "data: result.products," in content and "const listProducts = result.products.map" not in content:
    content = content.replace(old_block, new_block, 1)
    print("Added list image URL mapping")
else:
    print("List mapping already present or block not found")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
