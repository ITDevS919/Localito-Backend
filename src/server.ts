import { httpServer } from "./app";
import { testConnection } from "./db/connection";
import { runMigrations } from "./db/migrations";

const PORT = parseInt(process.env.PORT || "5000", 10);

function log(message: string, source = "server") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    log("Testing database connection...");
    const connected = await testConnection();
    
    if (!connected) {
      log("Failed to connect to database. Please check your database configuration.", "error");
      process.exit(1);
    }

    // Run migrations
    log("Running database migrations...");
    await runMigrations();

    // Start HTTP server
    httpServer.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
      log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    log(`Failed to start server: ${error}`, "error");
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  log(`${signal} signal received: shutting down gracefully`);
  
  httpServer.close(() => {
    log("HTTP server closed");
    
    // Close database pool
    import("./db/connection").then(({ pool }) => {
      pool.end(() => {
        log("Database pool closed");
        process.exit(0);
      });
    });
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

