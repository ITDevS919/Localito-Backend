import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";
dotenv.config();
// Database connection pool
export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "localito_DB",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test database connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Helper function to test connection
export async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("Database connection test successful:", result.rows[0]);
    return true;
  } catch (error) {
    console.error("Database connection test failed:", error);
    return false;
  }
}

