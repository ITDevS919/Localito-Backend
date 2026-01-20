import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { pool } from "./db/connection";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { apiRoutes } from "./routes";
import { serveStaticFiles } from "./middleware/staticFiles";
import "./middleware/auth"; // Initialize Passport strategies

const PgSession = connectPgSimple(session);

const app = express();
const httpServer = createServer(app);

// Middleware - CORS configuration
// Support multiple origins (comma-separated) for production
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ["http://localhost:5173"];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration with PostgreSQL store
app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: "session", // Use a different table name if you prefer
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "localito-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    name: "connect.sid", // Explicit session name
    cookie: {
      secure: process.env.NODE_ENV === "production", // Requires HTTPS in production
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // "none" required for cross-origin
      // DO NOT set domain - let it default to the exact domain that sets it (api.localito.com)
      // Setting domain can prevent cookies from being sent in cross-origin requests
      path: "/", // Explicitly set path    
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Request logging
app.use(requestLogger);

// API Routes
app.use("/api", apiRoutes);

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  serveStaticFiles(app);
}

// Error handling middleware (must be last)
app.use(errorHandler);

export { app, httpServer };

