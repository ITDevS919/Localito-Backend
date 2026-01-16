import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStaticFiles(app: Express) {
  const distPath = path.resolve(__dirname, "..", "..", "client", "build");
  const uploadsPath = path.resolve(__dirname, "..", "..", "public", "uploads");
  
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }

  // Serve uploaded files
  app.use("/uploads", express.static(uploadsPath));
  
  if (!fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    
    // Fall through to index.html for client-side routing
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
    }else {
    // If no client build, just log a warning (don't crash)
    console.warn("Client build directory not found. Static file serving disabled.");
  }
}