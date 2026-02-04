/**
 * Firebase Admin SDK for server-side access to Firestore (e.g. admin view of buyer-seller chats).
 * Optional: if FIREBASE_SERVICE_ACCOUNT_JSON is not set, getAdminFirestore() returns null
 * and admin conversation endpoints will respond with 503.
 */
import admin from "firebase-admin";

let firestore: admin.firestore.Firestore | null = null;

function initialize(): void {
  if (firestore !== null) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json || json.trim() === "") {
    return;
  }
  try {
    const cred = JSON.parse(json) as admin.ServiceAccount;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    }
    firestore = admin.firestore();
  } catch (e) {
    console.error("[firebaseAdmin] Failed to initialize:", e);
  }
}

export function getAdminFirestore(): admin.firestore.Firestore | null {
  initialize();
  return firestore;
}

export interface AdminConversationRoom {
  id: string;
  participantNames: Record<string, string>;
  participantRoles: Record<string, string>;
  appUserIds?: string[];
  lastMessage?: string;
  lastMessageTime?: Date;
  type: string;
  createdAt?: Date;
}

export interface AdminMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  receiverName: string;
  text: string;
  timestamp: Date;
  read: boolean;
  type: string;
}

export async function listBuyerSellerRooms(): Promise<AdminConversationRoom[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const col = db.collection("chatRooms");
  const snapshot = await col.where("type", "==", "buyer-seller").get();
  const rooms: AdminConversationRoom[] = [];
  snapshot.forEach((doc) => {
    const d = doc.data();
    const lastMessageTime = d.lastMessageTime?.toDate?.() ?? null;
    rooms.push({
      id: doc.id,
      participantNames: d.participantNames || {},
      participantRoles: d.participantRoles || {},
      appUserIds: d.appUserIds,
      lastMessage: d.lastMessage,
      lastMessageTime: lastMessageTime ?? undefined,
      type: d.type || "buyer-seller",
      createdAt: d.createdAt?.toDate?.() ?? undefined,
    });
  });
  rooms.sort((a, b) => {
    const tA = a.lastMessageTime?.getTime() ?? 0;
    const tB = b.lastMessageTime?.getTime() ?? 0;
    return tB - tA;
  });
  return rooms;
}

export async function getRoomMessages(roomId: string): Promise<AdminMessage[]> {
  const db = getAdminFirestore();
  if (!db) return [];
  const messagesRef = db.collection("chatRooms").doc(roomId).collection("messages");
  const snapshot = await messagesRef.orderBy("timestamp", "asc").get();
  const messages: AdminMessage[] = [];
  snapshot.forEach((doc) => {
    const d = doc.data();
    const timestamp = d.timestamp?.toDate?.() ?? new Date(0);
    messages.push({
      id: doc.id,
      senderId: d.senderId,
      senderName: d.senderName,
      senderRole: d.senderRole,
      receiverId: d.receiverId,
      receiverName: d.receiverName,
      text: d.text,
      timestamp,
      read: d.read ?? false,
      type: d.type || "buyer-seller",
    });
  });
  return messages;
}
