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
  connectionTimeoutMillis: 30000, // Timeout when establishing new connection
  keepAlive: true, // Prevent DB/network from dropping idle connections (avoids "Connection terminated" during webhooks)
  keepAliveInitialDelayMillis: 10000, // Start keepalive after 10s idle
});

// Test database connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  // Don't exit immediately - let PM2 handle restart if needed
  // Logging the error allows monitoring systems to detect the issue
  // Immediate exit causes restart loops if database is temporarily unavailable
  console.error("Database pool error details:", {
    message: err.message,
    code: err.code,
    stack: err.stack
  });
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

