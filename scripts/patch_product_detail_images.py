#!/usr/bin/env python3
"""Patch GET /products/:id to return image URLs instead of base64 so detail page images load."""
path = "src/routes/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find GET /products/:id handler and add image URL mapping before geocode
old = """// Get product by ID (public)
router.get("/products/:id", async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    // Lazy geocode business so MapView has coordinates when only postcode/city are stored"""
new = """// Get product by ID (public). Return image URLs instead of base64 so detail page loads reliably.
router.get("/products/:id", async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const baseUrl = (process.env.BACKEND_URL || process.env.API_URL || (req.protocol + "://" + req.get("host"))).replace(/\\/$/, "");
    const rawImages = product.images || [];
    product.images = rawImages.map((img, i) => {
      if (!img) return "";
      if (img.startsWith("http://") || img.startsWith("https://")) return img;
      if (img.startsWith("/")) return baseUrl + img;
      if (img.startsWith("data:") && img.includes("base64,")) return baseUrl + "/api/products/" + product.id + "/image/" + i;
      return baseUrl + "/api/products/" + product.id + "/image/" + i;
    });
    // Lazy geocode business so MapView has coordinates when only postcode/city are stored"""

if "rawImages" in content and "Return image URLs instead of base64" in content and "product.images = rawImages.map" in content:
    print("Detail image URL mapping already present")
else:
    if old in content:
        content = content.replace(old, new, 1)
        print("Added image URL mapping to GET /products/:id")
    else:
        print("Could not find exact GET /products/:id block - check manually")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
