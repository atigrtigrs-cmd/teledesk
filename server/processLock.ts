/**
 * processLock.ts
 *
 * Prevents two Node.js processes from holding MTProto sessions simultaneously.
 *
 * Problem: Render zero-downtime deploys keep the old process alive for ~60-120s
 * while the new process starts. Both processes try to use the same MTProto session
 * strings → AUTH_KEY_DUPLICATED.
 *
 * Solution: Use the shared MySQL database as a distributed lock.
 * Each process has a random instanceId (UUID). On startup, we try to INSERT or
 * UPDATE the lock row. If another instance holds it and hasn't expired, we wait.
 * The lock has a TTL (heartbeat) — we refresh it every 30s. If a process dies
 * without releasing, the lock expires after 2 minutes and the next process takes over.
 */

import crypto from "crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, lt, sql } from "drizzle-orm";
import { processLocks } from "../drizzle/schema";
import { disconnectAll } from "./telegram";

const LOCK_NAME = "telegram-worker";
const LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes TTL
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // refresh every 30s
const WAIT_INTERVAL_MS = 5 * 1000; // check every 5s

export const MY_INSTANCE_ID = crypto.randomUUID();

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  return drizzle(process.env.DATABASE_URL);
}

/**
 * Ensure the process_locks table exists (create if not exists).
 * This handles production DBs that haven't run the migration yet.
 */
export async function ensureProcessLocksTable(): Promise<void> {
  const db = getDb();
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS process_locks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lockName VARCHAR(64) NOT NULL UNIQUE,
        instanceId VARCHAR(128) NOT NULL,
        acquiredAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP NOT NULL
      )
    `);
    console.log("[ProcessLock] process_locks table ready");
  } catch (err) {
    console.error("[ProcessLock] Failed to create process_locks table:", err);
  }
}

/**
 * Try to acquire the distributed lock.
 * Returns true if we hold the lock, false if another instance holds it.
 */
async function tryAcquireLock(): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    // Try to insert a new lock row (will fail if lockName already exists)
    await db.insert(processLocks).values({
      lockName: LOCK_NAME,
      instanceId: MY_INSTANCE_ID,
      acquiredAt: now,
      expiresAt,
    });
    console.log(`[ProcessLock] Acquired new lock (instanceId=${MY_INSTANCE_ID})`);
    return true;
  } catch {
    // Lock row already exists — check if it's ours or expired
    const [existing] = await db
      .select()
      .from(processLocks)
      .where(eq(processLocks.lockName, LOCK_NAME))
      .limit(1);

    if (!existing) {
      // Race condition: row was deleted between our INSERT and SELECT — retry
      return tryAcquireLock();
    }

    if (existing.instanceId === MY_INSTANCE_ID) {
      // We already hold it (e.g. called twice)
      return true;
    }

    // Check if the lock has expired
    if (existing.expiresAt < now) {
      // Expired — take it over with UPDATE
      const result = await db
        .update(processLocks)
        .set({ instanceId: MY_INSTANCE_ID, acquiredAt: now, expiresAt })
        .where(eq(processLocks.lockName, LOCK_NAME));
      const affected = (result as any)[0]?.affectedRows ?? 0;
      if (affected > 0) {
        console.log(`[ProcessLock] Took over expired lock (instanceId=${MY_INSTANCE_ID})`);
        return true;
      }
      // Another process beat us to it — retry
      return false;
    }

    // Another live instance holds the lock
    return false;
  }
}

/**
 * Acquire the distributed lock, waiting up to timeoutMs for it to be released.
 * Call this before starting MTProto connections.
 */
export async function acquireProcessLock(timeoutMs = 3 * 60 * 1000): Promise<boolean> {
  // Ensure table exists first (handles production DBs without migration)
  await ensureProcessLocksTable();

  const deadline = Date.now() + timeoutMs;
  let waited = 0;

  while (Date.now() < deadline) {
    const acquired = await tryAcquireLock().catch((err) => {
      console.error("[ProcessLock] DB error during lock attempt:", err);
      return false;
    });

    if (acquired) {
      // Start heartbeat to keep lock alive
      startHeartbeat();
      return true;
    }

    // Check who holds the lock
    const db = getDb();
    const [existing] = await db
      .select()
      .from(processLocks)
      .where(eq(processLocks.lockName, LOCK_NAME))
      .limit(1)
      .catch(() => [null as any]);

    if (existing) {
      const expiresIn = Math.round((existing.expiresAt.getTime() - Date.now()) / 1000);
      console.log(
        `[ProcessLock] Lock held by instanceId=${existing.instanceId} (expires in ${expiresIn}s). Waiting... (${waited}s elapsed)`
      );
    }

    await new Promise((r) => setTimeout(r, WAIT_INTERVAL_MS));
    waited += WAIT_INTERVAL_MS / 1000;
  }

  console.warn(`[ProcessLock] Timed out waiting for lock — proceeding anyway (risk of AUTH_KEY_DUPLICATED)`);
  return false;
}

/**
 * Start a heartbeat to refresh the lock TTL every 30s.
 */
function startHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    try {
      const db = getDb();
      const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
      await db
        .update(processLocks)
        .set({ expiresAt })
        .where(eq(processLocks.lockName, LOCK_NAME));
    } catch (err) {
      console.error("[ProcessLock] Heartbeat failed:", err);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Release the lock on process exit.
 */
export async function releaseProcessLock(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  try {
    const db = getDb();
    await db
      .delete(processLocks)
      .where(eq(processLocks.lockName, LOCK_NAME));
    console.log(`[ProcessLock] Released lock (instanceId=${MY_INSTANCE_ID})`);
  } catch {
    // ignore
  }
}

// Auto-release on process exit — also disconnect all MTProto clients so Telegram releases sessions
process.on("SIGTERM", async () => {
  console.log("[ProcessLock] SIGTERM received — disconnecting all Telegram clients before exit...");
  try {
    await disconnectAll();
  } catch (err) {
    console.error("[ProcessLock] Error during disconnectAll on SIGTERM:", err);
  }
  await releaseProcessLock();
  process.exit(0);
});
process.on("SIGINT", async () => {
  console.log("[ProcessLock] SIGINT received — disconnecting all Telegram clients before exit...");
  try {
    await disconnectAll();
  } catch (err) {
    console.error("[ProcessLock] Error during disconnectAll on SIGINT:", err);
  }
  await releaseProcessLock();
  process.exit(0);
});
