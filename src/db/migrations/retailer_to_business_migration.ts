import { pool } from "../connection";

/**
 * Migration: Retailer → Business
 * 
 * This migration renames all retailer-related tables, columns, and constraints
 * to use "business" terminology instead.
 * 
 * IMPORTANT: Run this on a backup first! This is a breaking change.
 * 
 * Steps:
 * 1. Rename tables
 * 2. Rename columns
 * 3. Update foreign key constraints
 * 4. Update check constraints (role enum)
 * 5. Update indexes
 * 6. Update existing data (role values)
 */

export async function migrateRetailerToBusiness() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('[Migration] Starting Retailer → Business migration...');

    // Step 1: Update user role enum values
    console.log('[Migration] Step 1: Updating user role enum...');
    
    // First, drop the constraint to allow the update
    await client.query(`
      ALTER TABLE users 
      DROP CONSTRAINT IF EXISTS users_role_check
    `);
    
    // Now update existing 'retailer' role values to 'business'
    await client.query(`
      UPDATE users 
      SET role = 'business' 
      WHERE role = 'retailer'
    `);

    // Recreate the check constraint with new enum (without 'retailer')
    await client.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check 
      CHECK (role IN ('customer', 'business', 'admin'))
    `);

    // Step 2: Rename tables
    console.log('[Migration] Step 2: Renaming tables...');
    
    await client.query(`ALTER TABLE retailers RENAME TO businesses`);
    await client.query(`ALTER TABLE retailer_payout_settings RENAME TO business_payout_settings`);
    await client.query(`ALTER TABLE retailer_posts RENAME TO business_posts`);
    await client.query(`ALTER TABLE retailer_followers RENAME TO business_followers`);
    await client.query(`ALTER TABLE retailer_availability_schedules RENAME TO business_availability_schedules`);
    await client.query(`ALTER TABLE retailer_availability_blocks RENAME TO business_availability_blocks`);
    
    // Check if retailer_bookings exists
    const bookingsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'retailer_bookings'
      )
    `);
    if (bookingsCheck.rows[0].exists) {
      await client.query(`ALTER TABLE retailer_bookings RENAME TO business_bookings`);
    }

    // Step 3: Rename columns in all tables
    console.log('[Migration] Step 3: Renaming columns...');
    
    // products table
    await client.query(`ALTER TABLE products RENAME COLUMN retailer_id TO business_id`);
    
    // orders table
    await client.query(`ALTER TABLE orders RENAME COLUMN retailer_id TO business_id`);
    
    // services table
    await client.query(`ALTER TABLE services RENAME COLUMN retailer_id TO business_id`);
    
    // stripe_connect_accounts table
    await client.query(`ALTER TABLE stripe_connect_accounts RENAME COLUMN retailer_id TO business_id`);
    
    // payouts table
    await client.query(`ALTER TABLE payouts RENAME COLUMN retailer_id TO business_id`);
    
    // cart_service_items - check if retailer_id exists
    const cartServiceCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'cart_service_items' AND column_name = 'retailer_id'
      )
    `);
    if (cartServiceCheck.rows[0].exists) {
      await client.query(`ALTER TABLE cart_service_items RENAME COLUMN retailer_id TO business_id`);
    }
    
    // order_service_items - check if retailer_id exists
    const orderServiceCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'order_service_items' AND column_name = 'retailer_id'
      )
    `);
    if (orderServiceCheck.rows[0].exists) {
      await client.query(`ALTER TABLE order_service_items RENAME COLUMN retailer_id TO business_id`);
    }
    
    // orders table - rename retailer_amount to business_amount
    const retailerAmountCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'retailer_amount'
      )
    `);
    if (retailerAmountCheck.rows[0].exists) {
      await client.query(`ALTER TABLE orders RENAME COLUMN retailer_amount TO business_amount`);
    }
    
    // booking_locks - check if retailer_id exists
    const bookingLocksCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'booking_locks' AND column_name = 'retailer_id'
      )
    `);
    if (bookingLocksCheck.rows[0].exists) {
      await client.query(`ALTER TABLE booking_locks RENAME COLUMN retailer_id TO business_id`);
    }

    // Step 4: Update foreign key constraints
    console.log('[Migration] Step 4: Updating foreign key constraints...');
    
    // Drop old foreign keys
    await client.query(`
      DO $$ 
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT constraint_name, table_name
          FROM information_schema.table_constraints
          WHERE constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%retailer%'
        ) LOOP
          EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || 
                  ' DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
        END LOOP;
      END $$;
    `);

    // Recreate foreign keys with new names
    await client.query(`
      ALTER TABLE products 
      ADD CONSTRAINT products_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE orders 
      ADD CONSTRAINT orders_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE services 
      ADD CONSTRAINT services_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE stripe_connect_accounts 
      ADD CONSTRAINT stripe_connect_accounts_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE payouts 
      ADD CONSTRAINT payouts_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE business_payout_settings 
      ADD CONSTRAINT business_payout_settings_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE business_posts 
      ADD CONSTRAINT business_posts_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE business_followers 
      ADD CONSTRAINT business_followers_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE business_availability_schedules 
      ADD CONSTRAINT business_availability_schedules_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    await client.query(`
      ALTER TABLE business_availability_blocks 
      ADD CONSTRAINT business_availability_blocks_business_id_fkey 
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    `);

    // Step 5: Update indexes
    console.log('[Migration] Step 5: Updating indexes...');
    
    // Drop old indexes
    await client.query(`
      DROP INDEX IF EXISTS idx_products_retailer_id;
      DROP INDEX IF EXISTS idx_orders_retailer_id;
      DROP INDEX IF EXISTS idx_services_retailer_id;
      DROP INDEX IF EXISTS idx_stripe_connect_accounts_retailer_id;
      DROP INDEX IF EXISTS idx_payouts_retailer_id;
      DROP INDEX IF EXISTS idx_retailer_posts_retailer_id;
      DROP INDEX IF EXISTS idx_retailer_followers_retailer_id;
      DROP INDEX IF EXISTS idx_retailer_availability_schedules_retailer_id;
      DROP INDEX IF EXISTS idx_retailer_availability_blocks_retailer_date;
    `);

    // Create new indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_business_id ON products(business_id);
      CREATE INDEX IF NOT EXISTS idx_orders_business_id ON orders(business_id);
      CREATE INDEX IF NOT EXISTS idx_services_business_id ON services(business_id);
      CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_business_id ON stripe_connect_accounts(business_id);
      CREATE INDEX IF NOT EXISTS idx_payouts_business_id ON payouts(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_posts_business_id ON business_posts(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_followers_business_id ON business_followers(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_availability_schedules_business_id 
        ON business_availability_schedules(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_availability_blocks_business_date 
        ON business_availability_blocks(business_id, block_date);
    `);

    // Step 6: Update unique constraints
    console.log('[Migration] Step 6: Updating unique constraints...');
    
    // business_availability_schedules unique constraint
    await client.query(`
      ALTER TABLE business_availability_schedules 
      DROP CONSTRAINT IF EXISTS business_availability_schedules_business_id_day_of_week_key
    `);
    await client.query(`
      ALTER TABLE business_availability_schedules 
      ADD CONSTRAINT business_availability_schedules_business_id_day_of_week_key 
      UNIQUE (business_id, day_of_week)
    `);

    // business_followers unique constraint
    await client.query(`
      ALTER TABLE business_followers 
      DROP CONSTRAINT IF EXISTS business_followers_business_id_user_id_key
    `);
    await client.query(`
      ALTER TABLE business_followers 
      ADD CONSTRAINT business_followers_business_id_user_id_key 
      UNIQUE (business_id, user_id)
    `);

    await client.query('COMMIT');
    console.log('[Migration] ✅ Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration] ❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// // Run migration if called directly
// if (require.main === module) {
//   migrateRetailerToBusiness()
//     .then(() => {
//       console.log('Migration complete');
//       process.exit(0);
//     })
//     .catch((error) => {
//       console.error('Migration failed:', error);
//       process.exit(1);
//     });
// }
