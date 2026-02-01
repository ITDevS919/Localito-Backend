import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Log error in development
  if (process.env.NODE_ENV !== "production") {
    console.error("Error:", err);
  }

  // Ensure CORS headers are set even on error responses
  // This fixes CORS errors when body size limit is exceeded
  const origin = req.headers.origin;
  if (origin) {
    const localOrigins = [
      "http://localhost:5173", "http://127.0.0.1:5173",
      "http://localhost:5174", "http://127.0.0.1:5174",
      "http://localhost:5175", "http://127.0.0.1:5175",
    ];
    const envOrigins = process.env.FRONTEND_URL 
      ? process.env.FRONTEND_URL.split(',').map((url: string) => url.trim()).filter(Boolean)
      : [];
    const allowedOrigins = [...new Set([...localOrigins, ...envOrigins])];
    const isDev = process.env.NODE_ENV !== "production";
    const localNetworkPattern = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/;
    const isAllowed = allowedOrigins.includes(origin) || (isDev && localNetworkPattern.test(origin));
    
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}

