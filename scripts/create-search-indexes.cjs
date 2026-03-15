// One-off: enable pg_trgm and create GIN indexes for product/service search (ILIKE).
// Run on server from server dir: node scripts/create-search-indexes.cjs
// DigitalOcean: enable "pg_trgm" in DB cluster if the extension fails.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    console.log('pg_trgm extension enabled');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_name_gin ON products USING gin (name gin_trgm_ops)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_products_description_gin ON products USING gin (description gin_trgm_ops)');
    console.log('Products search indexes created');
    await client.query('CREATE INDEX IF NOT EXISTS idx_services_name_gin ON services USING gin (name gin_trgm_ops)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_services_description_gin ON services USING gin (description gin_trgm_ops)');
    console.log('Services search indexes created');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(0);
}
run();
