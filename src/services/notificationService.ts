import { pool } from "../db/connection";

/**
 * All notification types used by the app.
 * Buyer: order_placed, order_ready_for_pickup, order_completed, order_cancelled, abandoned_cart_reminder, new_message.
 * Business: new_order, order_completed_by_buyer, order_cancelled_business, new_message_business, low_stock, account_verified.
 */
export type NotificationType =
  // Buyer (shopper)
  | "order_placed"
  | "order_ready_for_pickup"
  | "order_completed"
  | "order_cancelled"
  | "abandoned_cart_reminder"
  | "new_message"
  // Business (seller)
  | "new_order"
  | "order_completed_by_buyer"
  | "order_cancelled_business"
  | "new_message_business"
  | "low_stock"
  | "account_verified";

export interface NotificationData {
  orderId?: string;
  roomId?: string;
  productId?: string;
  screen?: string;
  [key: string]: unknown;
}

/**
 * Create an in-app notification and send push to user's devices (Expo).
 */
export async function createNotification(
  userId: string,
  role: "customer" | "business",
  type: NotificationType,
  title: string,
  body: string,
  data: NotificationData = {}
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO notifications (user_id, role, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, role, type, title, body, JSON.stringify(data)]
    );
    await sendPushToUser(userId, title, body, data);
  } finally {
    client.release();
  }
}

/**
 * Send push notification via Expo Push API to all tokens for the user.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: NotificationData = {}
): Promise<void> {
  const result = await pool.query(
    `SELECT token FROM user_push_tokens WHERE user_id = $1 AND token IS NOT NULL AND token != ''`,
    [userId]
  );
  const tokens = result.rows.map((r: { token: string }) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    console.warn("[NotificationService] No push tokens for user:", userId);
    return;
  }

  const messages = tokens.map((token: string) => ({
    to: token,
    title,
    body,
    data: { ...data, title, body },
    sound: "default",
    channelId: "default",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[NotificationService] Expo push failed:", res.status, text);
      return;
    }
    let json: { data?: Array<{ status: string; message?: string; details?: unknown }> };
    try {
      json = JSON.parse(text);
    } catch {
      console.error("[NotificationService] Expo push response not JSON:", text.slice(0, 200));
      return;
    }
    const data = json.data ?? [];
    const hasError = data.some((d: { status: string }) => d.status === "error");
    if (data.length > 0) {
      data.forEach((d: { status: string; message?: string; details?: unknown }, i: number) => {
        if (d.status === "error") {
          console.warn("[NotificationService] Push ticket error:", d.message ?? "unknown", d.details ?? "");
        }
      });
    }
    if (!hasError && data.length > 0) {
      console.log("[NotificationService] Push sent to Expo OK, tickets:", data.length);
    }
  } catch (err: unknown) {
    console.error("[NotificationService] Failed to send push:", err);
  }
}

/**
 * Register or update push token for a user.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: string = "expo"
): Promise<void> {
  await pool.query(
    `INSERT INTO user_push_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (token) DO UPDATE SET user_id = $1, updated_at = CURRENT_TIMESTAMP`,
    [userId, token, platform]
  );
}
