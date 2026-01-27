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
  
  // Only serve static files if build directory exists
  // This allows the backend to run even if frontend is served separately
  if (!fs.existsSync(distPath)) {
    console.warn(
      `[StaticFiles] Build directory not found: ${distPath}. ` +
      `Static file serving is disabled. If you need the backend to serve the frontend, ` +
      `build the client first with 'npm run build' in the client directory.`
    );
    return;
  }

  app.use(express.static(distPath));

  // Fall through to index.html for client-side routing
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

