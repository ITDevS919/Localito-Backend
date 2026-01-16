import { z } from "zod";

// User roles
export type UserRole = "customer" | "retailer" | "admin";

// User schema
export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export const retailerDataSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessAddress: z.string().optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
}).refine(
  (data) => data.postcode || data.city,
  {
    message: "At least one of postcode or city is required",
    path: ["postcode"],
  }
);

export const insertUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "retailer", "admin"]).default("customer"),
  retailerData: retailerDataSchema.optional(),
}).refine(
  (data) => {
    if (data.role === "retailer") {
      return !!data.retailerData;
    }
    return true;
  },
  {
    message: "Retailer data is required for retailer signup",
    path: ["retailerData"],
  }
);

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Retailer schema
export interface Retailer {
  id: string;
  userId: string;
  businessName: string;
  businessAddress?: string;
  postcode?: string;
  city?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  isApproved: boolean;
  createdAt: Date;
  // Square integration fields
  squareAccessToken?: string;
  squareLocationId?: string;
  squareConnectedAt?: Date;
  squareSyncEnabled?: boolean;
  // New fields
  bannerImage?: string;
  followerCount?: number;
  isFollowing?: boolean;
}

// Product schema
export interface Product {
  id: string;
  retailerId: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  images: string[];
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
  reviewCount?: number;
  averageRating?: number;
  // EPOS sync fields
  syncFromEpos?: boolean;
  squareItemId?: string;
  lastEposSyncAt?: Date;
}

// Cart item schema
export interface CartItem {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
}

// Order schema
export interface Order {
  id: string;
  userId: string;
  retailerId: string;
  status: string;
  total: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  platformCommission?: number;
  retailerAmount?: number;
  discountAmount?: number;
  pointsUsed?: number;
  pointsEarned?: number;
  createdAt: Date;
  updatedAt: Date;
  pickupLocation?: string;
  pickupInstructions?: string;
  readyForPickupAt?: Date;
  pickedUpAt?: Date;
  retailerName?: string;
  customerName?: string;
  customerEmail?: string;
}

// Order item schema
export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
}

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginSchema>;

// Retailer post schema
export interface RetailerPost {
  id: string;
  retailerId: string;
  content: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
  retailerName?: string;
  retailerBannerImage?: string;
}

// Retailer follower schema
export interface RetailerFollower {
  id: string;
  retailerId: string;
  userId: string;
  createdAt: Date;
}

// Payout settings schema
export interface PayoutSettings {
  id: string;
  retailerId: string;
  payoutMethod: 'bank' | 'paypal' | 'stripe';
  accountDetails: Record<string, any>;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Payout schema
export interface Payout {
  id: string;
  retailerId: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payoutMethod: string;
  transactionId?: string;
  notes?: string;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

// Service schema
export interface Service {
  id: string;
  retailerId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  durationMinutes: number;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
  maxParticipants?: number;
  requiresStaff?: boolean;
  locationType?: 'onsite' | 'customer_address' | 'online';
  reviewCount?: number;
  averageRating?: number;
}

// Cart service item schema
export interface CartServiceItem {
  id: string;
  userId: string;
  serviceId: string;
  quantity: number;
  createdAt: Date;
}

// Order service item schema
export interface OrderServiceItem {
  id: string;
  orderId: string;
  serviceId: string;
  quantity: number;
  price: number;
  bookingDate?: Date;
  bookingTime?: string;
  bookingDurationMinutes?: number;
}

// Availability schedule schema
export interface AvailabilitySchedule {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

// Availability block schema
export interface AvailabilityBlock {
  id: string;
  retailerId: string;
  blockDate: Date;
  startTime?: string;
  endTime?: string;
  reason?: string;
  isAllDay: boolean;
  createdAt: Date;
  updatedAt: Date;
}
