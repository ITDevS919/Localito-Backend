/**
 * JWT tokens for mobile auth. Native apps don't reliably persist cookies,
 * so we issue a Bearer token after login and accept it on API requests.
 */
import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET || "localito-secret-key-change-in-production";
const EXPIRES_IN = "7d";

export function issueToken(userId: string): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, SECRET) as { userId: string };
    return decoded?.userId ?? null;
  } catch {
    return null;
  }
}
