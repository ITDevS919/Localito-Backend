import { type User, type InsertUser } from "../../shared/schema";
import { DbStorage } from "./dbStorage";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserFromGoogle(googleId: string, email: string, displayName: string, role?: string): Promise<User>;
  updateUserGoogleId(userId: string, googleId: string): Promise<void>;
  verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  createPasswordResetToken(userId: string): Promise<{ token: string; expiresAt: Date }>;
  getPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: Date } | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
}

// Use PostgreSQL storage
export const storage = new DbStorage();

