import { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy, VerifyCallback } from "passport-google-oauth20";
import { storage } from "../services/storage";
import type { User } from "../../shared/schema";

// Configure Passport Local Strategy
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return done(null, false, { message: "Invalid username or password" });
      }

      const isValidPassword = await storage.verifyPassword(password, user.password);
      
      if (!isValidPassword) {
        return done(null, false, { message: "Invalid username or password" });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Configure Passport Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
        passReqToCallback: true, // Enable passing request to callback
      },
      async (req: any, accessToken: any, refreshToken: any, profile: any, done: VerifyCallback) => {
        try {
          // Get role from session (stored in route before authentication)
          const role = (req.session as any)?.googleAuthRole || "customer";

          // Check if user exists by Google ID
          let user = await storage.getUserByGoogleId(profile.id);
          
          if (user) {
            return done(null, user);
          }

          // Check if user exists by email (for linking accounts)
          if (profile.emails && profile.emails[0]) {
            user = await storage.getUserByEmail(profile.emails[0].value);
            
            if (user) {
              // Link Google account to existing user
              await storage.updateUserGoogleId(user.id, profile.id);
              return done(null, user);
            }
          }

          // For login flows (not signup), don't auto-create retailer/admin accounts
          // They should use the signup flow which collects required information
          // Check if this is a login attempt by checking the route
          const isLoginFlow = req.originalUrl?.includes('/login') || req.path?.includes('/login');
          
          if (isLoginFlow && (role === "retailer" || role === "admin")) {
            return done(new Error("Account not found. Please sign up first using the signup page."));
          }

          // Create new user from Google profile with the role from session
          const displayName = profile.displayName || profile.name?.givenName || "User";
          const email = profile.emails?.[0]?.value || "";
          
          if (!email) {
            return done(new Error("Email is required for Google authentication"));
          }

          user = await storage.createUserFromGoogle(
            profile.id,
            email,
            displayName,
            role // Use role from session instead of hardcoded "customer"
          );

          return done(null, user);
        } catch (error: any) {
          return done(error);
        }
      }
    )
  );
}

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

// Middleware to check if user is authenticated
export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    success: false,
    message: "Authentication required",
  });
}

// Helper to get current user from request
export function getCurrentUser(req: Request): User | undefined {
  return req.user as User | undefined;
}

