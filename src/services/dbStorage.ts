import crypto from "crypto";
import { type User, type InsertUser, type Business } from "../../shared/schema";
import { pool } from "../db/connection";
import bcrypt from "bcrypt";
import { geocodingService } from "./geocodingService";
import { stripeService } from "./stripeService";

export class DbStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await pool.query(
      "SELECT id, username, email, password, role, created_at FROM users WHERE id = $1",
      [id]
    );
    
    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await pool.query(
      "SELECT id, username, email, password, role, created_at FROM users WHERE username = $1",
      [username]
    );
    
    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await pool.query(
      "SELECT id, username, email, password, role, created_at FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    
    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Check if username or email already exists
    const existingByUsername = await this.getUserByUsername(insertUser.username);
    const existingByEmail = await this.getUserByEmail(insertUser.email);
    
    if (existingByUsername || existingByEmail) {
      throw new Error("Username or email already exists");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);

    // Insert user with role
    const result = await pool.query(
      `INSERT INTO users (username, email, password, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, password, role, created_at`,
      [insertUser.username, insertUser.email, hashedPassword, insertUser.role || "customer"]
    );

    const row = result.rows[0];
    
    // If user is a business, create business record with provided data
    if (row.role === "business") {
      const businessData = insertUser.businessData;
      if (!businessData) {
        throw new Error("Business data is required for business signup");
      }

      // Geocode the address to get latitude and longitude
      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        console.log(`[Business Signup] Starting geocoding for: ${businessData.businessName}`);
        console.log(`[Business Signup] Address data:`, {
          businessAddress: businessData.businessAddress,
          postcode: businessData.postcode,
          city: businessData.city,
        });

        // Build full address for geocoding
        const addressParts: string[] = [];
        if (businessData.businessAddress) addressParts.push(businessData.businessAddress);
        if (businessData.postcode) addressParts.push(businessData.postcode);
        if (businessData.city) addressParts.push(businessData.city);

        const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : undefined;
        
        if (!fullAddress && !businessData.postcode && !businessData.city) {
          console.warn(`[Business Signup] No address data provided for geocoding: ${businessData.businessName}`);
        } else {
          const geocodeResult = await geocodingService.geocodeAddress(
            businessData.postcode,
            businessData.city,
            fullAddress
          );

          if (geocodeResult) {
            latitude = geocodeResult.latitude;
            longitude = geocodeResult.longitude;
            console.log(`[Business Signup] ✓ Successfully geocoded ${businessData.businessName}: ${latitude}, ${longitude}`);
          } else {
            console.warn(`[Business Signup] ✗ Failed to geocode address for ${businessData.businessName}`);
            console.warn(`[Business Signup] Business will be created without coordinates`);
          }
        }
      } catch (error: any) {
        console.error("[Business Signup] Error during geocoding:", error);
        console.error("[Business Signup] Error details:", error?.message);
        console.error("[Business Signup] Error stack:", error?.stack);
        // Continue without coordinates - not critical for signup
      }

      const businessResult = await pool.query(
        `INSERT INTO businesses (user_id, business_name, business_address, postcode, city, phone, latitude, longitude, is_approved, business_type) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          row.id,
          businessData.businessName,
          businessData.businessAddress || null,
          businessData.postcode || null,
          businessData.city || null,
          businessData.phone || null,
          latitude,
          longitude,
          false,
          businessData.businessType || null
        ]
      );

      const businessId = businessResult.rows[0].id;

      // Auto-create Stripe Express account for new business
      // This allows businesses to sell immediately, even before completing onboarding
      try {
        console.log(`[Business Signup] Auto-creating Stripe Express account for business ${businessId}`);
        const country = 'GB'; // Localito is UK-focused for MVP
        await stripeService.createExpressAccount(
          businessId,
          insertUser.email,
          country
        );
        console.log(`[Business Signup] ✓ Stripe Express account created for business ${businessId}`);
      } catch (error: any) {
        // Log error but don't fail signup - business can create account later
        console.error(`[Business Signup] Failed to auto-create Stripe account for business ${businessId}:`, error);
        console.error(`[Business Signup] Business can still sign up and create Stripe account later via /business/payouts`);
      }
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await pool.query(
      "SELECT id, username, email, password, role, created_at FROM users WHERE google_id = $1",
      [googleId]
    );
    
    if (result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
    };
  }

  async updateUserGoogleId(userId: string, googleId: string): Promise<void> {
    await pool.query(
      "UPDATE users SET google_id = $1 WHERE id = $2",
      [googleId, userId]
    );
  }

  async createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [userId, token, expiresAt]
    );
    return { token, expiresAt };
  }

  async getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined> {
    const result = await pool.query(
      "SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1",
      [token]
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return { userId: row.user_id, expiresAt: new Date(row.expires_at) };
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await pool.query("DELETE FROM password_reset_tokens WHERE token = $1", [token]);
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId]);
  }

  async createUserFromGoogle(googleId: string, email: string, displayName: string, role: string = "customer"): Promise<User> {
    // Use display name with proper formatting (preserve capitals and spaces, e.g. "Sheng Fulai")
    const normalizedDisplayName = displayName?.trim().replace(/\s+/g, ' ');
    let baseUsername = (normalizedDisplayName && normalizedDisplayName.length >= 3)
      ? normalizedDisplayName
      : email.split('@')[0] || `user_${Date.now()}`;

    // Ensure username is unique
    let uniqueUsername = baseUsername;
    let counter = 1;
    while (await this.getUserByUsername(uniqueUsername)) {
      uniqueUsername = `${baseUsername} ${counter}`;
      counter++;
    }

    // Check if email already exists
    const existingByEmail = await this.getUserByEmail(email);
    if (existingByEmail) {
      // Link Google account to existing user
      await this.updateUserGoogleId(existingByEmail.id, googleId);
      return existingByEmail;
    }

    // Create new user - password is empty for OAuth users
    const hashedPassword = await bcrypt.hash(`oauth_${Date.now()}`, 10);
    
    const result = await pool.query(
      `INSERT INTO users (username, email, password, role, google_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, username, email, password, role, created_at`,
      [uniqueUsername, email, hashedPassword, role, googleId]
    );

    const row = result.rows[0];
    
    // If user is a business, create a minimal business record
    // Note: Business details will need to be completed later via business settings
    if (row.role === "business") {
      await pool.query(
        `INSERT INTO businesses (user_id, business_name, is_approved) 
         VALUES ($1, $2, $3)`,
        [
          row.id,
          displayName || "Business Name Pending", // Use display name as temporary business name
          false // Not approved until they complete their profile
        ]
      );
    }
    
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
    };
  }
}

