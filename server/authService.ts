import bcrypt from "bcryptjs";
import * as jose from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

const JWT_SECRET = process.env.JWT_SECRET ?? "teledesk-dev-secret-change-in-prod";
const COOKIE_NAME = "teledesk_session";

export { COOKIE_NAME as AUTH_COOKIE_NAME };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(userId: number, role: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<{ userId: number; role: string } | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    return { userId: payload.userId as number, role: payload.role as string };
  } catch {
    return null;
  }
}

export async function registerUser(name: string, email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if email already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("Email already registered");
  }

  // Count total users — first user becomes admin
  const allUsers = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = allUsers.length === 0;

  const passwordHash = await hashPassword(password);
  const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await db.insert(users).values({
    openId,
    name,
    email,
    passwordHash,
    loginMethod: "password",
    role: isFirstUser ? "admin" : "user",
    lastSignedIn: new Date(),
  });

  const newUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return newUser[0];
}

export async function loginUser(email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (result.length === 0) {
    throw new Error("Invalid email or password");
  }

  const user = result[0];
  if (!user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  // Update lastSignedIn
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

  return user;
}
