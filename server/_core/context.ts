import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { verifyToken, AUTH_COOKIE_NAME } from "../authService";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const token = opts.req.cookies?.[AUTH_COOKIE_NAME];
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        const db = await getDb();
        if (db) {
          const result = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
          user = result[0] ?? null;
        }
      }
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
