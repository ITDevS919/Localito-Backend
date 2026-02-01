import { type User, type InsertUser, type Business } from "../../shared/schema";
import { pool } from "../db/connection";
import bcrypt from "bcrypt";
import { geocodingService } from "./geocodingService";

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

      await pool.query(
        `INSERT INTO businesses (user_id, business_name, business_address, postcode, city, phone, latitude, longitude, is_approved, business_type) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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

  async createUserFromGoogle(googleId: string, email: string, displayName: string, role: string = "customer"): Promise<User> {
    // Generate unique username from display name or email
    let baseUsername = displayName?.replace(/\s+/g, '').toLowerCase() || 
                      email.split('@')[0] || 
                      `user_${Date.now()}`;
    
    // Ensure username is unique
    let uniqueUsername = baseUsername;
    let counter = 1;
    while (await this.getUserByUsername(uniqueUsername)) {
      uniqueUsername = `${baseUsername}${counter}`;
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

