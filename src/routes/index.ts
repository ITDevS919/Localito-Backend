import express, { Router } from "express";
import Stripe from "stripe";
import passport from "passport";
import crypto from "crypto";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { storage } from "../services/storage";
import { isAuthenticated, getCurrentUser } from "../middleware/auth";
import { insertUserSchema, loginSchema, User } from "../../shared/schema";
// Using require to avoid TS module resolution issues in this runtime config
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { stripeService, COMMISSION_TIERS } from "../services/stripeService";
import { rewardsService } from '../services/rewardsService';
import { AvailabilityService } from '../services/availabilityService';
import { emailService } from '../services/emailService';

// Create require function for ES modules
const require = createRequire(import.meta.url);
const BASE_CURRENCY = (process.env.BASE_CURRENCY || "GBP").toUpperCase();
const currencyRates: Record<string, number> = {
  GBP: 1,
  USD: parseFloat(process.env.FX_USD_TO_GBP || "0.79"),
  EUR: parseFloat(process.env.FX_EUR_TO_GBP || "0.86"),
};
const toBaseCurrency = (amount: number, currency: string) => {
  const rate = Number.isFinite(currencyRates[currency]) ? currencyRates[currency] : 1;
  return amount * rate;
};

const router = Router();


// Health check endpoint
router.get("/health", async (_req, res) => {
  const health = {
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
      stripe: "unknown",
    },
  };

  // Check database
  try {
    await pool.query("SELECT 1");
    health.services.database = "connected";
  } catch (error) {
    health.services.database = "disconnected";
  }

  // Check Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    const keyType = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test';
    health.services.stripe = `configured (${keyType})`;
  } else {
    health.services.stripe = "not configured";
  }

  res.json(health);
});

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve logo for emails (accessible at /api/logo.png)
router.get("/logo.png", (req, res) => {
  const logoPath = path.resolve(__dirname, "..", "..", "client", "public", "logo.png");
  
  if (fs.existsSync(logoPath)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
    res.sendFile(logoPath);
  } else {
    res.status(404).json({ success: false, message: "Logo not found" });
  }
});

// Get Stripe publishable key (for mobile app)
router.get("/stripe/publishable-key", (_req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
  if (!publishableKey) {
    return res.status(500).json({ 
      success: false, 
      message: "Stripe publishable key not configured" 
    });
  }
  res.json({ 
    success: true, 
    data: { publishableKey } 
  });
});

// Authentication routes

// Sign up
router.post("/auth/signup", async (req, res, next) => {
  try {
    // Validate input
    const validationResult = insertUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationResult.error.errors,
      });
    }

    const { username, email, password, role, businessData } = validationResult.data;

    // Check if user already exists
    const existingUser = await storage.getUserByUsername(username) ||
      await storage.getUserByEmail(email);
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    // Create user with role and business data if applicable
    const user = await storage.createUser({ 
      username, 
      email, 
      password, 
      role: role || "customer",
      businessData: role === "business" ? businessData : undefined
    });

    // Auto-login after signup
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      
      // Return user without password
      const { password: _, ...publicUser } = user;
      res.status(201).json({
        success: true,
        data: publicUser,
      });
    });
  } catch (error: any) {
    if (error.message === "Username or email already exists") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

// Login
router.post("/auth/login", (req, res, next) => {
  // Validate input
  const validationResult = loginSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validationResult.error.errors,
    });
  }

  passport.authenticate("local", (err: any, user: User, info: any) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || "Invalid username or password",
      });
    }
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      // Return user without password
      const { password: _, ...publicUser } = user;
      res.json({
        success: true,
        data: publicUser,
      });
    });
  })(req, res, next);
});

// Admin Login (separate endpoint that validates admin role)
router.post("/admin/login", (req, res, next) => {
  // Validate input
  const validationResult = loginSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validationResult.error.errors,
    });
  }

  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || "Invalid username or password",
      });
    }
    
    // Check if user is an admin
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }
    
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      // Return user without password
      const { password: _, ...publicUser } = user;
      res.json({
        success: true,
        data: publicUser,
      });
    });
  })(req, res, next);
});

// Logout
router.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }
      res.json({
        success: true,
        message: "Logged out successfully",
      });
    });
  });
});

// Google OAuth routes
router.get("/auth/google", (req, res, next) => {
  const role = (req.query.role as string) || "customer";
  // Store role in session for callback
  (req.session as any).googleAuthRole = role;
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
});

router.get("/auth/google/callback",
  passport.authenticate("google", { 
    failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:5173"}/login/customer?error=google_auth_failed` 
  }),
  async (req, res) => {
    try {
      // Get user from request (set by passport.authenticate)
      const user = req.user as any;
      
      if (!user) {
        console.error("[Google Auth] No user found after authentication");
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        return res.redirect(`${frontendUrl}/login/customer?error=google_auth_failed`);
      }

      // Get role from session if available (cleanup)
      const role = (req.session as any)?.googleAuthRole || "customer";
      delete (req.session as any).googleAuthRole;

      // Explicitly save session to ensure cookie is set
      req.session.save((err) => {
        if (err) {
          console.error("[Google Auth] Session save error:", err);
          const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
          return res.redirect(`${frontendUrl}/login/customer?error=session_error`);
        }

        // Redirect based on user role
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        
        console.log(`[Google Auth] Successful authentication for user ${user.id} with role ${user.role}`);
        console.log(`[Google Auth] Session ID: ${req.sessionID}`);
        console.log(`[Google Auth] Request origin: ${req.headers.origin}`);
        console.log(`[Google Auth] Request host: ${req.headers.host}`);
        
        if (user.role === "business") {
          // Check if business has completed onboarding
          pool.query(
            `SELECT onboarding_completed_at FROM businesses WHERE user_id = $1`,
            [user.id]
          ).then((result) => {
            if (result.rows.length > 0 && result.rows[0].onboarding_completed_at) {
              // Existing business that has completed onboarding
              res.redirect(`${frontendUrl}/business/dashboard`);
            } else {
              // New business or hasn't completed onboarding yet
              res.redirect(`${frontendUrl}/business/onboarding`);
            }
          }).catch((err) => {
            console.error("[Google Auth] Error checking onboarding status:", err);
            // Fallback to onboarding if error
            res.redirect(`${frontendUrl}/business/onboarding`);
          });
        } else if (user.role === "admin") {
          res.redirect(`${frontendUrl}/admin/dashboard`);
        } else {
          res.redirect(`${frontendUrl}/`);
        }
      });
    } catch (error: any) {
      console.error("[Google Auth] Callback error:", error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${frontendUrl}/login/customer?error=google_auth_failed`);
    }
  }
);

// Google OAuth for mobile (accepts ID token)
// Uses Expo AuthSession with platform-specific Client IDs
// Frontend sends ID token directly from response.authentication.idToken
router.post("/auth/google/mobile", async (req, res, next) => {
  try {
    console.log("[Google Auth] Mobile login request received");
    const { idToken, role, isLogin } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ 
        success: false, 
        message: "ID token is required" 
      });
    }

    const userRole = role || "customer";

    // Verify Google ID token
    const { OAuth2Client } = require('google-auth-library');
    
    // Use WEB Client ID for verification (works for all platforms with Expo AuthSession)
    // The frontend uses webClientId, androidClientId, and iosClientId, but all generate
    // ID tokens that can be verified with the Web Client ID
    const clientId = process.env.GOOGLE_CLIENT_ID_MOBILE;
    
    if (!clientId) {
      return res.status(500).json({ 
        success: false, 
        message: "Google Client ID not configured. Please set GOOGLE_CLIENT_ID_MOBILE or GOOGLE_CLIENT_ID." 
      });
    }

    // Verify ID token using google-auth-library
    let ticket;
    try {
      const client = new OAuth2Client(clientId);
      ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
    } catch (error: any) {
      console.error('[Google Auth] Token verification error:', error);
      return res.status(401).json({ 
        success: false, 
        message: "Invalid Google ID token. Token verification failed." 
      });
    }

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const displayName = payload.name || payload.given_name || "User";

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required for Google authentication" });
    }

    // Check if user exists by Google ID
    let user = await storage.getUserByGoogleId(googleId);
    
    if (user) {
      // User exists, log them in
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        const { password: _, ...publicUser } = user as any;
        return res.json({
          success: true,
          message: "Login successful",
          data: publicUser,
        });
      });
      return;
    }

    // Check if user exists by email (for linking accounts)
    user = await storage.getUserByEmail(email);
    
    if (user) {
      // Link Google account to existing user
      await storage.updateUserGoogleId(user.id, googleId);
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        const { password: _, ...publicUser } = user as any;
        return res.json({
          success: true,
          message: "Login successful",
          data: publicUser,
        });
      });
      return;
    }

    // For login flows, don't auto-create business/admin accounts
    if (isLogin === true && (userRole === "business" || userRole === "admin")) {
      return res.status(404).json({ 
        success: false, 
        message: "Account not found. Please sign up first." 
      });
    }

    // Create new user from Google profile
    user = await storage.createUserFromGoogle(googleId, email, displayName, userRole);

    // Log in the new user
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      const { password: _, ...publicUser } = user as any;
      return res.json({
        success: true,
        message: "Account created and logged in successfully",
        data: publicUser,
      });
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get("/auth/me", isAuthenticated, (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }
  // Return user without password
  const { password: _, ...publicUser } = user;
  res.json({
    success: true,
    data: publicUser,
  });
});

// Products routes
import { productService } from "../services/productService";
const availabilityService = new AvailabilityService();
import { geocodingService } from "../services/geocodingService";
import { squareService } from "../services/squareService";
import { pool } from "../db/connection";

// Get products (public)
router.get("/products", async (req, res, next) => {
  try {
    console.log(`[Products API] Request received with query params:`, req.query);
    const { category, search, businessId, location, latitude, longitude, radiusKm, page, limit } = req.query;
    
    let lat: number | undefined;
    let lon: number | undefined;
    let radius: number | undefined;

    // If latitude/longitude/radius are provided, use radius search
    if (latitude && longitude && radiusKm) {
      lat = parseFloat(latitude as string);
      lon = parseFloat(longitude as string);
      radius = parseFloat(radiusKm as string);
      
      if (isNaN(lat) || isNaN(lon) || isNaN(radius)) {
        return res.status(400).json({
          success: false,
          message: "Invalid latitude, longitude, or radius parameters",
        });
      }
    } else if (location) {
      // Always use text-based search for location (postcode/city filter)
      // No geocoding, directly search businesses.postcode and businesses.city
      console.log(`[Products API] Using text-based search for location: "${location}" (no geocoding)`);
      radius = undefined; // Ensure no radius search
    }

    // If no pagination params provided, return all results (set very high limit)
    const pageNum = page ? parseInt(page as string) : 1;
    const limitNum = limit ? parseInt(limit as string) : (page ? 12 : 10000); // If no page/limit, return all results

    // Determine which search method to use
    const useTextSearch = !(lat && lon && radius);
    const locationForSearch = useTextSearch ? (location as string) : undefined;
    
    console.log(`[Products API] Search parameters:`, {
      location: location as string,
      locationForSearch,
      lat,
      lon,
      radius,
      useTextSearch,
      search: search as string,
      category: category as string,
      businessId: businessId as string,
    });
    
    // Log what will be passed to productService
    console.log(`[Products API] Calling productService.getProducts with:`, {
      search: search as string,
      location: locationForSearch,
      latitude: lat,
      longitude: lon,
      radiusKm: radius,
      category: category as string,
      isApproved: true,
    });

    const result = await productService.getProducts({
      category: category as string,
      search: search as string,
      businessId: businessId as string,
      location: locationForSearch, // Use text search only if no coordinates or radius is 0
      latitude: lat,
      longitude: lon,
      radiusKm: radius,
      isApproved: true, // Only show approved products to public
      page: pageNum,
      limit: limitNum,
    });
    
    res.json({ 
      success: true, 
      data: result.products,
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

// Get pending products (admin only) - MUST be before /products/:id route
router.get("/products/pending", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    // Get pending products with business information
    const result = await pool.query(
      `SELECT p.*, b.business_name as business_name, b.postcode, b.city
       FROM products p
       JOIN businesses b ON p.business_id = b.id
       WHERE p.is_approved = false
       ORDER BY p.created_at DESC`
    );

    const products = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      stock: row.stock,
      category: row.category,
      images: row.images || [],
      isApproved: row.is_approved,
      business_name: row.business_name,
      created_at: row.created_at,
    }));

    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

// Get product by ID (public)
router.get("/products/:id", async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

// Create product (business only)
router.post("/products", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can create products" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const { name, description, price, stock, category, images, syncFromEpos, squareItemId } = req.body;
    const product = await productService.createProduct({
      businessId,
      name,
      description,
      price,
      stock,
      category,
      images,
      syncFromEpos: syncFromEpos || false,
      squareItemId: squareItemId || null,
    });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

// Get business's products
router.get("/business/products", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Get all products for business (no pagination needed for business view)
    const result = await productService.getProducts({ 
      businessId,
      limit: 1000, // Get all products for business
      page: 1,
    });
    
    // Return just the products array, not the pagination object
    res.json({ success: true, data: result.products });
  } catch (error) {
    next(error);
  }
});

// Get business dashboard stats
// Get business profile
router.get("/business/profile", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const result = await pool.query(
      `SELECT b.*, u.email
       FROM businesses b
       JOIN users u ON b.user_id = u.id
       WHERE b.user_id = $1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get business onboarding status
router.get("/business/onboarding-status", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    // Get business info
    const businessResult = await pool.query(
      `SELECT 
        b.business_name,
        b.postcode,
        b.city,
        b.square_access_token,
        b.square_location_id,
        b.onboarding_completed_at,
        (SELECT COUNT(*) FROM products WHERE business_id = b.id) as product_count
       FROM businesses b
       WHERE b.user_id = $1`,
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const business = businessResult.rows[0];

    // Check Stripe setup
    const stripeResult = await pool.query(
      `SELECT onboarding_completed FROM stripe_connect_accounts WHERE business_id = (
        SELECT id FROM businesses WHERE user_id = $1
      )`,
      [user.id]
    );

    const profileComplete = !!(business.business_name && (business.postcode || business.city));
    const squareConnected = !!(business.square_access_token && business.square_location_id);
    const hasProducts = business.product_count > 0;
    const stripeSetup = stripeResult.rows.length > 0 && stripeResult.rows[0].onboarding_completed;

    res.json({
      success: true,
      data: {
        profileComplete,
        squareConnected,
        hasProducts,
        stripeSetup,
        onboardingCompletedAt: business.onboarding_completed_at,
        allComplete: profileComplete && hasProducts && stripeSetup,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Mark business onboarding as complete
router.post("/business/onboarding-complete", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can complete onboarding" });
    }

    await pool.query(
      `UPDATE businesses 
       SET onboarding_completed_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1`,
      [user.id]
    );

    res.json({ success: true, message: "Onboarding marked as complete" });
  } catch (error) {
    next(error);
  }
});

// Update business settings
router.put("/business/settings", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update settings" });
    }

    const { businessName, businessAddress, postcode, city, phone, sameDayPickupAllowed, cutoffTime } = req.body;

    if (!businessName || businessName.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Business name is required" });
    }

    // Get business ID
    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Geocode address if postcode or city is provided
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (postcode || city) {
      try {
        const geocodeResult = await geocodingService.geocodeAddress(
          postcode || "",
          city || ""
        );
        if (geocodeResult) {
          latitude = geocodeResult.latitude;
          longitude = geocodeResult.longitude;
        }
      } catch (error) {
        console.error("Geocoding error:", error);
        // Continue without geocoding if it fails
      }
    }

    // Validate cutoff time format if provided (HH:MM or HH:MM:SS)
    let validatedCutoffTime: string | null = null;
    if (cutoffTime !== undefined && cutoffTime !== null && cutoffTime !== '') {
      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:([0-5][0-9]))?$/;
      if (!timeRegex.test(cutoffTime)) {
        return res.status(400).json({ success: false, message: "Cutoff time must be in HH:MM or HH:MM:SS format" });
      }
      // Normalize to HH:MM:SS format
      const parts = cutoffTime.split(':');
      validatedCutoffTime = `${parts[0]}:${parts[1]}:${parts[2] || '00'}`;
    }

    // Update business profile
    const updateResult = await pool.query(
      `UPDATE businesses 
       SET business_name = $1, 
           business_address = $2, 
           postcode = $3, 
           city = $4, 
           phone = $5,
           latitude = $6,
           longitude = $7,
           same_day_pickup_allowed = $8,
           cutoff_time = $9
       WHERE id = $10
       RETURNING *`,
      [
        businessName, 
        businessAddress || null, 
        postcode || null, 
        city || null, 
        phone || null, 
        latitude, 
        longitude,
        sameDayPickupAllowed !== undefined ? sameDayPickupAllowed : true,
        validatedCutoffTime,
        businessId
      ]
    );

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: updateResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// Square integration endpoints

// Connect Square account
router.post("/business/square/connect", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can connect Square" });
    }

    const { accessToken, locationId } = req.body;

    if (!accessToken || !locationId) {
      return res.status(400).json({ success: false, message: "Access token and location ID are required" });
    }

    // Validate connection
    const isValid = await squareService.validateConnection(accessToken, locationId);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid Square credentials or location ID" });
    }

    // Get business ID
    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Update business with Square credentials
    const updateResult = await pool.query(
      `UPDATE businesses 
       SET square_access_token = $1,
           square_location_id = $2,
           square_connected_at = CURRENT_TIMESTAMP,
           square_sync_enabled = true
       WHERE id = $3
       RETURNING id, square_sync_enabled, square_connected_at`,
      [accessToken, locationId, businessId]
    );

    res.json({
      success: true,
      message: "Square account connected successfully",
      data: updateResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// Get Square connection status
router.get("/business/square/status", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can check Square status" });
    }

    const businessResult = await pool.query(
      `SELECT square_access_token, square_location_id, square_sync_enabled, square_connected_at
       FROM businesses WHERE user_id = $1`,
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const business = businessResult.rows[0];
    const isConnected = !!(business.square_access_token && business.square_location_id);

    res.json({
      success: true,
      data: {
        connected: isConnected,
        syncEnabled: business.square_sync_enabled || false,
        connectedAt: business.square_connected_at,
        locationId: business.square_location_id || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Disconnect Square account
router.delete("/business/square/disconnect", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can disconnect Square" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Clear Square credentials and disable sync
    await pool.query(
      `UPDATE businesses 
       SET square_access_token = NULL,
           square_location_id = NULL,
           square_connected_at = NULL,
           square_sync_enabled = false
       WHERE id = $1`,
      [businessId]
    );

    // Also disable EPOS sync for all products
    await pool.query(
      `UPDATE products 
       SET sync_from_epos = false
       WHERE business_id = $1`,
      [businessId]
    );

    res.json({
      success: true,
      message: "Square account disconnected successfully",
    });
  } catch (error) {
    next(error);
  }
});

// Test Square connection
router.post("/business/square/test", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can test Square connection" });
    }

    const businessResult = await pool.query(
      `SELECT square_access_token, square_location_id
       FROM businesses WHERE user_id = $1`,
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const business = businessResult.rows[0];

    if (!business.square_access_token || !business.square_location_id) {
      return res.status(400).json({ success: false, message: "Square account not connected" });
    }

    const isValid = await squareService.validateConnection(
      business.square_access_token,
      business.square_location_id
    );

    res.json({
      success: true,
      data: {
        valid: isValid,
        message: isValid ? "Connection is valid" : "Connection test failed",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/business/stats", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Get total revenue from orders (net to business, excluding pending orders)
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(business_amount, total)), 0) as total_revenue
       FROM orders
       WHERE business_id = $1 AND status NOT IN ('cancelled', 'pending')`,
      [businessId]
    );
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;

    // Get total orders count
    const ordersCountResult = await pool.query(
      `SELECT COUNT(*) as total_orders,
              COUNT(*) FILTER (WHERE status = 'pending') as pending_orders
       FROM orders
       WHERE business_id = $1`,
      [businessId]
    );
    const totalOrders = parseInt(ordersCountResult.rows[0].total_orders) || 0;
    const pendingOrders = parseInt(ordersCountResult.rows[0].pending_orders) || 0;

    // Get products stats
    const productsResult = await pool.query(
      `SELECT COUNT(*) as total_products,
              COUNT(*) FILTER (WHERE is_approved = true) as approved_products,
              COUNT(*) FILTER (WHERE stock < 10 AND stock > 0) as low_stock_count
       FROM products
       WHERE business_id = $1`,
      [businessId]
    );
    const totalProducts = parseInt(productsResult.rows[0].total_products) || 0;
    const approvedProducts = parseInt(productsResult.rows[0].approved_products) || 0;
    const lowStockCount = parseInt(productsResult.rows[0].low_stock_count) || 0;

    // Get recent orders (last 5)
    const recentOrdersResult = await pool.query(
      `SELECT o.*, u.username as customer_name, u.email as customer_email,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.business_id = $1
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [businessId]
    );

    // Get top products by order count (last 30 days)
    // Use LEFT JOIN to handle cases where products have no orders
    const topProductsResult = await pool.query(
      `SELECT p.id, p.name, p.images, p.price,
              COALESCE(COUNT(oi.id), 0)::int as order_count
       FROM products p
       LEFT JOIN order_items oi ON p.id = oi.product_id
       LEFT JOIN orders o ON oi.order_id = o.id 
         AND o.created_at >= NOW() - INTERVAL '30 days'
       WHERE p.business_id = $1
       GROUP BY p.id, p.name, p.images, p.price
       HAVING COUNT(oi.id) > 0
       ORDER BY order_count DESC
       LIMIT 3`,
      [businessId]
    );

    res.json({
      success: true,
      data: {
        revenue: totalRevenue,
        totalOrders,
        pendingOrders,
        totalProducts,
        approvedProducts,
        lowStockCount,
        recentOrders: recentOrdersResult.rows,
        topProducts: topProductsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update product (business only - can only update their own products)
router.put("/products/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update products" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Verify product belongs to this business
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    if (product.businessId !== businessId) {
      return res.status(403).json({ success: false, message: "You can only update your own products" });
    }

    const { name, description, price, stock, category, images, syncFromEpos, squareItemId } = req.body;
    const updatedProduct = await productService.updateProduct(req.params.id, {
      name,
      description,
      price,
      stock,
      category,
      images,
      syncFromEpos,
      squareItemId,
    });

    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    next(error);
  }
});

// Delete product (business only - can only delete their own products)
router.delete("/products/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can delete products" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    await productService.deleteProduct(req.params.id, businessId);
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (error: any) {
    if (error.message?.includes("not found") || error.message?.includes("permission")) {
      return res.status(403).json({ success: false, message: error.message });
    }
    next(error);
  }
});

// Approve product (admin only)
router.post("/products/:id/approve", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can approve products" });
    }

    const product = await productService.approveProduct(req.params.id);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

// Cart routes
router.get("/cart", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const result = await pool.query(
      `SELECT ci.*, p.name, p.price, p.images, p.stock, p.business_id, b.business_name as business_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN businesses b ON p.business_id = b.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/cart", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Only customers can add products to cart
    if (user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Only customers can add products to cart" });
    }

    const { productId, quantity } = req.body;
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: "Invalid product or quantity" });
    }

    // Check if item already in cart
    const existing = await pool.query(
      "SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2",
      [user.id, productId]
    );

    if (existing.rows.length > 0) {
      // Update quantity
      await pool.query(
        "UPDATE cart_items SET quantity = quantity + $1 WHERE user_id = $2 AND product_id = $3",
        [quantity, user.id, productId]
      );
    } else {
      // Add new item
      await pool.query(
        "INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)",
        [user.id, productId, quantity]
      );
    }

    res.json({ success: true, message: "Item added to cart" });
  } catch (error) {
    next(error);
  }
});

router.put("/cart/:productId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
    }

    // Check if item exists in cart
    const existing = await pool.query(
      "SELECT * FROM cart_items WHERE user_id = $1 AND product_id = $2",
      [user.id, req.params.productId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    // Check stock availability
    const productResult = await pool.query(
      "SELECT stock FROM products WHERE id = $1",
      [req.params.productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const availableStock = productResult.rows[0].stock;
    if (quantity > availableStock) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} items available in stock`,
      });
    }

    // Update quantity
    await pool.query(
      "UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3",
      [quantity, user.id, req.params.productId]
    );

    res.json({ success: true, message: "Cart updated successfully" });
  } catch (error) {
    next(error);
  }
});

router.delete("/cart/:productId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    await pool.query(
      "DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2",
      [user.id, req.params.productId]
    );

    res.json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    next(error);
  }
});

// ==================== SERVICES & BOOKING ROUTES ====================

// Get all services (public)
router.get("/services", async (req, res, next) => {
  try {
    const { category, businessId, search } = req.query;
    let query = `
      SELECT s.*, b.business_name as business_name, b.business_address, b.city
      FROM services s
      JOIN businesses b ON s.business_id = b.id
      WHERE s.is_approved = true AND b.is_approved = true
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND s.category = $${paramCount}`;
      params.push(category);
    }

    if (businessId) {
      paramCount++;
      query += ` AND s.business_id = $${paramCount}`;
      params.push(businessId);
    }

    if (search) {
      paramCount++;
      query += ` AND (s.name ILIKE $${paramCount} OR s.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY s.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get pending services (admin only) - MUST be before /services/:id route
router.get("/services/pending", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    // Get pending services with business information
    const result = await pool.query(
      `SELECT s.*, b.business_name as business_name, b.postcode, b.city
       FROM services s
       JOIN businesses b ON s.business_id = b.id
       WHERE s.is_approved = false
       ORDER BY s.created_at DESC`
    );

    const services = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      category: row.category,
      images: row.images || [],
      durationMinutes: row.duration_minutes,
      maxParticipants: row.max_participants,
      locationType: row.location_type,
      requiresStaff: row.requires_staff,
      isApproved: row.is_approved,
      business_name: row.business_name,
      created_at: row.created_at,
    }));

    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

// Get service by ID (public)
router.get("/services/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, b.business_name as business_name, b.business_address, b.city, b.postcode
       FROM services s
       JOIN businesses b ON s.business_id = b.id
       WHERE s.id = $1 AND s.is_approved = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create service (business only)
router.post("/services", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can create services" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const { name, description, price, category, images, durationMinutes, maxParticipants, requiresStaff, locationType } = req.body;

    if (!name || !price || !category || !durationMinutes) {
      return res.status(400).json({
        success: false,
        message: "Name, price, category, and duration are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO services (business_id, name, description, price, category, images, duration_minutes, max_participants, requires_staff, location_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        businessId,
        name,
        description || null,
        price,
        category,
        images || [],
        durationMinutes,
        maxParticipants || 1,
        requiresStaff || false,
        locationType || 'onsite',
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update service (business only)
router.put("/services/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update services" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Verify service belongs to this business
    const serviceCheck = await pool.query(
      "SELECT id FROM services WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found or access denied" });
    }

    const { name, description, price, category, images, durationMinutes, maxParticipants, requiresStaff, locationType } = req.body;

    const result = await pool.query(
      `UPDATE services 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           category = COALESCE($4, category),
           images = COALESCE($5, images),
           duration_minutes = COALESCE($6, duration_minutes),
           max_participants = COALESCE($7, max_participants),
           requires_staff = COALESCE($8, requires_staff),
           location_type = COALESCE($9, location_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        name,
        description,
        price,
        category,
        images,
        durationMinutes,
        maxParticipants,
        requiresStaff,
        locationType,
        req.params.id,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete service (business only)
router.delete("/services/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can delete services" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Verify service belongs to this business
    const serviceCheck = await pool.query(
      "SELECT id FROM services WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found or access denied" });
    }

    await pool.query("DELETE FROM services WHERE id = $1", [req.params.id]);

    res.json({ success: true, message: "Service deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Get business's services (business only)
router.get("/business/services", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const result = await pool.query(
      "SELECT * FROM services WHERE business_id = $1 ORDER BY created_at DESC",
      [businessId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Approve service (admin only)
router.post("/services/:id/approve", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can approve services" });
    }

    const result = await pool.query(
      `UPDATE services 
       SET is_approved = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    res.json({ success: true, message: "Service approved successfully", data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// ==================== AVAILABILITY ROUTES ====================

// Get available time slots for a business
router.get("/businesses/:businessId/availability", async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { startDate, endDate, durationMinutes, slotIntervalMinutes } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required (YYYY-MM-DD format)",
      });
    }

    const slots = await availabilityService.getAvailableSlots(
      businessId,
      new Date(startDate as string),
      new Date(endDate as string),
      durationMinutes ? parseInt(durationMinutes as string) : 60,
      slotIntervalMinutes ? parseInt(slotIntervalMinutes as string) : 30
    );

    res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
});

// Get weekly schedule (business only)
router.get("/business/availability/schedule", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const schedule = await availabilityService.getWeeklySchedule(businessId);
    res.json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
});

// Update weekly schedule (business only)
router.put("/business/availability/schedule", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update schedule" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const { schedule } = req.body; // Array of { dayOfWeek, startTime, endTime, isAvailable }

    if (!Array.isArray(schedule)) {
      return res.status(400).json({ success: false, message: "Schedule must be an array" });
    }

    // Validate schedule data
    for (const day of schedule) {
      if (day.isAvailable && (!day.startTime || !day.endTime)) {
        return res.status(400).json({
          success: false,
          message: `Day ${day.dayOfWeek} is marked as available but missing start time or end time`,
        });
      }
    }

    // Delete existing schedule
    await pool.query(
      "DELETE FROM business_availability_schedules WHERE business_id = $1",
      [businessId]
    );

    // Insert new schedule
    // Save all days, including unavailable ones
    for (const day of schedule) {
      if (day.dayOfWeek !== undefined && day.dayOfWeek !== null) {
        if (day.isAvailable && day.startTime && day.endTime) {
          // Save available day with times
          await pool.query(
            `INSERT INTO business_availability_schedules (business_id, day_of_week, start_time, end_time, is_available)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (business_id, day_of_week) 
             DO UPDATE SET start_time = $3, end_time = $4, is_available = $5, updated_at = CURRENT_TIMESTAMP`,
            [businessId, day.dayOfWeek, day.startTime, day.endTime, true]
          );
        } else {
          // Save unavailable day (or day without times) as unavailable
          await pool.query(
            `INSERT INTO business_availability_schedules (business_id, day_of_week, start_time, end_time, is_available)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (business_id, day_of_week) 
             DO UPDATE SET start_time = $3, end_time = $4, is_available = $5, updated_at = CURRENT_TIMESTAMP`,
            [businessId, day.dayOfWeek, null, null, false]
          );
        }
      }
    }

    const updatedSchedule = await availabilityService.getWeeklySchedule(businessId);
    res.json({ success: true, data: updatedSchedule });
  } catch (error) {
    next(error);
  }
});

// Get availability blocks (business only)
router.get("/business/availability/blocks", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const { startDate, endDate } = req.query;
    let query = `
      SELECT * FROM business_availability_blocks
      WHERE business_id = $1
    `;
    const params: any[] = [businessId];

    if (startDate && endDate) {
      query += ` AND block_date BETWEEN $2 AND $3`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY block_date DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create availability block (business only)
router.post("/business/availability/blocks", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can create blocks" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const { blockDate, startTime, endTime, reason, isAllDay } = req.body;

    if (!blockDate) {
      return res.status(400).json({ success: false, message: "blockDate is required" });
    }

    const result = await pool.query(
      `INSERT INTO business_availability_blocks (business_id, block_date, start_time, end_time, reason, is_all_day)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, blockDate, startTime || null, endTime || null, reason || null, isAllDay || false]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete availability block (business only)
router.delete("/business/availability/blocks/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can delete blocks" });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Verify block belongs to this business
    const blockCheck = await pool.query(
      "SELECT id FROM business_availability_blocks WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (blockCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Block not found or access denied" });
    }

    await pool.query("DELETE FROM business_availability_blocks WHERE id = $1", [req.params.id]);

    res.json({ success: true, message: "Block deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Lock a booking slot (during checkout)
router.post("/bookings/lock", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { businessId, date, time } = req.body;

    if (!businessId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "businessId, date, and time are required",
      });
    }

    const locked = await availabilityService.lockSlot(businessId, date, time, user.id);

    if (!locked) {
      return res.status(400).json({
        success: false,
        message: "Slot is not available or already locked",
      });
    }

    res.json({ success: true, message: "Slot locked successfully" });
  } catch (error) {
    next(error);
  }
});

// Release a booking lock
router.post("/bookings/unlock", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { businessId, date, time } = req.body;

    if (!businessId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "businessId, date, and time are required",
      });
    }

    await availabilityService.releaseLock(businessId, date, time);

    res.json({ success: true, message: "Slot unlocked successfully" });
  } catch (error) {
    next(error);
  }
});

// ==================== CART SERVICE ITEMS ====================

// Add service to cart
router.post("/cart/services/:serviceId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { quantity } = req.body;
    const qty = quantity || 1;

    // Check if service exists
    const serviceCheck = await pool.query(
      "SELECT id FROM services WHERE id = $1 AND is_approved = true",
      [req.params.serviceId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    // Check if already in cart
    const existing = await pool.query(
      "SELECT id FROM cart_service_items WHERE user_id = $1 AND service_id = $2",
      [user.id, req.params.serviceId]
    );

    if (existing.rows.length > 0) {
      // Update quantity
      await pool.query(
        "UPDATE cart_service_items SET quantity = $1 WHERE user_id = $2 AND service_id = $3",
        [qty, user.id, req.params.serviceId]
      );
    } else {
      // Add to cart
      await pool.query(
        "INSERT INTO cart_service_items (user_id, service_id, quantity) VALUES ($1, $2, $3)",
        [user.id, req.params.serviceId, qty]
      );
    }

    res.json({ success: true, message: "Service added to cart" });
  } catch (error) {
    next(error);
  }
});

// Get cart service items
router.get("/cart/services", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const result = await pool.query(
      `SELECT csi.*, s.name, s.price, s.images, s.category, s.duration_minutes, s.business_id,
              b.business_name as business_name
       FROM cart_service_items csi
       JOIN services s ON csi.service_id = s.id
       JOIN businesses b ON s.business_id = b.id
       WHERE csi.user_id = $1
       ORDER BY csi.created_at DESC`,
      [user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Remove service from cart
router.delete("/cart/services/:serviceId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    await pool.query(
      "DELETE FROM cart_service_items WHERE user_id = $1 AND service_id = $2",
      [user.id, req.params.serviceId]
    );

    res.json({ success: true, message: "Service removed from cart" });
  } catch (error) {
    next(error);
  }
});

// Orders routes

// Create order from cart (customer only)
router.post("/orders", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Only customers can create orders" });
    }

    // Get cart items with product and business info
    const cartResult = await pool.query(
      `SELECT ci.*, p.name, p.price, p.stock, p.business_id, 
              b.business_name as business_name, b.business_address, b.postcode, b.city
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN businesses b ON p.business_id = b.id
       WHERE ci.user_id = $1
       ORDER BY p.business_id, ci.created_at`,
      [user.id]
    );

    // Get cart service items with service and business info
    const cartServiceResult = await pool.query(
      `SELECT csi.*, s.name, s.price, s.duration_minutes, s.business_id,
              b.business_name, b.business_address, b.postcode, b.city
       FROM cart_service_items csi
       JOIN services s ON csi.service_id = s.id
       JOIN businesses b ON s.business_id = b.id
       WHERE csi.user_id = $1
       ORDER BY s.business_id, csi.created_at`,
      [user.id]
    );

    if (cartResult.rows.length === 0 && cartServiceResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Get booking information from request body (for services)
    // Support both single booking (backward compatibility) and per-business bookings
    const { bookingDate, bookingTime, businessBookings } = req.body;
    
    // Validate booking info if services are in cart
    if (cartServiceResult.rows.length > 0) {
      // If businessBookings is provided, use per-business bookings
      if (businessBookings && typeof businessBookings === 'object') {
        // Validate each business's booking
        for (const serviceItem of cartServiceResult.rows) {
          const businessBooking = businessBookings[serviceItem.business_id];
          if (!businessBooking || !businessBooking.date || !businessBooking.time) {
            return res.status(400).json({
              success: false,
              message: `Booking date and time are required for services from ${serviceItem.business_name || 'this business'}`,
            });
          }

          // Validate cutoff rules for same-day service bookings
          const bookingDateObj = new Date(businessBooking.date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const bookingDateOnly = new Date(bookingDateObj);
          bookingDateOnly.setHours(0, 0, 0, 0);
          const isSameDay = bookingDateOnly.getTime() === today.getTime();

          if (isSameDay) {
            const cutoffCheck = await availabilityService.isSameDayPickupAllowed(serviceItem.business_id);
            if (!cutoffCheck.allowed) {
              return res.status(400).json({
                success: false,
                message: cutoffCheck.reason || "Same-day booking is not available for this business. Please select tomorrow or later.",
              });
            }
          }

          const locked = await availabilityService.lockSlot(
            serviceItem.business_id,
            businessBooking.date,
            businessBooking.time,
            user.id
          );

          if (!locked) {
            return res.status(400).json({
              success: false,
              message: `The selected time slot is no longer available for ${serviceItem.name}. Please choose another time.`,
            });
          }
        }
      } else {
        // Backward compatibility: single booking for all services (assumes same business)
        if (!bookingDate || !bookingTime) {
          return res.status(400).json({
            success: false,
            message: "Booking date and time are required for service orders",
          });
        }

        // Validate cutoff rules for same-day service bookings (check first service's business)
        const firstServiceBusinessId = cartServiceResult.rows[0]?.business_id;
        if (firstServiceBusinessId) {
          const bookingDateObj = new Date(bookingDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const bookingDateOnly = new Date(bookingDateObj);
          bookingDateOnly.setHours(0, 0, 0, 0);
          const isSameDay = bookingDateOnly.getTime() === today.getTime();

          if (isSameDay) {
            const cutoffCheck = await availabilityService.isSameDayPickupAllowed(firstServiceBusinessId);
            if (!cutoffCheck.allowed) {
              return res.status(400).json({
                success: false,
                message: cutoffCheck.reason || "Same-day booking is not available for this business. Please select tomorrow or later.",
              });
            }
          }
        }

        // Validate and lock booking slots for each service
        for (const serviceItem of cartServiceResult.rows) {
          const locked = await availabilityService.lockSlot(
            serviceItem.business_id,
            bookingDate,
            bookingTime,
            user.id
          );

          if (!locked) {
            return res.status(400).json({
              success: false,
              message: `The selected time slot is no longer available for ${serviceItem.name}. Please choose another time.`,
            });
          }
        }
      }
    }

    // Validate cutoff rules for product orders (same-day pickup)
    if (cartResult.rows.length > 0) {
      const businessCutoffChecks = new Map<string, { allowed: boolean; reason?: string }>();
      
      for (const item of cartResult.rows) {
        if (!businessCutoffChecks.has(item.business_id)) {
          const cutoffCheck = await availabilityService.isSameDayPickupAllowed(item.business_id);
          businessCutoffChecks.set(item.business_id, cutoffCheck);
          
          if (!cutoffCheck.allowed) {
            return res.status(400).json({
              success: false,
              message: cutoffCheck.reason || "Same-day pickup is not available for this business.",
            });
          }
        }
      }
    }

    // Validate stock and group by business (products)
    const businessGroups = new Map<string, typeof cartResult.rows>();
    const stockErrors: string[] = [];

    for (const item of cartResult.rows) {
      // Check stock availability
      if (item.stock < item.quantity) {
        stockErrors.push(`${item.name}: Only ${item.stock} available, requested ${item.quantity}`);
        continue;
      }

      // Group by business
      const businessId = item.business_id;
      if (!businessGroups.has(businessId)) {
        businessGroups.set(businessId, []);
      }
      businessGroups.get(businessId)!.push(item);
    }

    // Group services by business
    const serviceBusinessGroups = new Map<string, typeof cartServiceResult.rows>();
    for (const serviceItem of cartServiceResult.rows) {
      const businessId = serviceItem.business_id;
      if (!serviceBusinessGroups.has(businessId)) {
        serviceBusinessGroups.set(businessId, []);
      }
      serviceBusinessGroups.get(businessId)!.push(serviceItem);
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock for some items",
        errors: stockErrors,
      });
    }

    // Handle discount code if provided
    const { discountCode, pointsToRedeem } = req.body;
    let discountAmount = 0;
    let pointsRedeemed = 0;

    // Calculate total before discount (products + services)
    const productsTotal = cartResult.rows.reduce(
      (sum, item) => sum + parseFloat(item.price) * item.quantity,
      0
    );
    const servicesTotal = cartServiceResult.rows.reduce(
      (sum, item) => sum + parseFloat(item.price) * item.quantity,
      0
    );
    const totalBeforeDiscount = productsTotal + servicesTotal;

    // Validate and apply discount code
    if (discountCode) {
      try {
        const validation = await rewardsService.validateDiscountCode(discountCode, totalBeforeDiscount);
        if (validation.valid) {
          discountAmount = validation.discount!.amount;
        }
      } catch (err) {
        // Discount code invalid, continue without it
        console.error('Discount code validation error:', err);
      }
    }

    // Handle points redemption
    if (pointsToRedeem && pointsToRedeem > 0) {
      try {
        const points = await rewardsService.getUserPoints(user.id);
        const redeemAmount = Math.min(pointsToRedeem, points.balance);
        if (redeemAmount > 0) {
          pointsRedeemed = redeemAmount;
        }
      } catch (err) {
        console.error('Points redemption error:', err);
      }
    }

    // Combine all businesses (products + services)
    const allBusinessIds = new Set([
      ...Array.from(businessGroups.keys()),
      ...Array.from(serviceBusinessGroups.keys()),
    ]);
    const totalBusinesses = allBusinessIds.size;

    // Create orders for each business
    const createdOrders = [];

    for (const businessId of allBusinessIds) {
      const items = businessGroups.get(businessId) || [];
      const serviceItems = serviceBusinessGroups.get(businessId) || [];

      // Calculate total for this business's order (products + services)
      const productsTotal = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
      const servicesTotal = serviceItems.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
      let total = productsTotal + servicesTotal;
      
      // Apply discount proportionally (if multiple businesses, split discount)
      const businessDiscount = totalBusinesses > 1 
        ? (discountAmount / totalBusinesses) 
        : discountAmount;
      const businessPoints = totalBusinesses > 1
        ? (pointsRedeemed / totalBusinesses)
        : pointsRedeemed;
      
      total = Math.max(0, total - businessDiscount - businessPoints);

      // Build pickup location from business address
      const business = items[0] || serviceItems[0];
      const pickupLocationParts: string[] = [];
      if (business.business_address) pickupLocationParts.push(business.business_address);
      if (business.postcode) pickupLocationParts.push(business.postcode);
      if (business.city) pickupLocationParts.push(business.city);
      const pickupLocation = pickupLocationParts.length > 0 ? pickupLocationParts.join(", ") : null;

      // Get pickup instructions from request body if provided
      const { pickupInstructions } = req.body;

      // Determine if this is a service order (has services)
      const isServiceOrder = serviceItems.length > 0;
      const bookingDuration = isServiceOrder && serviceItems.length > 0
        ? serviceItems[0].duration_minutes
        : null;

      // Get booking date/time for this business
      let businessBookingDate: string | null = null;
      let businessBookingTime: string | null = null;
      
      if (isServiceOrder) {
        if (businessBookings && typeof businessBookings === 'object' && businessBookings[businessId]) {
          // Use per-business booking
          businessBookingDate = businessBookings[businessId].date;
          businessBookingTime = businessBookings[businessId].time;
        } else if (bookingDate && bookingTime) {
          // Backward compatibility: use single booking
          businessBookingDate = bookingDate;
          businessBookingTime = bookingTime;
        }
      }

      // Create order with status 'awaiting_payment' - payment must be confirmed before finalizing
      // Stock will NOT be deducted and cart will NOT be cleared until payment succeeds
      const orderResult = await pool.query(
        `INSERT INTO orders (user_id, business_id, status, total, pickup_location, pickup_instructions, discount_amount, points_used, booking_date, booking_time, booking_duration_minutes, booking_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          user.id,
          businessId,
          "awaiting_payment", // Order is reserved, awaiting payment confirmation
          total,
          pickupLocation,
          pickupInstructions || null,
          businessDiscount,
          businessPoints,
          businessBookingDate,
          businessBookingTime,
          bookingDuration,
          isServiceOrder ? 'confirmed' : null,
        ]
      );

      const order = orderResult.rows[0];

      // Apply discount code to order if provided (this is OK to do now)
      if (discountCode && businessDiscount > 0) {
        try {
          await rewardsService.applyDiscountCode(order.id, discountCode);
        } catch (err) {
          console.error('Failed to apply discount code:', err);
        }
      }

      // NOTE: Points redemption will happen after payment succeeds (in webhook)
      // We store the points amount but don't redeem yet

      // Create order items (but DON'T deduct stock yet - will happen after payment)
      for (const item of items) {
        // Create order item record
        await pool.query(
          `INSERT INTO order_items (order_id, product_id, quantity, price)
           VALUES ($1, $2, $3, $4)`,
          [order.id, item.product_id, item.quantity, item.price]
        );

        // DO NOT deduct stock here - will be done after payment succeeds
        // DO NOT clear cart here - will be done after payment succeeds
      }

      // Create order service items (services)
      for (const serviceItem of serviceItems) {
        await pool.query(
          `INSERT INTO order_service_items (order_id, service_id, quantity, price, booking_date, booking_time, booking_duration_minutes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            order.id,
            serviceItem.service_id,
            serviceItem.quantity,
            serviceItem.price,
            businessBookingDate,
            businessBookingTime,
            serviceItem.duration_minutes,
          ]
        );

        // DO NOT clear cart here - will be done after payment succeeds
      }

      // Get order with items for response (products)
      const itemsResult = await pool.query(
        `SELECT oi.*, p.name as product_name, p.images
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      // Get order service items for response
      const serviceItemsResult = await pool.query(
        `SELECT osi.*, s.name as service_name, s.images
         FROM order_service_items osi
         JOIN services s ON osi.service_id = s.id
         WHERE osi.order_id = $1`,
        [order.id]
      );

      createdOrders.push({
        ...order,
        business_name: (items[0] || serviceItems[0]).business_name,
        items: itemsResult.rows,
        serviceItems: serviceItemsResult.rows,
      });

      // Send booking confirmation emails if this is a service order
      if (isServiceOrder && businessBookingDate && businessBookingTime) {
        try {
          // Get customer details
          const customerResult = await pool.query(
            `SELECT username, email FROM users WHERE id = $1`,
            [user.id]
          );
          const customer = customerResult.rows[0];

          // Get business details
          const businessResult = await pool.query(
            `SELECT b.business_name, u.email as business_email
             FROM businesses b
             JOIN users u ON b.user_id = u.id
             WHERE b.id = $1`,
            [businessId]
          );
          const business = businessResult.rows[0];

          if (customer && business) {
            // Prepare service details
            const serviceDetails = serviceItemsResult.rows.map((item: any) => ({
              name: item.service_name,
              quantity: item.quantity,
              price: parseFloat(item.price),
            }));

            // Send customer confirmation email
            await emailService.sendBookingConfirmationToCustomer(
              customer.email,
              customer.username,
              {
                orderId: order.id,
                businessName: business.business_name,
                bookingDate: businessBookingDate,
                bookingTime: businessBookingTime,
                duration: bookingDuration || 60,
                services: serviceDetails,
                total: parseFloat(order.total),
                pickupLocation: pickupLocation || undefined,
                pickupInstructions: pickupInstructions || undefined,
              }
            );

            // Send business notification email
            await emailService.sendBookingNotificationToBusiness(
              business.business_email,
              business.business_name,
              {
                orderId: order.id,
                customerName: customer.username,
                customerEmail: customer.email,
                bookingDate: businessBookingDate,
                bookingTime: businessBookingTime,
                duration: bookingDuration || 60,
                services: serviceDetails,
                total: parseFloat(order.total),
                pickupInstructions: pickupInstructions || undefined,
              }
            );
          }
        } catch (emailError: any) {
          // Log email errors but don't fail the order creation
          console.error(`[Order] Failed to send booking confirmation emails for order ${order.id}:`, emailError);
        }
      }
    }

    // Detect platform (mobile or web)
    const platform = req.get("X-Platform") === "mobile" ? "mobile" : "web";
    const isMobile = platform === "mobile";

    // After creating orders, create Stripe payment methods based on platform
    const checkoutSessions = [];
    const paymentIntents = [];

    for (const order of createdOrders) {
      // Check if business has Stripe Connect
      const stripeAccount = await pool.query(
        `SELECT sca.stripe_account_id, sca.charges_enabled
         FROM stripe_connect_accounts sca
         WHERE sca.business_id = $1 AND sca.charges_enabled = true`,
        [order.business_id]
      );

      if (stripeAccount.rows.length > 0) {
        try {
          if (isMobile) {
            // For mobile: Create Payment Intent for native Stripe checkout
            const paymentIntent = await stripeService.createPaymentIntent(
              order.id,
              order.business_id,
              parseFloat(order.total),
              'gbp',
              user.email
            );

            if (!paymentIntent || !paymentIntent.client_secret) {
              console.error(`[Order] Payment intent created but client_secret is missing for order ${order.id}`);
              throw new Error('Failed to create payment intent: Missing client_secret');
            }

            // Update order with payment intent ID
            await pool.query(
              'UPDATE orders SET stripe_session_id = $1 WHERE id = $2',
              [paymentIntent.id, order.id]
            );

            paymentIntents.push({
              orderId: order.id,
              clientSecret: paymentIntent.client_secret,
              paymentIntentId: paymentIntent.id,
            });
          } else {
            // For web: Create Checkout Session
            const backendUrl = process.env.BACKEND_URL || process.env.API_URL || `${req.protocol}://${req.get("host")}`;
            const successUrl = `${backendUrl}/api/stripe/success?orderId=${order.id}`;
            const cancelUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout?canceled=true`;   

            const session = await stripeService.createCheckoutSession(
              order.id,
              order.business_id,
              parseFloat(order.total),
              'gbp',
              successUrl,
              cancelUrl,
              user.email
            );

            if (!session || !session.url) {
              console.error(`[Order] Stripe checkout session created but URL is missing for order ${order.id}`);
              throw new Error('Failed to create Stripe checkout session: Missing checkout URL');
            }

            // Update order with session ID
            await pool.query(
              'UPDATE orders SET stripe_session_id = $1 WHERE id = $2',
              [session.id, order.id]
            );

            checkoutSessions.push({
              orderId: order.id,
              checkoutUrl: session.url,
            });
          }
        } catch (error: any) {
          console.error(`[Order] Failed to create Stripe payment for order ${order.id}:`, error);
          // If payment creation fails, we should still allow the order to be created
          // but log the error and potentially notify the user
        }
      } else {
        console.warn(`[Order] Business ${order.business_id} does not have Stripe Connect enabled. Order ${order.id} created without payment.`);
      }
    }

    // If we have orders but no payment methods, this is a problem
    // All orders should require payment via Stripe
    if (createdOrders.length > 0 && checkoutSessions.length === 0 && paymentIntents.length === 0) {
      console.error('[Order] Orders created but no payment methods were created. This may indicate missing Stripe Connect setup.');
      // You might want to return an error here, or at least warn the user
      // For now, we'll allow it but the frontend should handle this case
    }

    // Award cashback points (1% of total order amount) - only after payment is confirmed
    // This will be handled by the webhook when payment succeeds

    res.status(201).json({
      success: true,
      message: `Created ${createdOrders.length} order(s)`,
      data: {
        orders: createdOrders,
        checkoutSessions: checkoutSessions.length > 0 ? checkoutSessions : null,
        paymentIntents: paymentIntents.length > 0 ? paymentIntents : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get orders
router.get("/orders", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    let query = `
      SELECT o.*, b.business_name as business_name,
             u.username as customer_name, u.email as customer_email,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;

    let params: string[] = [];

    if (user.role === "customer") {
      query += ` AND o.user_id = $1`;
      params = [user.id];
        } else if (user.role === "business") {
      const businessId = await productService.getBusinessIdByUserId(user.id);
      if (businessId) {
        query += ` AND o.business_id = $1`;
        params = [businessId];
      } else {
        return res.json({ success: true, data: [] });
      }
    }

    query += ` ORDER BY o.created_at DESC`;

    const result = await pool.query(query, params);

    // Get order items for each order (products + services)
    const ordersWithItems = await Promise.all(
      result.rows.map(async (order) => {
        const itemsResult = await pool.query(
          `SELECT oi.*, p.name as product_name, p.images
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1`,
          [order.id]
        );
        const serviceItemsResult = await pool.query(
          `SELECT osi.*, s.name as service_name, s.images
           FROM order_service_items osi
           JOIN services s ON osi.service_id = s.id
           WHERE osi.order_id = $1`,
          [order.id]
        );
        return {
          ...order,
          items: itemsResult.rows,
          serviceItems: serviceItemsResult.rows,
        };
      })
    );

    res.json({ success: true, data: ordersWithItems });
  } catch (error) {
    next(error);
  }
});

// Get order by ID
router.get("/orders/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const orderResult = await pool.query(
      `SELECT o.*, b.business_name as business_name,
              u.username as customer_name, u.email as customer_email
       FROM orders o
       JOIN businesses b ON o.business_id = b.id
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [req.params.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orderResult.rows[0];

    // Check permissions
    if (user.role === "customer" && order.user_id !== user.id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (user.role === "business") {
      const businessId = await productService.getBusinessIdByUserId(user.id);
      if (!businessId || order.business_id !== businessId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    // Get order items (products + services)
    const itemsResult = await pool.query(
      `SELECT oi.*, p.name as product_name, p.images, p.description as product_description
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    const serviceItemsResult = await pool.query(
      `SELECT osi.*, s.name as service_name, s.images, s.description as service_description
       FROM order_service_items osi
       JOIN services s ON osi.service_id = s.id
       WHERE osi.order_id = $1`,
      [order.id]
    );

    res.json({
      success: true,
      data: {
        ...order,
        items: itemsResult.rows,
        serviceItems: serviceItemsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Retry payment for abandoned orders (customer only)
router.post("/orders/:id/retry-payment", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Only customers can retry payment" });
    }

    const orderResult = await pool.query(
      `SELECT o.*, b.business_name as business_name
       FROM orders o
       JOIN businesses b ON o.business_id = b.id
       WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orderResult.rows[0];

    // Check if payment is actually needed
    if (order.stripe_payment_intent_id) {
      return res.status(400).json({ 
        success: false, 
        message: "Payment already completed for this order" 
      });
    }

    if (order.status !== 'awaiting_payment') {
      return res.status(400).json({ 
        success: false, 
        message: `Order is not awaiting payment (current status: ${order.status})` 
      });
    }

    // Check if business has Stripe Connect
    const stripeAccount = await pool.query(
      `SELECT sca.stripe_account_id, sca.charges_enabled
       FROM stripe_connect_accounts sca
       WHERE sca.business_id = $1 AND sca.charges_enabled = true`,
      [order.business_id]
    );

    if (stripeAccount.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Payment processing is not available for this business" 
      });
    }

    // Create new checkout session
    const backendUrl = process.env.BACKEND_URL || process.env.API_URL || `${req.protocol}://${req.get("host")}`;
    const successUrl = `${backendUrl}/api/stripe/success?orderId=${order.id}`;
    const cancelUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/orders/${order.id}?canceled=true`;

    const session = await stripeService.createCheckoutSession(
      order.id,
      order.business_id,
      parseFloat(order.total),
      'gbp',
      successUrl,
      cancelUrl,
      user.email
    );

    if (!session || !session.url) {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to create checkout session" 
      });
    }

    // Update order with new session ID
    await pool.query(
      'UPDATE orders SET stripe_session_id = $1 WHERE id = $2',
      [session.id, order.id]
    );

    res.json({
      success: true,
      data: {
        checkoutUrl: session.url,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update order status (business only)
router.put("/orders/:id/status", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update order status" });
    }

    const { status } = req.body;
    const validStatuses = ["awaiting_payment", "pending", "processing", "shipped", "delivered", "cancelled", "ready_for_pickup", "picked_up"];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const businessId = await productService.getBusinessIdByUserId(user.id);
    if (!businessId) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    // Verify order belongs to this business
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found or access denied" });
    }

    const existingOrder = orderResult.rows[0];

    // Update order status with BOPIS timestamp tracking
    let updateQuery = `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP`;
    const updateParams: any[] = [status];
    let paramCount = 1;

    // If order status is being changed from 'pending' to a non-pending status,
    // and business_amount is not set, calculate and set it
    if (existingOrder.status === 'pending' && status !== 'pending' && status !== 'cancelled' && !existingOrder.business_amount) {
      // Get commission rate
      const DEFAULT_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || "0.10");
      let commissionRate = DEFAULT_COMMISSION_RATE;
      
      try {
        const commissionResult = await pool.query(
          "SELECT setting_value FROM platform_settings WHERE setting_key = 'commission_rate'"
        );
        if (commissionResult.rows.length > 0 && commissionResult.rows[0].setting_value) {
          const rate = parseFloat(commissionResult.rows[0].setting_value);
          if (!isNaN(rate) && rate >= 0 && rate <= 1) {
            commissionRate = rate;
          }
        }
      } catch (error) {
        console.error("[Order Status] Failed to fetch commission rate, using default:", error);
      }

      const orderTotal = parseFloat(existingOrder.total);
      const platformCommission = orderTotal * commissionRate;
      const businessAmount = orderTotal - platformCommission;

      updateQuery += `, platform_commission = $${++paramCount}, business_amount = $${++paramCount}`;
      updateParams.push(platformCommission, businessAmount);
    }

    // Set timestamps for BOPIS statuses
    if (status === "ready_for_pickup") {
      updateQuery += `, ready_for_pickup_at = CURRENT_TIMESTAMP`;
    } else if (status === "picked_up") {
      updateQuery += `, picked_up_at = CURRENT_TIMESTAMP`;
    }

    // Always use the next parameter index for the WHERE clause (order ID)
    updateQuery += ` WHERE id = $${++paramCount} RETURNING *`;
    updateParams.push(req.params.id);

    const updatedResult = await pool.query(updateQuery, updateParams);

    // Get order with items for response
    const order = updatedResult.rows[0];
    const itemsResult = await pool.query(
      `SELECT oi.*, p.name as product_name, p.images
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    res.json({
      success: true,
      message: "Order status updated successfully",
      data: {
        ...order,
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// QR Code routes for orders

// Generate QR code for order (customer can view, business can scan)
router.get("/orders/:id/qr-code", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const orderId = req.params.id;

    // Verify order exists and user has access
    const orderResult = await pool.query(
      `SELECT o.*, b.business_name as business_name
       FROM orders o
       JOIN businesses b ON o.business_id = b.id
       WHERE o.id = $1 AND (o.user_id = $2 OR o.business_id = (SELECT id FROM businesses WHERE user_id = $2))`,
      [orderId, user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found or access denied" });
    }

    const order = orderResult.rows[0];

    // Create QR code data with order ID and a signature for security
    const qrData = {
      orderId: order.id,
      timestamp: new Date().toISOString(),
      // Add a signature to prevent tampering
      signature: crypto
        .createHash('sha256')
        .update(`${order.id}${order.created_at}${process.env.QR_SECRET || 'default-secret'}`)
        .digest('hex')
        .substring(0, 16)
    };

    const qrCodeString = JSON.stringify(qrData);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 1
    });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        orderId: order.id,
        orderNumber: order.id.substring(0, 8).toUpperCase()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Verify and scan QR code (business only)
router.post("/orders/verify-qr", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ 
        success: false, 
        message: "Only businesses can verify QR codes" 
      });
    }

    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({ 
        success: false, 
        message: "QR code data is required" 
      });
    }

    // Parse QR code data
    let parsedData;
    try {
      parsedData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (e) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid QR code format" 
      });
    }

    const { orderId, signature } = parsedData;

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID not found in QR code" 
      });
    }

    // Get business ID
    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Business profile not found" 
      });
    }

    const businessId = businessResult.rows[0].id;

    // Verify order exists and belongs to this business
    const orderResult = await pool.query(
      `SELECT o.*, 
              u.username as customer_name, 
              u.email as customer_email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1 AND o.business_id = $2`,
      [orderId, businessId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found or does not belong to this business" 
      });
    }

    const order = orderResult.rows[0];

    // Verify signature
    const expectedSignature = crypto
      .createHash('sha256')
      .update(`${order.id}${order.created_at}${process.env.QR_SECRET || 'default-secret'}`)
      .digest('hex')
      .substring(0, 16);

    if (signature !== expectedSignature) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid QR code signature" 
      });
    }

    // Check if order is already picked up
    if (order.status === 'picked_up') {
      return res.status(400).json({ 
        success: false, 
        message: "Order has already been picked up",
        data: {
          orderId: order.id,
          status: order.status,
          pickedUpAt: order.picked_up_at
        }
      });
    }

    // Check if order is cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        message: "Order has been cancelled" 
      });
    }

    // Check if order is expired (optional - e.g., 30 days old)
    const orderAge = Date.now() - new Date(order.created_at).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (orderAge > thirtyDays) {
      return res.status(400).json({ 
        success: false, 
        message: "Order QR code has expired (older than 30 days)" 
      });
    }

    // Check if already scanned (optional - prevent duplicate scans)
    if (order.qr_code_scanned_at) {
      return res.status(400).json({ 
        success: false, 
        message: "QR code has already been scanned",
        data: {
          orderId: order.id,
          scannedAt: order.qr_code_scanned_at
        }
      });
    }

    // Update order status to picked_up and record scan
    const updateResult = await pool.query(
      `UPDATE orders 
       SET status = 'picked_up', 
           picked_up_at = CURRENT_TIMESTAMP,
           qr_code_scanned_at = CURRENT_TIMESTAMP,
           qr_code_scanned_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [user.id, orderId]
    );

    // Get order items for response
    const itemsResult = await pool.query(
      `SELECT oi.*, p.name as product_name, p.images
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    res.json({
      success: true,
      message: "Order verified and marked as picked up",
      data: {
        ...updateResult.rows[0],
        items: itemsResult.rows,
        customerName: order.customer_name,
        customerEmail: order.customer_email
      }
    });
  } catch (error) {
    next(error);
  }
});

// Decode QR code from image (business only)
router.post("/orders/decode-qr-image", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ 
        success: false, 
        message: "Only businesses can decode QR codes from images" 
      });
    }

    const { image } = req.body; // Base64 encoded image

    if (!image) {
      return res.status(400).json({ 
        success: false, 
        message: "Image is required" 
      });
    }

    try {
      // Decode base64 image and scan for QR code
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Use jsQR and Jimp to decode QR code from image
      // Use require for Jimp as it works better with CommonJS/ES module interop
      // When using require() with Jimp, the class is at Jimp.Jimp
      const JimpModule = require('jimp');
      const Jimp = JimpModule.Jimp || JimpModule.default || JimpModule;
      const jsQRModule = await import('jsqr');
      const jsQR = (jsQRModule.default || jsQRModule) as any;

      // Load image using Jimp - read is a static method
      const jimpImage = await Jimp.read(imageBuffer);
      
      // Convert to RGBA format for jsQR
      const imageData = {
        data: new Uint8ClampedArray(jimpImage.bitmap.data),
        width: jimpImage.bitmap.width,
        height: jimpImage.bitmap.height,
      };

      // Decode QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "No QR code found in the image. Please ensure the QR code is clearly visible.",
        });
      }

      res.json({
        success: true,
        data: {
          qrData: code.data,
        },
      });
    } catch (decodeError: any) {
      console.error('QR decode error:', decodeError);
      return res.status(400).json({
        success: false,
        message: decodeError.message || "Failed to decode QR code from image. Please try another image or use live camera scanning.",
      });
    }
  } catch (error) {
    next(error);
  }
});

// Reviews routes

// Get reviews for a product
router.get("/products/:id/reviews", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.username, u.email
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Submit a review (customer only, must have purchased the product)
router.post("/products/:id/reviews", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Only customers can submit reviews" });
    }

    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if product exists
    const productResult = await pool.query("SELECT id FROM products WHERE id = $1", [req.params.id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check if user has purchased this product (optional validation - can be made stricter)
    const orderCheck = await pool.query(
      `SELECT oi.id
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.product_id = $1 AND o.user_id = $2 AND o.status = 'delivered'
       LIMIT 1`,
      [req.params.id, user.id]
    );

    // Allow review even if not purchased (for MVP - can be made stricter later)
    // if (orderCheck.rows.length === 0) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "You must purchase and receive this product before reviewing",
    //   });
    // }

    // Check if user already reviewed this product
    const existingReview = await pool.query(
      "SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2",
      [req.params.id, user.id]
    );

    if (existingReview.rows.length > 0) {
      // Update existing review
      await pool.query(
        `UPDATE reviews 
         SET rating = $1, comment = $2, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $3 AND user_id = $4
         RETURNING *`,
        [rating, comment || null, req.params.id, user.id]
      );
    } else {
      // Create new review
      await pool.query(
        `INSERT INTO reviews (product_id, user_id, rating, comment)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, user.id, rating, comment || null]
      );
    }

    // Update product review statistics
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as review_count,
         COALESCE(AVG(rating), 0) as average_rating
       FROM reviews
       WHERE product_id = $1`,
      [req.params.id]
    );

    const stats = statsResult.rows[0];
    await pool.query(
      `UPDATE products 
       SET review_count = $1, average_rating = ROUND($2::numeric, 2)
       WHERE id = $3`,
      [parseInt(stats.review_count), parseFloat(stats.average_rating), req.params.id]
    );

    res.json({ success: true, message: "Review submitted successfully" });
  } catch (error) {
    next(error);
  }
});

// Service Reviews
router.get("/services/:id/reviews", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.username, u.email
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.service_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/services/:id/reviews", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Only customers can submit reviews" });
    }

    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if service exists
    const serviceResult = await pool.query("SELECT id FROM services WHERE id = $1", [req.params.id]);
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    // Check if user already reviewed this service
    const existingReview = await pool.query(
      "SELECT id FROM reviews WHERE service_id = $1 AND user_id = $2",
      [req.params.id, user.id]
    );

    if (existingReview.rows.length > 0) {
      // Update existing review
      await pool.query(
        `UPDATE reviews 
         SET rating = $1, comment = $2, updated_at = CURRENT_TIMESTAMP
         WHERE service_id = $3 AND user_id = $4
         RETURNING *`,
        [rating, comment || null, req.params.id, user.id]
      );
    } else {
      // Create new review
      await pool.query(
        `INSERT INTO reviews (service_id, user_id, rating, comment)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, user.id, rating, comment || null]
      );
    }

    // Update service review statistics
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as review_count,
         COALESCE(AVG(rating), 0) as average_rating
       FROM reviews
       WHERE service_id = $1`,
      [req.params.id]
    );

    const stats = statsResult.rows[0];
    await pool.query(
      `UPDATE services 
       SET review_count = $1, average_rating = ROUND($2::numeric, 2)
       WHERE id = $3`,
      [parseInt(stats.review_count), parseFloat(stats.average_rating), req.params.id]
    );

    res.json({ success: true, message: "Review submitted successfully" });
  } catch (error) {
    next(error);
  }
});

// Wishlist routes

// Get user's wishlist
router.get("/wishlist", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const result = await pool.query(
      `SELECT w.*, p.name, p.price, p.images, p.category, 
              b.business_name as business_name,
              COALESCE(p.review_count, 0) as review_count,
              COALESCE(p.average_rating, 0) as average_rating
       FROM wishlist_items w
       JOIN products p ON w.product_id = p.id
       JOIN businesses b ON p.business_id = b.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Check if product is in wishlist (for multiple products) - MUST come before /wishlist/:productId
router.post("/wishlist/check", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { productIds } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "productIds must be an array" });
    }

    if (productIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Ensure all IDs are strings and valid
    const validIds = productIds.filter(id => id && typeof id === 'string');

    if (validIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Use a simpler query with proper array handling
    const result = await pool.query(
      `SELECT product_id 
       FROM wishlist_items 
       WHERE user_id = $1 
       AND product_id = ANY($2)`,
      [user.id, validIds]
    );

    const wishlistProductIds = result.rows.map((row) => row.product_id);
    res.json({ success: true, data: wishlistProductIds });
  } catch (error) {
    console.error("Wishlist check error:", error);
    next(error);
  }
});

// Add product to wishlist - MUST come after /wishlist/check
router.post("/wishlist/:productId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Check if product exists
    const productCheck = await pool.query(
      "SELECT id FROM products WHERE id = $1",
      [req.params.productId]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check if already in wishlist
    const existing = await pool.query(
      "SELECT id FROM wishlist_items WHERE user_id = $1 AND product_id = $2",
      [user.id, req.params.productId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: "Product already in wishlist" });
    }

    // Add to wishlist
    await pool.query(
      "INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2)",
      [user.id, req.params.productId]
    );

    res.json({ success: true, message: "Product added to wishlist" });
  } catch (error) {
    next(error);
  }
});

// Remove product from wishlist
router.delete("/wishlist/:productId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    await pool.query(
      "DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2",
      [user.id, req.params.productId]
    );

    res.json({ success: true, message: "Product removed from wishlist" });
  } catch (error) {
    next(error);
  }
});

// Image upload endpoint
import multer from "multer";

// Configure multer storage
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, "..", "..", "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed"));
    }
  },
});

router.post("/upload/image", isAuthenticated, upload.single("image"), async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Return the URL to access the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Business approval (admin only)
router.get("/businesses/pending", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const result = await pool.query(
      `SELECT b.*, u.username, u.email
       FROM businesses b
       JOIN users u ON b.user_id = u.id
       WHERE b.is_approved = false
       ORDER BY b.created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/businesses/:id/approve", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can approve businesses" });
    }

    await pool.query(
      "UPDATE businesses SET is_approved = true WHERE id = $1",
      [req.params.id]
    );

    res.json({ success: true, message: "Business approved" });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all businesses with pagination and filters
router.get("/admin/businesses", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status as string || "all"; // pending, approved, all
    const city = req.query.city as string;
    const search = req.query.search as string;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Status filter
    if (status === "pending") {
      whereConditions.push(`b.is_approved = false`);
    } else if (status === "approved") {
      whereConditions.push(`b.is_approved = true`);
    }

    // City filter
    if (city) {
      whereConditions.push(`b.city = $${paramIndex}`);
      queryParams.push(city);
      paramIndex++;
    }

    // Search filter (business name, email, username)
    if (search) {
      whereConditions.push(`(
        b.business_name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex} OR 
        u.username ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM businesses b
      JOIN users u ON b.user_id = u.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get businesses
    const dataQuery = `
      SELECT 
        b.*,
        u.username,
        u.email,
        CASE 
          WHEN b.trial_ends_at IS NOT NULL AND b.trial_ends_at > NOW() THEN 'trial'
          WHEN b.billing_status = 'suspended' THEN 'suspended'
          ELSE 'active'
        END as trial_status
      FROM businesses b
      JOIN users u ON b.user_id = u.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: {
        businesses: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all users with pagination and filters
router.get("/admin/users", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const role = req.query.role as string || "all"; // customer, business, admin, all
    const search = req.query.search as string;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Role filter
    if (role !== "all") {
      whereConditions.push(`u.role = $${paramIndex}`);
      queryParams.push(role);
      paramIndex++;
    }

    // Search filter (email, username)
    if (search) {
      whereConditions.push(`(
        u.email ILIKE $${paramIndex} OR 
        u.username ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get users (exclude password)
    const dataQuery = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        u.google_id
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: {
        users: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Update business billing settings
router.put("/admin/businesses/:id/billing", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { commission_rate_override, trial_ends_at, billing_status } = req.body;
    const businessId = req.params.id;

    // Validate commission_rate_override if provided
    if (commission_rate_override !== undefined && commission_rate_override !== null) {
      const rate = parseFloat(commission_rate_override);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        return res.status(400).json({
          success: false,
          message: "Commission rate override must be a number between 0 and 1",
        });
      }
    }

    // Validate billing_status if provided
    if (billing_status && !["trial", "active", "suspended"].includes(billing_status)) {
      return res.status(400).json({
        success: false,
        message: "Billing status must be one of: trial, active, suspended",
      });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (commission_rate_override !== undefined) {
      updates.push(`commission_rate_override = $${paramIndex}`);
      params.push(commission_rate_override);
      paramIndex++;
    }

    if (trial_ends_at !== undefined) {
      updates.push(`trial_ends_at = $${paramIndex}`);
      params.push(trial_ends_at ? new Date(trial_ends_at) : null);
      paramIndex++;
    }

    if (billing_status !== undefined) {
      updates.push(`billing_status = $${paramIndex}`);
      params.push(billing_status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    params.push(businessId);
    const updateQuery = `
      UPDATE businesses 
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      });
    }

    res.json({
      success: true,
      message: "Business billing settings updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// Create admin user (one-time setup - only works if no admin exists)
router.post("/admin/setup", async (req, res, next) => {
  try {
    // Check if any admin already exists
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (adminCheck.rows.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Admin user already exists. Use the script to create additional admins.",
      });
    }

    // Validate input
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Check if user already exists
    const existingUser = await storage.getUserByUsername(username) ||
      await storage.getUserByEmail(email);
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    // Create admin user
    const user = await storage.createUser({
      username,
      email,
      password,
      role: "admin",
    });

    // Return user without password
    const { password: _, ...publicUser } = user;
    res.status(201).json({
      success: true,
      message: "Admin user created successfully",
      data: publicUser,
    });
  } catch (error: any) {
    if (error.message === "Username or email already exists") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

// Get support admin ID for chat
router.get("/admin/support", async (req, res, next) => {
  try {
    // Get the first admin user (for support chat)
    const result = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No admin user found. Please create an admin account first.",
      });
    }

    res.json({
      success: true,
      data: {
        adminId: result.rows[0].id,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all orders
router.get("/admin/orders", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { status } = req.query;
    let query = `
      SELECT o.*, b.business_name as business_name,
             u.username as customer_name, u.email as customer_email,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;

    const params: string[] = [];
    if (status && status !== "all") {
      query += ` AND o.status = $1`;
      params.push(status as string);
    }

    query += ` ORDER BY o.created_at DESC`;

    const result = await pool.query(query, params);

    // Get order items for each order
    const ordersWithItems = await Promise.all(
      result.rows.map(async (order) => {
        const itemsResult = await pool.query(
          `SELECT oi.*, p.name as product_name, p.images
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1`,
          [order.id]
        );
        return {
          ...order,
          items: itemsResult.rows,
        };
      })
    );

    res.json({ success: true, data: ordersWithItems });
  } catch (error) {
    next(error);
  }
});

// Admin: Get order by ID
router.get("/admin/orders/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const orderResult = await pool.query(
      `SELECT o.*, b.business_name as business_name,
              u.username as customer_name, u.email as customer_email
       FROM orders o
       JOIN businesses b ON o.business_id = b.id
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [req.params.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsResult = await pool.query(
      `SELECT oi.*, p.name as product_name, p.images, p.category
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [order.id]
    );

    res.json({
      success: true,
      data: {
        ...order,
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get commission tiers configuration
router.get("/admin/settings/commission-tiers", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    res.json({
      success: true,
      data: {
        tiers: COMMISSION_TIERS.map(tier => ({
          name: tier.name,
          minTurnover: tier.minTurnover,
          maxTurnover: tier.maxTurnover,
          commissionRate: tier.commissionRate,
          commissionPercentage: (tier.commissionRate * 100).toFixed(1),
        })),
        turnoverPeriod: "30-day rolling",
        currency: "GBP",
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get business commission tier information
router.get("/admin/businesses/:businessId/commission-tier", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { businessId } = req.params;
    const { tier, turnover } = await stripeService.getCommissionTierForBusiness(businessId);

    // Get business name
    const businessResult = await pool.query(
      "SELECT business_name FROM businesses WHERE id = $1",
      [businessId]
    );

    res.json({
      success: true,
      data: {
        businessId,
        businessName: businessResult.rows[0]?.business_name || "Unknown",
        currentTier: {
          name: tier.name,
          commissionRate: tier.commissionRate,
          commissionPercentage: (tier.commissionRate * 100).toFixed(1),
        },
        turnover: {
          current: turnover,
          period: "30-day rolling",
          currency: "GBP",
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get/Update commission settings (legacy - kept for backward compatibility)
router.get("/admin/settings/commission", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const result = await pool.query(
      "SELECT setting_value FROM platform_settings WHERE setting_key = 'commission_rate'"
    );

    const commissionRate = result.rows[0]?.setting_value || "0.10";

    res.json({
      success: true,
      data: {
        commissionRate: parseFloat(commissionRate),
        note: "This is the legacy default rate. Businesses now use tier-based commissions based on turnover.",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/settings/commission", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { commissionRate } = req.body;
    if (typeof commissionRate !== "number" || commissionRate < 0 || commissionRate > 1) {
      return res.status(400).json({
        success: false,
        message: "Commission rate must be a number between 0 and 1",
      });
    }

    await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
       VALUES ('commission_rate', $1, $2)
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP`,
      [commissionRate.toString(), user.id]
    );

    res.json({
      success: true,
      message: "Commission rate updated successfully",
      data: { commissionRate },
    });
  } catch (error) {
    next(error);
  }
});

// Public: Get active categories (for search page and product creation)
router.get("/categories", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description FROM categories WHERE is_active = TRUE ORDER BY name ASC"
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Admin: Category management
router.get("/admin/categories", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const result = await pool.query(
      "SELECT * FROM categories ORDER BY name ASC"
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/categories", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { name, description } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const result = await pool.query(
      `INSERT INTO categories (name, description)
       VALUES ($1, $2)
       RETURNING *`,
      [name.trim(), description || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Category name already exists" });
    }
    next(error);
  }
});

router.put("/admin/categories/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { name, description, is_active } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(description || null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE categories SET ${updates.join(", ")} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Category name already exists" });
    }
    next(error);
  }
});

router.delete("/admin/categories/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const result = await pool.query("DELETE FROM categories WHERE id = $1 RETURNING *", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Admin: Review moderation
router.get("/admin/reviews", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { status } = req.query;
    let query = `
      SELECT r.*, p.name as product_name, u.username as user_name, u.email as user_email
      FROM reviews r
      JOIN products p ON r.product_id = p.id
      JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;

    const params: string[] = [];
    if (status === "pending") {
      query += ` AND r.is_approved = FALSE`;
    } else if (status === "flagged") {
      query += ` AND r.is_flagged = TRUE`;
    } else if (status === "approved") {
      query += ` AND r.is_approved = TRUE AND r.is_flagged = FALSE`;
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/reviews/:id/approve", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { approve } = req.body;
    const result = await pool.query(
      `UPDATE reviews SET is_approved = $1, is_flagged = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [approve !== false, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/reviews/:id/flag", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const { flag } = req.body;
    const result = await pool.query(
      `UPDATE reviews SET is_flagged = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [flag !== false, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/reviews/:id", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const result = await pool.query("DELETE FROM reviews WHERE id = $1 RETURNING *", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Get Square catalog items
router.get("/business/square/items", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      `SELECT square_access_token, square_location_id
       FROM businesses WHERE user_id = $1`,
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const business = businessResult.rows[0];

    if (!business.square_access_token || !business.square_location_id) {
      return res.status(400).json({ success: false, message: "Square account not connected" });
    }

    const items = await squareService.getCatalogItems(
      business.square_access_token,
      business.square_location_id
    );

    res.json({
      success: true,
      data: items,
    });
  } catch (error: any) {
    next(error);
  }
});

// Get Square item details (price, stock)
router.get("/business/square/items/:itemId/details", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      `SELECT square_access_token, square_location_id
       FROM businesses WHERE user_id = $1`,
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const business = businessResult.rows[0];

    if (!business.square_access_token || !business.square_location_id) {
      return res.status(400).json({ success: false, message: "Square account not connected" });
    }

    const details = await squareService.getItemDetails(
      business.square_access_token,
      business.square_location_id,
      req.params.itemId
    );

    res.json({
      success: true,
      data: details,
    });
  } catch (error: any) {
    next(error);
  }
});

// ==================== BUSINESS POSTS ====================

// Create business post
router.post("/business/posts", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can create posts" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;
    const { content, images } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Post content is required" });
    }

    const result = await pool.query(
      `INSERT INTO business_posts (business_id, content, images)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [businessId, content.trim(), images || []]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get business's own posts
router.get("/business/posts", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    const result = await pool.query(
      `SELECT * FROM business_posts 
       WHERE business_id = $1 
       ORDER BY created_at DESC`,
      [businessId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get public business posts
router.get("/business/:businessId/posts", async (req, res, next) => {
  try {
    const { businessId } = req.params;

    const result = await pool.query(
      `SELECT p.*, b.business_name as business_name, b.banner_image as business_banner_image
       FROM business_posts p
       JOIN businesses b ON p.business_id = b.id
       WHERE p.business_id = $1 AND b.is_approved = true
       ORDER BY p.created_at DESC`,
      [businessId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Update business post
router.put("/business/posts/:postId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update posts" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;
    const { content, images } = req.body;

    // Verify post belongs to business
    const postCheck = await pool.query(
      "SELECT business_id FROM business_posts WHERE id = $1",
      [req.params.postId]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    if (postCheck.rows[0].business_id !== businessId) {
      return res.status(403).json({ success: false, message: "You can only update your own posts" });
    }

    const result = await pool.query(
      `UPDATE business_posts 
       SET content = $1, images = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [content.trim(), images || [], req.params.postId]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete business post
router.delete("/business/posts/:postId", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can delete posts" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Verify post belongs to business
    const postCheck = await pool.query(
      "SELECT business_id FROM business_posts WHERE id = $1",
      [req.params.postId]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    if (postCheck.rows[0].business_id !== businessId) {
      return res.status(403).json({ success: false, message: "You can only delete your own posts" });
    }

    await pool.query("DELETE FROM business_posts WHERE id = $1", [req.params.postId]);

    res.json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// ==================== BUSINESS FOLLOWERS ====================

// Follow business
router.post("/business/:businessId/follow", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { businessId } = req.params;

    // Check if business exists and is approved
    const businessCheck = await pool.query(
      "SELECT id FROM businesses WHERE id = $1 AND is_approved = true",
      [businessId]
    );

    if (businessCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    // Check if already following
    const existing = await pool.query(
      "SELECT id FROM business_followers WHERE business_id = $1 AND user_id = $2",
      [businessId, user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: "Already following this business" });
    }

    await pool.query(
      "INSERT INTO business_followers (business_id, user_id) VALUES ($1, $2)",
      [businessId, user.id]
    );

    res.json({ success: true, message: "Successfully followed business" });
  } catch (error) {
    next(error);
  }
});

// Unfollow business
router.delete("/business/:businessId/follow", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { businessId } = req.params;

    await pool.query(
      "DELETE FROM business_followers WHERE business_id = $1 AND user_id = $2",
      [businessId, user.id]
    );

    res.json({ success: true, message: "Successfully unfollowed business" });
  } catch (error) {
    next(error);
  }
});

// Get business followers count
router.get("/business/:businessId/followers/count", async (req, res, next) => {
  try {
    const { businessId } = req.params;

    const result = await pool.query(
      "SELECT COUNT(*) as count FROM business_followers WHERE business_id = $1",
      [businessId]
    );

    res.json({ success: true, data: { count: parseInt(result.rows[0].count) } });
  } catch (error) {
    next(error);
  }
});

// Check if user is following business
router.get("/business/:businessId/follow", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.json({ success: true, data: { isFollowing: false } });
    }

    const { businessId } = req.params;

    const result = await pool.query(
      "SELECT id FROM business_followers WHERE business_id = $1 AND user_id = $2",
      [businessId, user.id]
    );

    res.json({ success: true, data: { isFollowing: result.rows.length > 0 } });
  } catch (error) {
    next(error);
  }
});

// Get businesses user follows
router.get("/user/following", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const result = await pool.query(
      `SELECT b.*, rf.created_at as followed_at
       FROM businesses b
       JOIN business_followers rf ON b.id = rf.business_id
       WHERE rf.user_id = $1 AND b.is_approved = true
       ORDER BY rf.created_at DESC`,
      [user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get public business profile with follower count
router.get("/business/:businessId/public", async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const user = getCurrentUser(req);

    const result = await pool.query(
      `SELECT b.*, 
       (SELECT COUNT(*) FROM business_followers WHERE business_id = b.id) as follower_count
       FROM businesses b
       WHERE b.id = $1 AND b.is_approved = true`,
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    const business = result.rows[0];

    // Check if user is following (if authenticated)
    let isFollowing = false;
    if (user) {
      const followCheck = await pool.query(
        "SELECT id FROM business_followers WHERE business_id = $1 AND user_id = $2",
        [businessId, user.id]
      );
      isFollowing = followCheck.rows.length > 0;
    }

    res.json({
      success: true,
      data: {
        ...business,
        isFollowing,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== BUSINESS PAYOUTS ====================

// Get or create payout settings
router.get("/business/payout-settings", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    const result = await pool.query(
      "SELECT * FROM business_payout_settings WHERE business_id = $1",
      [businessId]
    );

    if (result.rows.length === 0) {
      res.json({ success: true, data: null });
    } else {
      // Return full account details for editing (needed for updates)
      const settings = result.rows[0];
      res.json({
        success: true,
        data: {
          id: settings.id,
          businessId: settings.business_id,
          payoutMethod: settings.payout_method,
          isVerified: settings.is_verified,
          createdAt: settings.created_at,
          updatedAt: settings.updated_at,
          // Return full account details for editing (frontend can mask in UI if needed)
          accountDetails: settings.account_details || {},
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// Create or update payout settings
router.put("/business/payout-settings", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update payout settings" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;
    const { payoutMethod, accountDetails } = req.body;

    if (!payoutMethod || !['bank', 'paypal', 'stripe'].includes(payoutMethod)) {
      return res.status(400).json({ success: false, message: "Valid payout method is required" });
    }

    // For Stripe, account details are not required (handled via Stripe Connect)
    // For bank and paypal, account details are required
    if (payoutMethod !== 'stripe' && (!accountDetails || Object.keys(accountDetails).length === 0)) {
      return res.status(400).json({ success: false, message: "Account details are required for this payout method" });
    }

    // Check if settings exist
    const existing = await pool.query(
      "SELECT id, account_details FROM business_payout_settings WHERE business_id = $1",
      [businessId]
    );

    let finalAccountDetails = accountDetails || {};
    
    // If updating existing settings
    if (existing.rows.length > 0) {
      const existingDetails = existing.rows[0].account_details || {};
      
      if (payoutMethod === 'stripe') {
        // For Stripe, preserve existing account details (don't overwrite with empty object)
        // Frontend sends {} for Stripe, but we want to keep previous bank/paypal details
        // This allows users to switch back to bank/paypal without losing their details
        if (Object.keys(accountDetails || {}).length === 0) {
          // Frontend sent empty object for Stripe - preserve existing details
          finalAccountDetails = existingDetails;
        } else {
          // If somehow accountDetails were provided for Stripe, use them (shouldn't happen)
          finalAccountDetails = accountDetails;
        }
      } else {
        // For bank/paypal, merge with existing if only partial update
        // This preserves other fields when user updates only one field
        finalAccountDetails = { ...existingDetails, ...accountDetails };
      }
    }

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE business_payout_settings 
         SET payout_method = $1, account_details = $2, updated_at = CURRENT_TIMESTAMP
         WHERE business_id = $3
         RETURNING *`,
        [payoutMethod, JSON.stringify(finalAccountDetails), businessId]
      );
    } else {
      // Create new
      result = await pool.query(
        `INSERT INTO business_payout_settings (business_id, payout_method, account_details)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [businessId, payoutMethod, JSON.stringify(finalAccountDetails)]
      );
    }

    res.json({
      success: true,
      message: "Payout settings saved successfully",
      data: {
        id: result.rows[0].id,
        businessId: result.rows[0].business_id,
        payoutMethod: result.rows[0].payout_method,
        isVerified: result.rows[0].is_verified,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Request verification (Business can request, admin must approve)
router.post("/business/payout-settings/request-verification", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can request verification" });
    }

    const businessResult = await pool.query(  
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Check if settings exist
    const existing = await pool.query(
      "SELECT id, payout_method, account_details, is_verified FROM business_payout_settings WHERE business_id = $1",
      [businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Please configure payout settings first" });
    }

    const settings = existing.rows[0];

    // Check if already verified
    if (settings.is_verified) {
      return res.json({
        success: true,
        message: "Your payout account is already verified",
        data: { isVerified: true },
      });
    }

    // Check if account details are provided (except for Stripe)
    if (settings.payout_method !== 'stripe') {
      const accountDetails = settings.account_details || {};
      if (Object.keys(accountDetails).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please complete your account details before requesting verification",
        });
      }
    }

    // In a real system, you might want to:
    // 1. Send notification to admin
    // 2. Create a verification request record
    // 3. Send email to admin
    // For now, we'll just return success and admin can verify manually

    res.json({
      success: true,
      message: "Verification request submitted. An admin will review your account and verify it shortly.",
      data: { isVerified: false, verificationRequested: true },
    });
  } catch (error) {
    next(error);
  }
});

// Verify payout account (Admin only)
router.post("/business/payout-settings/verify", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can verify payout accounts" });
    }

    const { businessId, verified } = req.body;

    if (!businessId) {
      return res.status(400).json({ success: false, message: "Business ID is required" });
    }

    if (typeof verified !== "boolean") {
      return res.status(400).json({ success: false, message: "Verified status must be a boolean" });
    }

    // Check if settings exist
    const existing = await pool.query(
      "SELECT id FROM business_payout_settings WHERE business_id = $1",
      [businessId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Payout settings not found for this business" });
    }

    // Update verification status
    const result = await pool.query(
      `UPDATE business_payout_settings 
       SET is_verified = $1, updated_at = CURRENT_TIMESTAMP
       WHERE business_id = $2
       RETURNING *`,
      [verified, businessId]
    );

    res.json({
      success: true,
      message: verified ? "Payout account verified successfully" : "Payout account verification removed",
      data: {
        id: result.rows[0].id,
        businessId: result.rows[0].business_id,
        payoutMethod: result.rows[0].payout_method,
        isVerified: result.rows[0].is_verified,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get all businesses with payout settings (Admin only)
router.get("/admin/payout-verifications", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can access this" });
    }

    const result = await pool.query(
      `SELECT 
        b.id as business_id,
        b.business_name,
        b.user_id,
        u.email,
        u.username,
        ps.id as settings_id,
        ps.payout_method,
        ps.account_details,
        ps.is_verified,
        ps.created_at as settings_created_at,
        ps.updated_at as settings_updated_at
      FROM businesses b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN business_payout_settings ps ON b.id = ps.business_id
      ORDER BY b.business_name ASC`
    );

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        businessId: row.business_id,
        businessName: row.business_name,
        email: row.email,
        username: row.username,
        payoutSettings: row.settings_id ? {
          id: row.settings_id,
          payoutMethod: row.payout_method,
          accountDetails: row.account_details || {},
          isVerified: row.is_verified,
          createdAt: row.settings_created_at,
          updatedAt: row.settings_updated_at,
        } : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get payout history
router.get("/business/payouts", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    const result = await pool.query(
      `SELECT * FROM payouts 
       WHERE business_id = $1 
       ORDER BY created_at DESC
       LIMIT 50`,
      [businessId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Request payout
router.post("/business/payouts/request", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can request payouts" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Check payout settings
    const settingsResult = await pool.query(
      "SELECT * FROM business_payout_settings WHERE business_id = $1",
      [businessId]
    );

    if (settingsResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please configure payout settings first",
      });
    }

    // Check if payout account is verified
    if (!settingsResult.rows[0].is_verified) {
      return res.status(400).json({
        success: false,
        message: "Your payout account must be verified before requesting payouts. Please contact support to verify your account.",
      });
    }

    const { amount, notes, currency } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount is required" });
    }

    const payoutMethod = settingsResult.rows[0].payout_method;

    const allowedCurrencies = ["GBP", "USD", "EUR"];
    const payoutCurrency = (currency || BASE_CURRENCY).toUpperCase();
    if (!allowedCurrencies.includes(payoutCurrency)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported currency. Allowed: ${allowedCurrencies.join(", ")}`,
      });
    }

    const amountBase = toBaseCurrency(amount, payoutCurrency);

    // Calculate available balance in base currency (GBP):
    // - use business_amount when present (excludes platform commission), fall back to total
    // - only count orders that are beyond "pending" and not cancelled
    // - subtract both completed and in-flight payouts to avoid double requesting
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(business_amount, total)), 0) AS total_revenue
       FROM orders 
       WHERE business_id = $1 
         AND status NOT IN ('cancelled', 'pending')`,
      [businessId]
    );

    const completedPayoutsResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(amount_base, amount)), 0) AS total_payouts
       FROM payouts 
       WHERE business_id = $1 AND status = 'completed'`,
      [businessId]
    );

    const pendingPayoutsResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(amount_base, amount)), 0) AS pending_payouts
       FROM payouts 
       WHERE business_id = $1 AND status IN ('pending', 'processing')`,
      [businessId]
    );

    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const totalPayouts = parseFloat(completedPayoutsResult.rows[0].total_payouts);
    const pendingPayouts = parseFloat(pendingPayoutsResult.rows[0].pending_payouts);
    const availableBalance = totalRevenue - totalPayouts - pendingPayouts;

    if (amountBase > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: £${availableBalance.toFixed(2)} (base currency)`,
      });
    }

    // Record payout
    const result = await pool.query(
      `INSERT INTO payouts (business_id, amount, currency, amount_base, payout_method, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, amount, payoutCurrency, amountBase, payoutMethod, notes || null]
    );

    const payoutRow = result.rows[0];

    // Attempt Stripe payout from connected account
    // Since we use destination charges, money is already in the connected account
    // We create a payout FROM the connected account (not a transfer TO it)
    console.log("[Payout Request] Processing Stripe payout:", {
      businessId: businessId,
      payoutId: payoutRow.id,
      amount: amountBase,
      currency: payoutCurrency,
      payoutMethod: payoutMethod,
    });
    
    let transactionId: string | null = null;
    let status: "pending" | "processing" | "completed" | "failed" = "processing";

    try {
      const result = await stripeService.createPayoutFromConnectedAccount({
        businessId,
        amountBase,
        currency: BASE_CURRENCY,
        metadata: {
          payout_id: payoutRow.id,
          business_id: businessId,
        },
      });
      
      console.log("[Payout Request] Stripe payout result:", {
        transactionId: result.id,
        type: result.type,
        status: result.status,
        payoutId: payoutRow.id,
      });
      
      transactionId = result.id;
      
      // Determine status based on result type and status
      if (result.type === 'payout') {
        // Payout status: pending, in_transit, paid, failed, canceled
        if (result.status === 'paid' || result.status === 'in_transit') {
          status = "completed";
        } else if (result.status === 'pending') {
          status = "pending";
        } else if (result.status === 'failed' || result.status === 'canceled') {
          status = "failed";
        }
      } else if (result.type === 'transfer') {
        // Transfer status
        if (result.status === "paid") {
          status = "completed";
        }
      }
    } catch (err: any) {
      console.error("[Payout Request] Stripe payout failed:", {
        error: err.message,
        errorType: err.type,
        errorCode: err.code,
        businessId: businessId,
        payoutId: payoutRow.id,
        amount: amountBase,
        currency: payoutCurrency,
      });
      
      status = "failed";
      await pool.query(
        `UPDATE payouts 
         SET status = $1, transaction_id = $2, processed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [status, transactionId, payoutRow.id]
      );
      
      // Provide more helpful error message
      let errorMessage = err.message || "Failed to process payout";
      if (err.message && err.message.includes("insufficient available funds") || err.message.includes("insufficient available balance")) {
        errorMessage = err.message; // Use the detailed message from Stripe service
      } else if (err.message && err.message.includes("insufficient funds")) {
        errorMessage = err.message; // Use the detailed message from Stripe service
      }
      
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    const completedAt = status === 'completed' ? new Date() : null;
    const updateResult = await pool.query(
      `UPDATE payouts 
       SET status = $1,
           transaction_id = $2,
           processed_at = CURRENT_TIMESTAMP,
           completed_at = $4
       WHERE id = $3
       RETURNING *`,
      [status, transactionId, payoutRow.id, completedAt]
    );

    res.status(201).json({
      success: true,
      message: status === "completed" ? "Payout sent successfully" : "Payout initiated",
      data: updateResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// Get business earnings summary
router.get("/business/earnings", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Total revenue (net to business)
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(business_amount, total)), 0) AS total_revenue
       FROM orders 
       WHERE business_id = $1 
         AND status NOT IN ('cancelled', 'pending')`,
      [businessId]
    );

    // Completed payouts
    const completedPayoutsResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(amount_base, amount)), 0) AS total_payouts
       FROM payouts 
       WHERE business_id = $1 AND status = 'completed'`,
      [businessId]
    );

    // Pending payouts
    const pendingPayoutsResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(amount_base, amount)), 0) AS pending_payouts
       FROM payouts 
       WHERE business_id = $1 AND status IN ('pending', 'processing')`,
      [businessId]
    );

    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const totalPayouts = parseFloat(completedPayoutsResult.rows[0].total_payouts);
    const pendingPayouts = parseFloat(pendingPayoutsResult.rows[0].pending_payouts);
    const availableBalance = totalRevenue - totalPayouts - pendingPayouts;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalPayouts,
        pendingPayouts,
        availableBalance,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update business banner image
router.put("/business/banner", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can update banner" });
    }

    const { bannerImage } = req.body;

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    const result = await pool.query(
      `UPDATE businesses 
       SET banner_image = $1
       WHERE id = $2
       RETURNING *`,
      [bannerImage || null, businessId]
    );

    res.json({
      success: true,
      message: "Banner image updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// ==================== STRIPE CONNECT ====================

// Create Stripe Connect account (legacy) – now a no-op that returns existing mapping
router.post("/business/stripe/connect", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can connect Stripe" });
    }

    const businessResult = await pool.query(
      "SELECT id, business_name FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const business = businessResult.rows[0];

    // Check if already connected
    const existing = await pool.query(
      "SELECT stripe_account_id, charges_enabled, payouts_enabled FROM stripe_connect_accounts WHERE business_id = $1",
      [business.id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({
        success: true,
        data: {
          accountId: row.stripe_account_id,
          charges_enabled: row.charges_enabled,
          payouts_enabled: row.payouts_enabled,
        },
        message: "Stripe account already linked",
      });
    }

    // For OAuth flow we don't create accounts here; just acknowledge
    return res.json({ success: true, data: null, message: "Proceed to Stripe OAuth to link account" });
  } catch (error) {
    next(error);
  }
});

// Get Stripe Connect onboarding link (Express accounts via Account Links)
// This is the Stripe-recommended approach for marketplaces
router.get("/business/stripe/onboarding-link", isAuthenticated, async (req, res, next) => {
  const user = getCurrentUser(req);
  let business: any = null;
  let businessId: string | null = null;

  try {
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id, business_name, business_address, city, postcode FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    business = businessResult.rows[0];
    businessId = business.id;

    // Check if already connected and fully onboarded
    const existing = await pool.query(
      "SELECT stripe_account_id, charges_enabled, payouts_enabled, details_submitted FROM stripe_connect_accounts WHERE business_id = $1",
      [businessId]
    );

    if (existing.rows.length > 0 && existing.rows[0].charges_enabled && existing.rows[0].payouts_enabled) {
      return res.json({
        success: true,
        data: { url: null, message: "Stripe account already connected. No action required." },
      });
    }

    let accountId: string;

    // Create Express account if it doesn't exist
    if (existing.rows.length === 0) {
      // Determine country from business address (default to GB for UK)
      // UK postcodes indicate UK business
      const country = 'GB'; // Localito is UK-focused for MVP
      
      const account = await stripeService.createExpressAccount(
        business.id,
        user.email,
        country
      );
      accountId = account.id;
    } else {
      // Account exists but not fully onboarded - use existing account ID
      accountId = existing.rows[0].stripe_account_id;
    }

    // Create Account Link for onboarding (Stripe-hosted onboarding flow)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    
    const accountLink = await stripeService.createAccountLink(
      accountId,
      `${frontendUrl}/business/payouts?stripe=onboarded`, // return_url - where to go after success
      `${frontendUrl}/business/payouts?stripe=refresh`    // refresh_url - where to go if link expires
    );

    res.json({ 
      success: true, 
      data: { url: accountLink.url } 
    });
  } catch (error: any) {
    const errMessage = error?.message || String(error);
    console.error("[Stripe Onboarding] Error:", {
      userId: user?.id,
      businessId: business?.id,
      error: errMessage,
      type: error?.type,
      code: error?.code,
    });

    // User-friendly message; in development include detail to help debug
    const isDev = process.env.NODE_ENV !== "production";
    const publicMessage = "Failed to set up Stripe account. Please try again or contact support.";
    const detail = isDev && errMessage ? ` (${errMessage})` : "";

    if (errMessage?.toLowerCase().includes("account") || error?.code) {
      return res.status(400).json({
        success: false,
        message: publicMessage + detail,
      });
    }

    next(error);
  }
});

// Get Express Dashboard login link (for businesses to access their Stripe dashboard)
router.get("/business/stripe/dashboard-link", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Get Stripe account ID
    const accountResult = await pool.query(
      "SELECT stripe_account_id, charges_enabled, payouts_enabled FROM stripe_connect_accounts WHERE business_id = $1",
      [businessId]
    );

    if (accountResult.rows.length === 0 || !accountResult.rows[0].stripe_account_id) {
      return res.status(404).json({ 
        success: false, 
        message: "Stripe account not found. Please complete onboarding first." 
      });
    }

    const stripeAccount = accountResult.rows[0];

    // Check if account is fully onboarded
    if (!stripeAccount.charges_enabled || !stripeAccount.payouts_enabled) {
      return res.status(400).json({
        success: false,
        message: "Please complete Stripe onboarding before accessing the dashboard.",
      });
    }

    const loginLink = await stripeService.createExpressDashboardLoginLink(stripeAccount.stripe_account_id);

    res.json({ 
      success: true, 
      data: { url: loginLink.url } 
    });
  } catch (error) {
    next(error);
  }
});

// Stripe checkout success redirect (handles both mobile and web)
router.get("/stripe/success", async (req, res) => {
  try {
    const { orderId } = req.query;
    
    if (!orderId) {
      return res.status(400).send("Missing order ID");
    }

    // Note: Payment verification is handled by Stripe webhook
    // This endpoint just redirects to the appropriate page

    // Check if there are more orders to pay for (multi-business scenario)
    // We'll pass this info to the frontend so it can handle sequential payments
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    
    // Detect if request is from mobile app (check User-Agent or custom header)
    const userAgent = req.get("User-Agent") || "";
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent) || req.get("X-Platform") === "mobile";
    
    if (isMobile) {
      // For mobile, serve an HTML page that attempts to open the app via deep link
      // This works around browser limitations with custom URL schemes
      const deepLinkUrl = `localito://order/${orderId}?success=true`;
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const fallbackUrl = `${frontendUrl}/orders/${orderId}?success=true`;
      
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }
    p {
      font-size: 16px;
      margin-bottom: 30px;
      opacity: 0.9;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #fff;
      color: #667eea;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 10px;
      transition: transform 0.2s;
    }
    .button:hover {
      transform: scale(1.05);
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top: 3px solid #fff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Payment Successful!</h1>
    <p>Redirecting to your order...</p>
    <div class="spinner"></div>
    <a href="${deepLinkUrl}" class="button" id="openApp">Open in App</a>
    <a href="${fallbackUrl}" class="button" style="background: rgba(255,255,255,0.2); color: #fff;">View Order in Browser</a>
  </div>
  <script>
    // Try to open the app immediately
    const deepLinkUrl = "${deepLinkUrl}";
    const fallbackUrl = "${fallbackUrl}";
    
    // Attempt to open the app
    window.location.href = deepLinkUrl;
    
    // Set a timeout to redirect to web if app doesn't open
    let redirectTimer = setTimeout(() => {
      window.location.href = fallbackUrl;
    }, 2000);
    
    // If user clicks the button, clear the timer
    document.getElementById('openApp').addEventListener('click', (e) => {
      e.preventDefault();
      clearTimeout(redirectTimer);
      window.location.href = deepLinkUrl;
      // Redirect to web after a short delay if app doesn't open
      setTimeout(() => {
        window.location.href = fallbackUrl;
      }, 1500);
    });
    
    // Detect if page becomes hidden (app opened)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(redirectTimer);
      }
    });
    
    // Detect if page loses focus (app opened)
    window.addEventListener('blur', () => {
      clearTimeout(redirectTimer);
    });
  </script>
</body>
</html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } else {
      // Redirect to web orders page with flag to check for more payments
      // The frontend will check sessionStorage for remaining checkout sessions
      return res.redirect(302, `${frontendUrl}/orders/${orderId}?success=true&checkMorePayments=true`);
    }
  } catch (err: any) {
    console.error("Stripe success redirect error:", err?.message || err);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(302, `${frontendUrl}/orders?error=redirect_failed`);
  }
});

// OAuth callback for Stripe Connect
router.get("/business/stripe/oauth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

    if (error) {
      return res.status(400).send(`Stripe OAuth error: ${error_description || error}`);
    }

    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    const parsedState = JSON.parse(Buffer.from(state, "base64").toString());
    const businessId = parsedState?.businessId as string;
    if (!businessId) {
      return res.status(400).send("Invalid state");
    }

    const account = await stripeService.exchangeOAuthCode(code, businessId);

    // Redirect back to frontend payouts page with status
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectUrl = `${frontendUrl}/business/payouts?stripe=connected&acct=${account.id}`;
    return res.redirect(302, redirectUrl);
  } catch (err: any) {
    console.error("Stripe OAuth callback error:", err?.message || err);
    return res.status(400).send(`Stripe OAuth failed: ${err?.message || "unknown error"}`);
  }
});

// Get Stripe account status
// Manually link Stripe Connect account (for test accounts/demo)
router.post("/business/stripe/link-account", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can link Stripe accounts" });
    }

    const { accountId, secretKey } = req.body;

    if (!accountId || typeof accountId !== 'string') {
      return res.status(400).json({ success: false, message: "Stripe account ID is required" });
    }

    // Secret key is optional - if not provided, will use platform key
    if (secretKey && typeof secretKey !== 'string') {
      return res.status(400).json({ success: false, message: "Stripe secret key must be a string if provided" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const businessId = businessResult.rows[0].id;

    // Link the account (with optional secret key)
    const account = await stripeService.linkStripeAccountManually(businessId, accountId, secretKey);

    res.json({
      success: true,
      message: "Stripe account linked successfully",
      data: {
        accountId: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted || false,
      },
    });
  } catch (error: any) {
    console.error("[Stripe] Failed to link account manually:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to link Stripe account",
    });
  }
});

// Business: Get commission tier and turnover information
router.get("/business/commission-tier", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    const businessId = businessResult.rows[0].id;
    const { tier, turnover } = await stripeService.getCommissionTierForBusiness(businessId);

    // Get next tier information
    const currentTierIndex = COMMISSION_TIERS.findIndex(t => t.name === tier.name);
    const nextTier = currentTierIndex < COMMISSION_TIERS.length - 1 
      ? COMMISSION_TIERS[currentTierIndex + 1] 
      : null;

    const turnoverToNextTier = nextTier 
      ? Math.max(0, nextTier.minTurnover - turnover)
      : null;

    res.json({
      success: true,
      data: {
        currentTier: {
          name: tier.name,
          commissionRate: tier.commissionRate,
          commissionPercentage: (tier.commissionRate * 100).toFixed(1),
          minTurnover: tier.minTurnover,
          maxTurnover: tier.maxTurnover,
        },
        turnover: {
          current: turnover,
          period: "30-day rolling",
          currency: "GBP",
        },
        nextTier: nextTier ? {
          name: nextTier.name,
          commissionRate: nextTier.commissionRate,
          commissionPercentage: (nextTier.commissionRate * 100).toFixed(1),
          minTurnover: nextTier.minTurnover,
          turnoverNeeded: turnoverToNextTier,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/business/stripe/status", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "business") {
      return res.status(403).json({ success: false, message: "Only businesses can access this" });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE user_id = $1",
      [user.id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business profile not found" });
    }

    const status = await stripeService.getAccountStatus(businessResult.rows[0].id);

    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// Stripe webhook endpoint is now handled in app.ts BEFORE JSON middleware
// to preserve raw body for signature verification

// ==================== REWARDS & DISCOUNTS ====================

// Get user points balance
router.get("/user/points", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const points = await rewardsService.getUserPoints(user.id);
    res.json({ success: true, data: points });
  } catch (error) {
    next(error);
  }
});

// Get user points transactions
router.get("/user/points/transactions", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const transactions = await rewardsService.getUserPointsTransactions(user.id);
    res.json({ success: true, data: transactions });
  } catch (error) {
    next(error);
  }
});

// Validate discount code
router.post("/discount-codes/validate", async (req, res, next) => {
  try {
    const { code, orderTotal } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: "Discount code is required" });
    }

    const validation = await rewardsService.validateDiscountCode(code, orderTotal || 0);
    res.json({ success: validation.valid, data: validation });
  } catch (error) {
    next(error);
  }
});

// Apply discount code to order
router.post("/orders/:orderId/discount-code", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { code } = req.body;
    const discount = await rewardsService.applyDiscountCode(req.params.orderId, code);

    res.json({ success: true, data: discount });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Admin: Create discount code
router.post("/admin/discount-codes", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can create discount codes" });
    }

    const {
      code,
      description,
      discountType,
      discountValue,
      minPurchaseAmount,
      maxDiscountAmount,
      usageLimit,
      validUntil,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO discount_codes 
       (code, description, discount_type, discount_value, min_purchase_amount, max_discount_amount, usage_limit, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        code.toUpperCase(),
        description || null,
        discountType,
        discountValue,
        minPurchaseAmount || 0,
        maxDiscountAmount || null,
        usageLimit || null,
        validUntil || null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ success: false, message: "Discount code already exists" });
    } else {
      next(error);
    }
  }
});

// Admin: Get all discount codes
router.get("/admin/discount-codes", isAuthenticated, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can view discount codes" });
    }

    const result = await pool.query(
      `SELECT * FROM discount_codes ORDER BY created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get business user ID by business ID (for starting chats)
router.get("/business/:businessId/user", async (req, res, next) => {
  try {
    const { businessId } = req.params;
    
    const result = await pool.query(
      `SELECT user_id, business_name 
       FROM businesses 
       WHERE id = $1 AND is_approved = true`,
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    res.json({
      success: true,
      data: {
        userId: result.rows[0].user_id,
        businessName: result.rows[0].business_name,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Cleanup abandoned orders (orders in 'awaiting_payment' status for > 15 minutes)
// This should be called via cron job or scheduled task
router.post("/orders/cleanup-abandoned", async (req, res, next) => {
  try {
    // Optional: Require admin authentication or API key
    // For now, allow unauthenticated but you should secure this in production
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.CLEANUP_API_KEY;
    
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized. Valid API key required." 
      });
    }

    // Cancel orders that have been awaiting payment for more than 15 minutes
    const result = await pool.query(
      `UPDATE orders 
       SET status = 'cancelled', 
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'awaiting_payment' 
         AND stripe_payment_intent_id IS NULL
         AND created_at < NOW() - INTERVAL '15 minutes'
       RETURNING id, user_id`
    );

    const cancelledOrders = result.rows;
    const cancelledCount = cancelledOrders.length;

    console.log(`[Cleanup] Cancelled ${cancelledCount} abandoned orders`);

    // Optionally: Delete order items for cancelled orders to free up resources
    // (Order items are not needed if order is cancelled before payment)
    if (cancelledCount > 0) {
      const orderIds = cancelledOrders.map(o => o.id);
      await pool.query(
        `DELETE FROM order_items WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      await pool.query(
        `DELETE FROM order_service_items WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      console.log(`[Cleanup] Deleted order items for ${cancelledCount} cancelled orders`);
    }

    res.json({
      success: true,
      message: `Cleaned up ${cancelledCount} abandoned orders`,
      data: {
        cancelledCount,
        orderIds: cancelledOrders.map(o => o.id),
      },
    });
  } catch (error) {
    console.error('[Cleanup] Error cleaning up abandoned orders:', error);
    next(error);
  }
});

export { router as apiRoutes };

