/**
 * Script to create an admin user
 * Run with: npx tsx scripts/create-admin.ts <username> <email> <password>
 * Or: npm run create-admin <username> <email> <password>
 */

import { pool } from "../src/db/connection";
import bcrypt from "bcrypt";

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error("Usage: npx tsx scripts/create-admin.ts <username> <email> <password>");
    console.error("Example: npx tsx scripts/create-admin.ts admin admin@example.com admin123");
    process.exit(1);
  }

  const [username, email, password] = args;

  try {
    // Check if admin already exists
    const existingUser = await pool.query(
      "SELECT id, username, email FROM users WHERE username = $1 OR email = $2 OR role = 'admin'",
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      if (existing.username === username || existing.email === email) {
        console.error(`❌ User with username "${username}" or email "${email}" already exists!`);
        process.exit(1);
      }
      if (existing.role === "admin") {
        console.log("⚠️  An admin user already exists in the database.");
        console.log("   If you want to create another admin, you can modify this script.");
        process.exit(1);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const result = await pool.query(
      `INSERT INTO users (username, email, password, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, role, created_at`,
      [username, email, hashedPassword, "admin"]
    );

    const admin = result.rows[0];
    console.log("✅ Admin user created successfully!");
    console.log("\nAdmin Details:");
    console.log(`  Username: ${admin.username}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Role: ${admin.role}`);
    console.log(`  ID: ${admin.id}`);
    console.log(`  Created: ${admin.created_at}`);
    console.log("\nYou can now log in at: http://localhost:5173/admin");
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${password}`);

    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error creating admin user:", error.message);
    await pool.end();
    process.exit(1);
  }
}

createAdmin();

