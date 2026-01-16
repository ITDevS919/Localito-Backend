import { type User, type InsertUser, type Retailer } from "../../shared/schema";
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
    
    // If user is a retailer, create retailer record with provided data
    if (row.role === "retailer") {
      const retailerData = insertUser.retailerData;
      if (!retailerData) {
        throw new Error("Retailer data is required for retailer signup");
      }

      // Geocode the address to get latitude and longitude
      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        console.log(`[Retailer Signup] Starting geocoding for: ${retailerData.businessName}`);
        console.log(`[Retailer Signup] Address data:`, {
          businessAddress: retailerData.businessAddress,
          postcode: retailerData.postcode,
          city: retailerData.city,
        });

        // Build full address for geocoding
        const addressParts: string[] = [];
        if (retailerData.businessAddress) addressParts.push(retailerData.businessAddress);
        if (retailerData.postcode) addressParts.push(retailerData.postcode);
        if (retailerData.city) addressParts.push(retailerData.city);

        const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : undefined;
        
        if (!fullAddress && !retailerData.postcode && !retailerData.city) {
          console.warn(`[Retailer Signup] No address data provided for geocoding: ${retailerData.businessName}`);
        } else {
          const geocodeResult = await geocodingService.geocodeAddress(
            retailerData.postcode,
            retailerData.city,
            fullAddress
          );

          if (geocodeResult) {
            latitude = geocodeResult.latitude;
            longitude = geocodeResult.longitude;
            console.log(`[Retailer Signup] ✓ Successfully geocoded ${retailerData.businessName}: ${latitude}, ${longitude}`);
          } else {
            console.warn(`[Retailer Signup] ✗ Failed to geocode address for ${retailerData.businessName}`);
            console.warn(`[Retailer Signup] Retailer will be created without coordinates`);
          }
        }
      } catch (error: any) {
        console.error("[Retailer Signup] Error during geocoding:", error);
        console.error("[Retailer Signup] Error details:", error?.message);
        console.error("[Retailer Signup] Error stack:", error?.stack);
        // Continue without coordinates - not critical for signup
      }

      await pool.query(
        `INSERT INTO retailers (user_id, business_name, business_address, postcode, city, phone, latitude, longitude, is_approved) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          retailerData.businessName,
          retailerData.businessAddress || null,
          retailerData.postcode || null,
          retailerData.city || null,
          retailerData.phone || null,
          latitude,
          longitude,
          false
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
    
    // If user is a retailer, create a minimal retailer record
    // Note: Business details will need to be completed later via retailer settings
    if (row.role === "retailer") {
      await pool.query(
        `INSERT INTO retailers (user_id, business_name, is_approved) 
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

