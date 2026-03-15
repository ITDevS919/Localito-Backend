#!/usr/bin/env python3
"""Add in-memory list cache to GET /products and GET /services on server."""
path = "src/routes/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1) Add import for listCache (after createNotification import)
import_line = "import { getCachedList, setCachedList } from '../middleware/listCache';"
if "listCache" not in content:
    content = content.replace(
        "import { createNotification, registerPushToken } from '../services/notificationService';",
        "import { createNotification, registerPushToken } from '../services/notificationService';\nimport { getCachedList, setCachedList } from '../middleware/listCache';",
        1
    )
    print("Added listCache import")
else:
    print("listCache import already present")

# 2) GET /products: after query destructuring, add cache check
old_products_start = """    const { category, search, businessId, businessType, location, latitude, longitude, radiusKm, page, limit } = req.query;
    
    let lat:"""

new_products_start = """    const { category, search, businessId, businessType, location, latitude, longitude, radiusKm, page, limit } = req.query;
    const queryForCache = { category, search, businessId, businessType, location, latitude, longitude, radiusKm, page, limit };
    const cached = getCachedList("products", queryForCache);
    if (cached) return res.json(cached);

    let lat:"""

if "const queryForCache = { category, search, businessId" not in content or "products" not in content.split("queryForCache")[1].split("getCachedList")[0]:
    # Try with console.log line present (server has it)
    alt_old = """    console.log(`[Products API] Request received with query params:`, req.query);
    const { category, search, businessId, businessType, location, latitude, longitude, radiusKm, page, limit } = req.query;
    
    let lat:"""
    alt_new = """    const { category, search, businessId, businessType, location, latitude, longitude, radiusKm, page, limit } = req.query;
    const queryForCache = { category, search, businessId, businessType, location, latitude, longitude, radiusKm, page, limit };
    const cached = getCachedList("products", queryForCache);
    if (cached) return res.json(cached);

    let lat:"""
    if alt_old in content:
        content = content.replace(alt_old, alt_new, 1)
        print("Added products cache check (with console.log removal)")
    elif old_products_start in content:
        content = content.replace(old_products_start, new_products_start, 1)
        print("Added products cache check")
else:
    print("Products cache check already present")

# 3) GET /products: before res.json, use response + setCachedList
old_products_res = """    res.json({ 
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

new_products_res = """    const response = {
      success: true,
      data: listProducts,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      }
    };
    setCachedList("products", queryForCache, response);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get all products for admin (admin only) - MUST be before /products/:id route"""

if "setCachedList(\"products\"" not in content and old_products_res in content:
    content = content.replace(old_products_res, new_products_res, 1)
    print("Added products cache set")
else:
    print("Products cache set already present or block not found")

# 4) GET /services: after query destructuring, add cache check
old_services_start = """router.get("/services", async (req, res, next) => {
  try {
    const { category, businessId, businessType, search } = req.query;
    let query = `"""

new_services_start = """router.get("/services", async (req, res, next) => {
  try {
    const { category, businessId, businessType, search } = req.query;
    const queryForCache = { category, businessId, businessType, search };
    const cached = getCachedList("services", queryForCache);
    if (cached) return res.json(cached);

    let query = `"""

if "setCachedList(\"services\"" not in content and old_services_start in content:
    content = content.replace(old_services_start, new_services_start, 1)
    print("Added services cache check")
else:
    print("Services cache check already present or block not found")

# 5) GET /services: before res.json, use response + setCachedList
old_services_res = """    res.json({ success: true, data: listServices });
  } catch (error) {
    next(error);
  }
});

// Get pending services (admin only) - MUST be before /services/:id route"""

new_services_res = """    const response = { success: true, data: listServices };
    setCachedList("services", queryForCache, response);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get pending services (admin only) - MUST be before /services/:id route"""

if "setCachedList(\"services\"" not in content and "res.json({ success: true, data: listServices });" in content:
    content = content.replace(old_services_res, new_services_res, 1)
    print("Added services cache set")
else:
    print("Services cache set already present or block not found")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
