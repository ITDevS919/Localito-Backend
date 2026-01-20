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

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
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
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      domain: process.env.NODE_ENV === "production" ? ".localito.com" : undefined, // Add this line
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

