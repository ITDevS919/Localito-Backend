import { pool } from "./connection";

export async function runMigrations() {
  const client = await pool.connect();
  
  try {
    // Create users table with role
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'business', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add role column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='users' AND column_name='role') THEN
          ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'customer' 
          CHECK (role IN ('customer', 'business', 'admin'));
        END IF;
      END $$;
    `);

    // Add google_id column if it doesn't exist (for Google OAuth)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='users' AND column_name='google_id') THEN
          ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
        END IF;
      END $$;
    `);

    // Create businesses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_name VARCHAR(255) NOT NULL,
        business_address TEXT,
        postcode VARCHAR(20),
        city VARCHAR(100),
        phone VARCHAR(50),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);

    // Add postcode, city, latitude, and longitude columns if they don't exist (for existing databases)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='postcode') THEN
          ALTER TABLE businesses ADD COLUMN postcode VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='city') THEN
          ALTER TABLE businesses ADD COLUMN city VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='latitude') THEN
          ALTER TABLE businesses ADD COLUMN latitude DECIMAL(10, 8);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='longitude') THEN
          ALTER TABLE businesses ADD COLUMN longitude DECIMAL(11, 8);
        END IF;
      END $$;
    `);

    // Add Square integration fields to businesses table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='square_access_token') THEN
          ALTER TABLE businesses ADD COLUMN square_access_token VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='square_location_id') THEN
          ALTER TABLE businesses ADD COLUMN square_location_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='square_connected_at') THEN
          ALTER TABLE businesses ADD COLUMN square_connected_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='square_sync_enabled') THEN
          ALTER TABLE businesses ADD COLUMN square_sync_enabled BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        category VARCHAR(100) NOT NULL,
        images TEXT[] DEFAULT ARRAY[]::TEXT[],
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create cart_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Create orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('awaiting_payment', 'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'ready_for_pickup', 'picked_up')),
        total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
        stripe_session_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add BOPIS fields to orders table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='pickup_location') THEN
          ALTER TABLE orders ADD COLUMN pickup_location TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='pickup_instructions') THEN
          ALTER TABLE orders ADD COLUMN pickup_instructions TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='ready_for_pickup_at') THEN
          ALTER TABLE orders ADD COLUMN ready_for_pickup_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='picked_up_at') THEN
          ALTER TABLE orders ADD COLUMN picked_up_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='qr_code_scanned_at') THEN
          ALTER TABLE orders ADD COLUMN qr_code_scanned_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='qr_code_scanned_by') THEN
          ALTER TABLE orders ADD COLUMN qr_code_scanned_by UUID REFERENCES users(id);
        END IF;
      END $$;
    `);

    // Update orders status constraint to include BOPIS statuses and awaiting_payment for existing databases
    // First, try to drop the constraint if it exists (using multiple methods for compatibility)
    await client.query(`
      DO $$ 
      DECLARE
        constraint_name_var TEXT;
      BEGIN
        -- Find the constraint name (try multiple possible names)
        SELECT constraint_name INTO constraint_name_var
        FROM information_schema.table_constraints 
        WHERE table_name = 'orders' 
        AND constraint_type = 'CHECK'
        AND (constraint_name LIKE '%status%' OR constraint_name = 'orders_status_check')
        LIMIT 1;
        
        -- Drop existing constraint if found
        IF constraint_name_var IS NOT NULL THEN
          BEGIN
            EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(constraint_name_var);
          EXCEPTION
            WHEN OTHERS THEN
              -- Ignore errors if constraint doesn't exist
              NULL;
          END;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          -- Ignore all errors in this block
          NULL;
      END $$;
    `);
    
    // Now add the updated constraint (drop first to ensure clean state)
    await client.query(`
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    `);
    
    await client.query(`
      ALTER TABLE orders 
      ADD CONSTRAINT orders_status_check 
      CHECK (status IN ('awaiting_payment', 'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'ready_for_pickup', 'picked_up'));
    `);

    // Create order_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        price DECIMAL(10, 2) NOT NULL CHECK (price >= 0)
      )
    `);

    // Create stripe_connect_accounts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
        stripe_account_id VARCHAR(255) NOT NULL UNIQUE,
        stripe_secret_key TEXT,
        onboarding_completed BOOLEAN DEFAULT FALSE,
        charges_enabled BOOLEAN DEFAULT FALSE,
        payouts_enabled BOOLEAN DEFAULT FALSE,
        details_submitted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add stripe_secret_key column if it doesn't exist (for existing databases)
    await client.query(`
      ALTER TABLE stripe_connect_accounts 
      ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_business_id ON stripe_connect_accounts(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stripe_connect_accounts_stripe_account_id ON stripe_connect_accounts(stripe_account_id)
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_businesses_postcode ON businesses(postcode)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_businesses_location ON businesses(latitude, longitude)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_business_id ON products(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_business_id ON orders(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)
    `);

    // Create reviews table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        is_approved BOOLEAN DEFAULT TRUE,
        is_flagged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, user_id)
      )
    `);

    // Add moderation fields to reviews if they don't exist
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='reviews' AND column_name='is_approved') THEN
          ALTER TABLE reviews ADD COLUMN is_approved BOOLEAN DEFAULT TRUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='reviews' AND column_name='is_flagged') THEN
          ALTER TABLE reviews ADD COLUMN is_flagged BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Add review_count and average_rating to products table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='products' AND column_name='review_count') THEN
          ALTER TABLE products ADD COLUMN review_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='products' AND column_name='average_rating') THEN
          ALTER TABLE products ADD COLUMN average_rating DECIMAL(3, 2) DEFAULT 0.00;
        END IF;
      END $$;
    `);

    // Add EPOS sync fields to products table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='products' AND column_name='sync_from_epos') THEN
          ALTER TABLE products ADD COLUMN sync_from_epos BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='products' AND column_name='square_item_id') THEN
          ALTER TABLE products ADD COLUMN square_item_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='products' AND column_name='last_epos_sync_at') THEN
          ALTER TABLE products ADD COLUMN last_epos_sync_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // ==================== SERVICES & BOOKING SYSTEM ====================
    // Create services table BEFORE modifying reviews to reference it
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
        category VARCHAR(100) NOT NULL,
        images TEXT[] DEFAULT ARRAY[]::TEXT[],
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        max_participants INTEGER DEFAULT 1 CHECK (max_participants > 0),
        requires_staff BOOLEAN DEFAULT FALSE,
        location_type VARCHAR(50) DEFAULT 'onsite' CHECK (location_type IN ('onsite', 'customer_address', 'online')),
        review_count INTEGER DEFAULT 0,
        average_rating DECIMAL(3, 2) DEFAULT 0.00
      )
    `);

    // Create indexes for services (immediately after table creation)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_business_id ON services(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_services_category ON services(category)
    `);

    // Create cart_service_items table (depends on services)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_service_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, service_id)
      )
    `);

    // Create order_service_items table (depends on services and orders)
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_service_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
        booking_date DATE,
        booking_time TIME,
        booking_duration_minutes INTEGER
      )
    `);

    // Update reviews table to support services (NOW services table exists)
    await client.query(`
      DO $$ 
      BEGIN
        -- Make product_id nullable
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name='reviews' AND column_name='product_id' AND is_nullable='NO') THEN
          ALTER TABLE reviews ALTER COLUMN product_id DROP NOT NULL;
        END IF;
        
        -- Add service_id column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='reviews' AND column_name='service_id') THEN
          ALTER TABLE reviews ADD COLUMN service_id UUID REFERENCES services(id) ON DELETE CASCADE;
        END IF;
        
        -- Add constraint to ensure either product_id or service_id is set
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'reviews_product_or_service_check'
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_product_or_service_check 
            CHECK ((product_id IS NOT NULL AND service_id IS NULL) OR 
                   (product_id IS NULL AND service_id IS NOT NULL));
        END IF;
        
        -- Drop old unique constraint if it exists
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'reviews_product_id_user_id_key'
        ) THEN
          ALTER TABLE reviews DROP CONSTRAINT reviews_product_id_user_id_key;
        END IF;
        
        -- Add new unique indexes for products and services separately
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'reviews_product_user_unique' AND n.nspname = 'public'
        ) THEN
          CREATE UNIQUE INDEX reviews_product_user_unique 
            ON reviews(product_id, user_id) 
            WHERE product_id IS NOT NULL;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'reviews_service_user_unique' AND n.nspname = 'public'
        ) THEN
          CREATE UNIQUE INDEX reviews_service_user_unique 
            ON reviews(service_id, user_id) 
            WHERE service_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Create indexes for reviews
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_service_id ON reviews(service_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_review_count ON products(review_count)
    `);

    // Create wishlist_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Create index for wishlist queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist_items(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON wishlist_items(product_id)
    `);
        
    // Create business_posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS business_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        images TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create business_followers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS business_followers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(business_id, user_id)
      )
    `);

    // Add banner_image to businesses table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='banner_image') THEN
          ALTER TABLE businesses ADD COLUMN banner_image TEXT;
        END IF;
      END $$;
    `);

    // Add same-day pickup cutoff fields to businesses table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='same_day_pickup_allowed') THEN
          ALTER TABLE businesses ADD COLUMN same_day_pickup_allowed BOOLEAN DEFAULT TRUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='cutoff_time') THEN
          ALTER TABLE businesses ADD COLUMN cutoff_time TIME;
        END IF;
      END $$;
    `);

    // Add business billing columns for per-business commission and trial periods
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='commission_rate_override') THEN
          ALTER TABLE businesses ADD COLUMN commission_rate_override DECIMAL(5,4) NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='trial_starts_at') THEN
          ALTER TABLE businesses ADD COLUMN trial_starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='trial_ends_at') THEN
          ALTER TABLE businesses ADD COLUMN trial_ends_at TIMESTAMP NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='businesses' AND column_name='billing_status') THEN
          ALTER TABLE businesses ADD COLUMN billing_status VARCHAR(20) DEFAULT 'trial' 
            CHECK (billing_status IN ('trial', 'active', 'suspended'));
        END IF;
      END $$;
    `);

    // Create business_payout_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS business_payout_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        payout_method VARCHAR(50) NOT NULL CHECK (payout_method IN ('bank', 'paypal', 'stripe')),
        account_details JSONB,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(business_id)
      )
    `);

    // Create payouts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
        currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
        amount_base DECIMAL(10, 2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        payout_method VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Ensure currency column exists on existing payouts table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payouts' AND column_name = 'currency'
        ) THEN
          ALTER TABLE payouts ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'GBP';
        END IF;
      END $$;
    `);

    // Ensure amount_base column exists on existing payouts table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'payouts' AND column_name = 'amount_base'
        ) THEN
          ALTER TABLE payouts ADD COLUMN amount_base DECIMAL(10, 2) NOT NULL DEFAULT 0;
          -- Backfill existing rows
          UPDATE payouts SET amount_base = amount WHERE amount_base = 0 OR amount_base IS NULL;
        END IF;
      END $$;
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_business_posts_business_id ON business_posts(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_business_posts_created_at ON business_posts(created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_business_followers_business_id ON business_followers(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_business_followers_user_id ON business_followers(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payouts_business_id ON payouts(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status)
    `);

    // ==================== PROMOTION SYSTEM TABLES ====================
    
    // Add promotion fields to orders table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='discount_amount') THEN
          ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10, 2) DEFAULT 0 CHECK (discount_amount >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='points_used') THEN
          ALTER TABLE orders ADD COLUMN points_used DECIMAL(10, 2) DEFAULT 0 CHECK (points_used >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='points_earned') THEN
          ALTER TABLE orders ADD COLUMN points_earned DECIMAL(10, 2) DEFAULT 0 CHECK (points_earned >= 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='stripe_payment_intent_id') THEN
          ALTER TABLE orders ADD COLUMN stripe_payment_intent_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='stripe_transfer_id') THEN
          ALTER TABLE orders ADD COLUMN stripe_transfer_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='platform_commission') THEN
          ALTER TABLE orders ADD COLUMN platform_commission DECIMAL(10, 2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='business_amount') THEN
          IF EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='orders' AND column_name='retailer_amount') THEN
            ALTER TABLE orders RENAME COLUMN retailer_amount TO business_amount;
          ELSE
            ALTER TABLE orders ADD COLUMN business_amount DECIMAL(10, 2);
          END IF;
        END IF;
      END $$;
    `);

    // Create discount_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
        discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
        min_purchase_amount DECIMAL(10, 2) DEFAULT 0 CHECK (min_purchase_amount >= 0),
        max_discount_amount DECIMAL(10, 2),
        usage_limit INTEGER,
        used_count INTEGER DEFAULT 0 CHECK (used_count >= 0),
        valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        valid_until TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_points table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(10, 2) DEFAULT 0 CHECK (balance >= 0),
        total_earned DECIMAL(10, 2) DEFAULT 0 CHECK (total_earned >= 0),
        total_redeemed DECIMAL(10, 2) DEFAULT 0 CHECK (total_redeemed >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create points_transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS points_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earned', 'redeemed')),
        amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create order_discount_codes table (junction table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_discount_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        discount_code_id UUID NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
        discount_amount DECIMAL(10, 2) NOT NULL CHECK (discount_amount >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, discount_code_id)
      )
    `);

    // Create indexes for promotion system tables
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_discount_codes_is_active ON discount_codes(is_active)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_discount_codes_valid_until ON discount_codes(valid_until)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_points_transactions_order_id ON points_transactions(order_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_points_transactions_type ON points_transactions(transaction_type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_discount_codes_order_id ON order_discount_codes(order_id)
    `);

    // Create platform_settings table for commission and other settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by UUID REFERENCES users(id)
      )
    `);

    // Insert default commission setting if it doesn't exist
    await client.query(`
      INSERT INTO platform_settings (setting_key, setting_value, description)
      VALUES ('commission_rate', '0.10', 'Platform commission rate (10% = 0.10)')
      ON CONFLICT (setting_key) DO NOTHING
    `);

    // Create categories table for product categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default categories if they don't exist
    await client.query(`
      INSERT INTO categories (name, description) VALUES
      ('Food & Drink', 'Restaurants, bakeries, cafés, takeaways, delis, butchers, greengrocers, specialty grocers, off‑licences'),
      ('Health & Beauty', 'Pharmacies, barbers, salons, cosmetics, skincare, health foods'),
      ('Fashion & Accessories', 'Clothing, shoes, vintage, jewellery, bags, streetwear'),
      ('Home & Living', 'Homeware, furniture, kitchenware, decor, plants, DIY, hardware'),
      ('Electronics & Tech', 'Phones, computers, audio, gaming, repairs'),
      ('Books, Music & Hobbies', 'Bookshops, records, games/comics, arts & crafts, instruments'),
      ('Kids & Family', 'Toys, baby stores, childrenswear, family gift shops'),
      ('Sports & Outdoors', 'Sportswear, equipment, bikes, camping/outdoor'),
      ('Gifts, Flowers & Stationery', 'Florists, gift shops, cards, stationery, party supplies'),
      ('Pets', 'Pet shops, pet food, accessories, groomers'),
      ('Services', 'Tailors, cobblers, dry cleaners, printing, key cutting, repairs'),
      ('Other', 'Catch‑all if nothing fits; you can review and refine later')
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_discount_codes_discount_code_id ON order_discount_codes(discount_code_id)
    `);
        
    // Add QR code fields to orders table
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS qr_code_scanned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS qr_code_scanned_by UUID REFERENCES users(id)
    `);

    // ==================== SERVICES & BOOKING SYSTEM (CONTINUED) ====================
    // Note: services, cart_service_items, and order_service_items tables were created earlier

    // Create business_availability_schedules table (weekly schedule)
    await client.query(`
      CREATE TABLE IF NOT EXISTS business_availability_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(business_id, day_of_week)
      )
    `);

    // Create business_availability_blocks table (blocked dates/times)
    await client.query(`
      CREATE TABLE IF NOT EXISTS business_availability_blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        block_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        reason TEXT,
        is_all_day BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add booking fields to orders table
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='booking_date') THEN
          ALTER TABLE orders ADD COLUMN booking_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='booking_time') THEN
          ALTER TABLE orders ADD COLUMN booking_time TIME;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='booking_duration_minutes') THEN
          ALTER TABLE orders ADD COLUMN booking_duration_minutes INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='booking_status') THEN
          ALTER TABLE orders ADD COLUMN booking_status VARCHAR(20) DEFAULT 'confirmed' 
            CHECK (booking_status IN ('confirmed', 'cancelled', 'completed'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='booking_locked_at') THEN
          ALTER TABLE orders ADD COLUMN booking_locked_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='orders' AND column_name='booking_locked_until') THEN
          ALTER TABLE orders ADD COLUMN booking_locked_until TIMESTAMP;
        END IF;
      END $$;
    `);

    // Create booking_locks table (temporary locks during checkout)
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_locks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        booking_date DATE NOT NULL,
        booking_time TIME NOT NULL,
        locked_by UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(business_id, booking_date, booking_time)
      )
    `);

    // Create additional indexes for services and booking (some were created earlier)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cart_service_items_user_id ON cart_service_items(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cart_service_items_service_id ON cart_service_items(service_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_service_items_order_id ON order_service_items(order_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_service_items_service_id ON order_service_items(service_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_business_availability_schedules_business_id 
        ON business_availability_schedules(business_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_business_availability_blocks_business_date 
        ON business_availability_blocks(business_id, block_date)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_locks_business_date_time 
        ON booking_locks(business_id, booking_date, booking_time)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_booking_date_time 
        ON orders(business_id, booking_date, booking_time) 
        WHERE booking_date IS NOT NULL
    `);

    // Update location_type constraint to match frontend values
    await client.query(`
      DO $$ 
      BEGIN
        -- Drop the old constraint if it exists
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'services_location_type_check'
        ) THEN
          ALTER TABLE services DROP CONSTRAINT services_location_type_check;
        END IF;
        
        -- Add the new constraint with correct values
        ALTER TABLE services 
          ADD CONSTRAINT services_location_type_check 
          CHECK (location_type IN ('onsite', 'customer_address', 'online'));
      END $$;
    `);

    console.log("Database migrations completed successfully");
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  } finally {
    client.release();
  }
}

