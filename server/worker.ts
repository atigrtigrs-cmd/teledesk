/**
 * LeadCash Connect — Telegram Sync Worker (thin orchestrator)
 *
 * Runs inside the main Express server process (same IP = no AUTH_KEY_DUPLICATED).
 * Delegates ALL MTProto operations to telegram.ts — this file only handles:
 *   - Configurable startup delay (P4)
 *   - Stale syncStatus cleanup on boot (P6)
 *   - Periodic scheduling (poll, keepAlive, watchdog, syncWatchdog)
 *   - Health HTTP endpoint
 *
 * SHUTDOWN is handled by telegram.ts shutdownTelegram() called from index.ts.
 * This file does NOT register SIGTERM/SIGINT handlers (P1: single coordinator).
 */

import "dotenv/config";
import http from "http";
import { isNotNull, eq } from "drizzle-orm";
import { telegramAccounts } from "../drizzle/schema";
import { getDb } from "./db";
import {
  restoreAllSessions,
  connectAccount,
  keepAliveAll,
  syncAccountHistory,
  getActiveAccountIds,
  getIsShuttingDown,
  getIsInCooldown,
  getCanAutoSync,
  cleanupStaleSyncStatuses,
} from "./telegram";

// ─── Worker intervals (cleared on shutdown) ─────────────────────────────────

const workerIntervals: ReturnType<typeof setInterval>[] = [];

// Track accounts currently being synced to avoid duplicate syncs
const syncingAccounts = new Set<number>();

// ─── Poll for new accounts (added via QR in main server) ─────────────────────

async function pollForNewAccounts(): Promise<void> {
  // P2: Don't poll during shutdown
  if (getIsShuttingDown()) return;

  try {
    const db = await getDb();
    if (!db) return;

    const accounts = await db
      .select()
      .from(telegramAccounts)
      .where(isNotNull(telegramAccounts.sessionString));

    const activeIds = getActiveAccountIds();

    for (const acc of accounts) {
      if (!acc.sessionString) continue;
      if (activeIds.includes(acc.id)) continue;
      // P3: Skip accounts in cooldown
      if (getIsInCooldown(acc.id)) continue;

      console.log(
        `[Worker] New account detected: #${acc.id} (@${acc.username}) — connecting...`
      );
      connectAccount(acc.id, acc.sessionString).catch((err) =>
        console.error(
          `[Worker] Failed to connect new account #${acc.id}: ${err?.message ?? err}`
        )
      );
    }

    // Check for accounts that are active but no longer in DB (deleted)
    for (const id of activeIds) {
      const found = accounts.find((a) => a.id === id);
      if (!found) {
        console.log(
          `[Worker] Account #${id} removed from DB — will be cleaned up by next keepAlive`
        );
      }
    }
  } catch (err) {
    console.error("[Worker] pollForNewAccounts error:", err);
  }
}

// ─── Watchdog: reconnect dropped accounts ────────────────────────────────────

async function watchdog(): Promise<void> {
  // P2: Don't reconnect during shutdown
  if (getIsShuttingDown()) return;

  console.log("[Worker] Watchdog: checking connections...");
  const db = await getDb();
  if (!db) return;

  const accounts = await db
    .select()
    .from(telegramAccounts)
    .where(isNotNull(telegramAccounts.sessionString))
    .catch(() => []);

  const activeIds = getActiveAccountIds();

  for (const acc of accounts) {
    if (!acc.sessionString) continue;
    if (activeIds.includes(acc.id)) continue;
    // P3: Skip accounts in cooldown
    if (getIsInCooldown(acc.id)) continue;
    // Skip permanently disconnected accounts
    if (acc.status === "banned") continue;
    const lastErr = acc.lastError ?? "";
    if (
      lastErr.includes("SESSION_REVOKED") ||
      lastErr.includes("AUTH_KEY_INVALID") ||
      lastErr.includes("USER_DEACTIVATED")
    ) continue;

    console.log(
      `[Worker] Watchdog: reconnecting account #${acc.id} (@${acc.username})...`
    );
    connectAccount(acc.id, acc.sessionString).catch((err) =>
      console.error(
        `[Worker] Watchdog reconnect failed for #${acc.id}: ${err?.message ?? err}`
      )
    );
  }
}

// ─── Sync watchdog: trigger sync for accounts that need it ───────────────────

async function syncWatchdog(): Promise<void> {
  // P2: Don't sync during shutdown
  if (getIsShuttingDown()) return;

  const db = await getDb();
  if (!db) return;

  const accounts = await db
    .select()
    .from(telegramAccounts)
    .where(isNotNull(telegramAccounts.sessionString))
    .catch(() => []);

  const activeIds = getActiveAccountIds();

  for (const acc of accounts) {
    if (!acc.sessionString) continue;
    if (!activeIds.includes(acc.id)) continue; // must be connected
    if (syncingAccounts.has(acc.id)) continue; // already syncing locally
    if (acc.syncStatus === "syncing") continue; // already syncing in DB
    // P3: Skip accounts in cooldown
    if (getIsInCooldown(acc.id)) continue;
    // P5: Anti-thrashing guard
    if (!getCanAutoSync(acc.id)) continue;

    const needsSync = acc.syncStatus === "idle" || acc.lastSyncAt === null;
    if (!needsSync) continue;

    console.log(
      `[Worker] Sync watchdog: triggering sync for account #${acc.id} (@${acc.username}), syncStatus=${acc.syncStatus}`
    );
    syncingAccounts.add(acc.id);
    syncAccountHistory(acc.id)
      .catch((err) =>
        console.error(`[Worker] Sync watchdog error for #${acc.id}: ${err?.message ?? err}`)
      )
      .finally(() => syncingAccounts.delete(acc.id));
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[Worker] ━━━ STARTING Telegram Sync Worker ━━━");
  console.log(`[Worker] PID: ${process.pid}`);
  console.log(`[Worker] NODE_ENV: ${process.env.NODE_ENV}`);

  // P4: Configurable startup delay
  const STARTUP_DELAY_MS = parseInt(process.env.WORKER_STARTUP_DELAY_MS ?? "15000", 10);
  console.log(`[Worker] P4: Waiting ${STARTUP_DELAY_MS / 1000}s for old instance SIGTERM shutdown to complete...`);
  await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));
  console.log("[Worker] Startup delay complete — safe to connect Telegram sessions.");

  // P6: Reset stale syncStatus='syncing' before restoring sessions
  console.log("[Worker] P6: Cleaning up stale sync statuses...");
  await cleanupStaleSyncStatuses();

  // Initial session restore (delegated to telegram.ts)
  console.log("[Worker] Restoring all sessions...");
  await restoreAllSessions();

  // ─── Schedule periodic tasks ───────────────────────────────────────────────

  // Poll for new accounts every 30s
  const pollInterval = setInterval(() => {
    pollForNewAccounts().catch((err) =>
      console.error("[Worker] Poll error:", err)
    );
  }, 30 * 1000);
  workerIntervals.push(pollInterval);

  // Keep-alive ping every 3 minutes (delegated to telegram.ts)
  const keepAliveInterval = setInterval(() => {
    keepAliveAll().catch((err) =>
      console.error("[Worker] KeepAlive error:", err)
    );
  }, 3 * 60 * 1000);
  workerIntervals.push(keepAliveInterval);

  // Watchdog reconnect every 5 minutes
  const watchdogInterval = setInterval(() => {
    watchdog().catch((err) =>
      console.error("[Worker] Watchdog error:", err)
    );
  }, 5 * 60 * 1000);
  workerIntervals.push(watchdogInterval);

  // Sync watchdog every 2 minutes
  const syncWatchdogInterval = setInterval(() => {
    syncWatchdog().catch((err) =>
      console.error("[Worker] Sync watchdog error:", err)
    );
  }, 2 * 60 * 1000);
  workerIntervals.push(syncWatchdogInterval);

  console.log("[Worker] All intervals started. Worker is running.");
  console.log("[Worker] ━━━ WORKER READY ━━━");

  // Minimal HTTP server for health checks
  const port = parseInt(process.env.WORKER_PORT ?? "3001");
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: getIsShuttingDown() ? "shutting_down" : "ok",
        uptime: process.uptime(),
        activeClients: getActiveAccountIds(),
        syncingAccounts: Array.from(syncingAccounts),
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  httpServer.listen(port, () => {
    console.log(`[Worker] HTTP health server listening on port ${port}`);
  });
}

/**
 * Shutdown worker intervals.
 * Called from index.ts BEFORE shutdownTelegram() to stop scheduling new work.
 */
export function shutdownWorker(): void {
  console.log(`[Worker] Clearing ${workerIntervals.length} intervals...`);
  for (const id of workerIntervals) clearInterval(id);
  workerIntervals.length = 0;
  syncingAccounts.clear();
  console.log("[Worker] Intervals cleared.");
}

// Export for in-process usage from main server
export async function startWorker(): Promise<void> {
  return main();
}

// Only auto-start when run directly as a standalone worker process
if (process.env.RUN_WORKER_STANDALONE === "true") {
  main().catch((err) => {
    console.error("[Worker] Fatal error:", err);
    process.exit(1);
  });
}
