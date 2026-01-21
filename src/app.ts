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
import { stripeService } from "./services/stripeService";
import "./middleware/auth"; // Initialize Passport strategies

const PgSession = connectPgSimple(session);

const app = express();
const httpServer = createServer(app);

// Trust proxy to correctly detect HTTPS when behind reverse proxy (nginx, load balancer, etc.)
// This is critical for setting secure cookies correctly in production
app.set('trust proxy', 1);

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

// Stripe webhook endpoint - MUST be before JSON middleware to preserve raw body
// This endpoint needs the raw body for signature verification
// IMPORTANT: This route must be registered BEFORE express.json() middleware
app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  console.log('[Webhook] Received webhook request at /api/stripe/webhook');
  console.log('[Webhook] Request method:', req.method);
  console.log('[Webhook] Request path:', req.path);
  console.log('[Webhook] Request headers:', {
    'content-type': req.headers['content-type'],
    'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing',
    'user-agent': req.headers['user-agent'],
  });
  
  const sigHeader = req.headers['stripe-signature'];
  const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  console.log('[Webhook] Signature header present:', !!sig);
  console.log('[Webhook] Webhook secret configured:', !!webhookSecret);

  if (!sig) {
    console.error('[Webhook] Missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    console.log('[Webhook] Attempting to construct webhook event...');
    const event = stripeService.constructWebhookEvent(req.body, sig, webhookSecret);
    console.log('[Webhook] Event constructed successfully. Type:', event.type, 'ID:', event.id);
    
    await stripeService.handleWebhook(event);
    console.log('[Webhook] Webhook processed successfully');
    res.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Webhook processing failed:', err.message);
    console.error('[Webhook] Error stack:', err.stack);
    console.error('[Webhook] Error details:', {
      message: err.message,
      type: err.type,
      code: err.code,
    });
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// JSON body parser - MUST be after webhook route
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Determine if we should use secure cookies
// In production, check if request is actually HTTPS (after trust proxy is set)
// In development, always use non-secure cookies
const isSecure = process.env.NODE_ENV === "production";

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
      secure: isSecure, // Requires HTTPS in production (trust proxy ensures correct detection)
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: isSecure ? "none" : "lax", // "none" required for cross-origin in production
      // DO NOT set domain - let it default to the exact domain that sets it (api.localito.com)
      // Setting domain can prevent cookies from being sent in cross-origin requests
      path: "/", // Explicitly set path    
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware for cookie issues (only in development or when DEBUG_COOKIES is set)
if (process.env.NODE_ENV !== "production" || process.env.DEBUG_COOKIES === "true") {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Only log for API routes to avoid noise
    if (req.path.startsWith("/api")) {
      console.log(`[Cookie Debug] ${req.method} ${req.path}`);
      console.log(`[Cookie Debug] Received cookies:`, req.headers.cookie || "none");
      console.log(`[Cookie Debug] Session ID:`, req.sessionID);
      console.log(`[Cookie Debug] Is authenticated:`, req.isAuthenticated());
      console.log(`[Cookie Debug] Origin:`, req.headers.origin);
      console.log(`[Cookie Debug] Referer:`, req.headers.referer);
      console.log(`[Cookie Debug] Protocol:`, req.protocol);
      console.log(`[Cookie Debug] Secure:`, req.secure);
      console.log(`[Cookie Debug] Host:`, req.headers.host);
    }
    next();
  });
}

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

