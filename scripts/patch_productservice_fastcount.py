#!/usr/bin/env python3
"""Add fast count path for simple public list (no filters) to hit <3s cold."""
path = "src/services/productService.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_block = """    } else {
      // Run count and data in parallel for cold load <3s target
      const countQuery = query
        .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ORDER BY.*$/, '')
        .replace(/LIMIT.*$/, '')
        .replace(/OFFSET.*$/, '');

      const countParams = [...params];"""

new_block = """    } else {
      // Run count and data in parallel. Use fast count for simple public list (no filters) to hit <3s cold.
      const isSimpleList =
        !filters?.location &&
        !filters?.search &&
        !filters?.category &&
        !filters?.businessId &&
        !filters?.businessTypeCategoryId &&
        filters?.isApproved === true;

      const countQuery = isSimpleList
        ? `SELECT COUNT(*) as total FROM products p JOIN businesses b ON p.business_id = b.id WHERE p.is_approved = true AND b.is_suspended = false`
        : query
            .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
            .replace(/ORDER BY.*$/, '')
            .replace(/LIMIT.*$/, '')
            .replace(/OFFSET.*$/, '');

      const countParams = isSimpleList ? [] : [...params];"""

if "isSimpleList" in content:
    print("Fast count already present")
else:
    content = content.replace(old_block, new_block, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added fast count for simple list")
print("Done")
