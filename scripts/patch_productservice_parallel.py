#!/usr/bin/env python3
"""Replace sequential count+data with parallel queries in productService for <3s cold load."""
path = "src/services/productService.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_block = """    } else {
      // Get total count first (before pagination) for non-radius searches
      const countQuery = query
        .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ORDER BY.*$/, '')
        .replace(/LIMIT.*$/, '')
        .replace(/OFFSET.*$/, '');

      const countParams = [...params];
      try {
      const countResult = await pool.query(countQuery, countParams);
        if (!countResult.rows || countResult.rows.length === 0) {
          console.error('[ProductService] Count query returned no rows. Query:', countQuery);
          total = 0;
        } else {
      total = parseInt(countResult.rows[0].total) || 0;
        }
      } catch (error) {
        console.error('[ProductService] Error executing count query:', error);
        console.error('[ProductService] Count query:', countQuery);
        console.error('[ProductService] Count params:', countParams);
        total = 0;
      }

    // Add pagination to main query
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    paramCount += 2;

    console.log(`[ProductService] Final query:`, query);
    console.log(`[ProductService] Query params:`, params);
    result = await pool.query(query, params);
    console.log(`[ProductService] Query returned ${result.rows.length} rows`);
    }"""

new_block = """    } else {
      // Run count and data in parallel for cold load <3s target
      const countQuery = query
        .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ORDER BY.*$/, '')
        .replace(/LIMIT.*$/, '')
        .replace(/OFFSET.*$/, '');

      const countParams = [...params];
      const dataQuery = query + ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      const dataParams = [...params, limit, offset];

      try {
        const [countResult, dataResult] = await Promise.all([
          pool.query(countQuery, countParams),
          pool.query(dataQuery, dataParams),
        ]);
        total = countResult?.rows?.[0] ? parseInt(countResult.rows[0].total) || 0 : 0;
        result = dataResult;
      } catch (error) {
        console.error('[ProductService] Error in count or data query:', error);
        total = 0;
        result = { rows: [] };
      }
    }"""

if "Promise.all([" in content and "countResult, dataResult" in content:
    print("Parallel queries already present")
else:
    content = content.replace(old_block, new_block, 1)
    print("Replaced with parallel count+data")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
print("Done")
