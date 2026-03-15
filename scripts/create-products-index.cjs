// One-off: create index for products list query. Run on server: node scripts/create-products-index.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
p.query('CREATE INDEX IF NOT EXISTS idx_products_is_approved_created_at ON products(is_approved, created_at DESC)')
  .then(() => { console.log('Index created'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
