#!/usr/bin/env python3
"""Add LIMIT to GET /services list and include limit in cache key (for <3s cold)."""
import re
path = "src/routes/index.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Add limit to destructuring and cache key (services GET block - use distinctive string)
old1 = "const { category, businessId, businessType, search } = req.query;\n    const queryForCache = { category, businessId, businessType, search };"
new1 = "const { category, businessId, businessType, search, limit: limitQuery } = req.query;\n    const queryForCache = { category, businessId, businessType, search, limit: limitQuery };"
# Only replace the first occurrence that's in the services GET (before "let query = `" with services)
if new1 not in content:
    content = content.replace(
        "const { category, businessId, businessType, search } = req.query;\n    const queryForCache = { category, businessId, businessType, search };",
        new1,
        1
    )
    print("Added limit to queryForCache")
else:
    print("queryForCache already has limit")

# Add LIMIT to services query - match the block that has ORDER BY s.created_at DESC then const result = await pool.query(query, params) for services
old2 = """    query += ` ORDER BY s.created_at DESC`;

    const result = await pool.query(query, params);
    const baseUrl = (process.env.BACKEND_URL"""
new2 = """    query += ` ORDER BY s.created_at DESC`;

    const limitNum = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 100);
    query += ` LIMIT $${paramCount + 1}`;
    params.push(limitNum);

    const result = await pool.query(query, params);
    const baseUrl = (process.env.BACKEND_URL"""

if "const limitNum = Math.min" not in content or content.count("const limitNum") < 2:
    # Check if this exact block exists (services one has baseUrl next)
    if old2 in content:
        content = content.replace(old2, new2, 1)
        print("Added LIMIT to services query")
    else:
        print("Could not find services ORDER BY block - check manually")
else:
    print("Services LIMIT already present")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
