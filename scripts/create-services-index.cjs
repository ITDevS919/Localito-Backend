// One-off: create index for services list query. Run on server: node scripts/create-services-index.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
p.query('CREATE INDEX IF NOT EXISTS idx_services_is_approved_created_at ON services(is_approved, created_at DESC)')
  .then(() => { console.log('Services index created'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
