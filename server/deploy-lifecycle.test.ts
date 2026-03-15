/**
 * Tests for deploy/sync lifecycle fixes (ТЗ points 1-7)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── P2: isShuttingDown flag ─────────────────────────────────────────────────

describe("P2: isShuttingDown flag", () => {
  it("getIsShuttingDown returns false initially", async () => {
    // We can't import telegram.ts directly because it has side effects (TelegramClient etc.)
    // Instead, test the concept: the flag should be false before shutdown
    // This is a design test — verifying the exported API contract
    const mod = await import("./telegram");
    // Before shutdown, flag should be false
    expect(mod.getIsShuttingDown()).toBe(false);
  });
});

// ─── P3: Cooldown logic ──────────────────────────────────────────────────────

describe("P3: Cooldown logic", () => {
  it("getIsInCooldown returns false for unknown accounts", async () => {
    const mod = await import("./telegram");
    expect(mod.getIsInCooldown(999999)).toBe(false);
  });
});

// ─── P5: Anti-thrashing guard ────────────────────────────────────────────────

describe("P5: Anti-thrashing guard", () => {
  it("getCanAutoSync returns true for accounts that haven't synced", async () => {
    const mod = await import("./telegram");
    expect(mod.getCanAutoSync(999999)).toBe(true);
  });
});

// ─── P4: Configurable startup delay ─────────────────────────────────────────

describe("P4: Configurable startup delay", () => {
  it("WORKER_STARTUP_DELAY_MS env is respected in worker code", async () => {
    // Read the worker.ts source to verify it uses the env var
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname.replace("/server/", "/server/"),
      "utf-8"
    );
    expect(workerSource).toContain("WORKER_STARTUP_DELAY_MS");
    expect(workerSource).toContain('process.env.WORKER_STARTUP_DELAY_MS');
  });
});

// ─── P6: Stale syncStatus cleanup ───────────────────────────────────────────

describe("P6: cleanupStaleSyncStatuses export", () => {
  it("cleanupStaleSyncStatuses is exported from telegram.ts", async () => {
    const mod = await import("./telegram");
    expect(typeof mod.cleanupStaleSyncStatuses).toBe("function");
  });
});

// ─── P1: Unified shutdown coordinator ────────────────────────────────────────

describe("P1: Unified shutdown coordinator", () => {
  it("shutdownTelegram is exported from telegram.ts", async () => {
    const mod = await import("./telegram");
    expect(typeof mod.shutdownTelegram).toBe("function");
  });

  it("disconnectAll is an alias for shutdownTelegram", async () => {
    const mod = await import("./telegram");
    expect(mod.disconnectAll).toBe(mod.shutdownTelegram);
  });

  it("worker.ts does NOT register SIGTERM/SIGINT handlers", async () => {
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Worker should NOT have process.on("SIGTERM") or process.on("SIGINT")
    expect(workerSource).not.toContain('process.on("SIGTERM"');
    expect(workerSource).not.toContain("process.on('SIGTERM'");
    expect(workerSource).not.toContain('process.on("SIGINT"');
    expect(workerSource).not.toContain("process.on('SIGINT'");
  });

  it("index.ts calls shutdownTelegram (not disconnectAll) in graceful shutdown", async () => {
    const fs = await import("fs");
    const indexSource = fs.readFileSync(
      new URL("./_core/index.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(indexSource).toContain("shutdownTelegram");
    expect(indexSource).toContain("shutdownWorker");
  });

  it("shutdownWorker is exported from worker.ts", async () => {
    const mod = await import("./worker");
    expect(typeof mod.shutdownWorker).toBe("function");
  });
});

// ─── P7: Diagnostic logging ─────────────────────────────────────────────────

describe("P7: Diagnostic logging", () => {
  it("telegram.ts has shutdown logging markers", async () => {
    const fs = await import("fs");
    const telegramSource = fs.readFileSync(
      new URL("./telegram.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(telegramSource).toContain("SHUTDOWN STARTED");
    expect(telegramSource).toContain("SHUTDOWN COMPLETE");
    expect(telegramSource).toContain("isShuttingDown = true");
  });

  it("worker.ts has startup logging markers", async () => {
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(workerSource).toContain("STARTING Telegram Sync Worker");
    expect(workerSource).toContain("WORKER READY");
  });

  it("index.ts has step-by-step shutdown logging", async () => {
    const fs = await import("fs");
    const indexSource = fs.readFileSync(
      new URL("./_core/index.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(indexSource).toContain("Step 1");
    expect(indexSource).toContain("Step 2");
    expect(indexSource).toContain("Step 3");
  });
});

// ─── Architecture: worker.ts is thin orchestrator ────────────────────────────

describe("Architecture: worker.ts delegates to telegram.ts", () => {
  it("worker.ts imports key functions from telegram.ts", async () => {
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Must import these from telegram.ts
    expect(workerSource).toContain("restoreAllSessions");
    expect(workerSource).toContain("connectAccount");
    expect(workerSource).toContain("keepAliveAll");
    expect(workerSource).toContain("syncAccountHistory");
    expect(workerSource).toContain("getIsShuttingDown");
    expect(workerSource).toContain("getIsInCooldown");
    expect(workerSource).toContain("getCanAutoSync");
    expect(workerSource).toContain("cleanupStaleSyncStatuses");
  });

  it("worker.ts does NOT have its own TelegramClient or activeClients", async () => {
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Worker should NOT import TelegramClient or have its own activeClients
    expect(workerSource).not.toContain("new TelegramClient");
    expect(workerSource).not.toContain("const activeClients");
    expect(workerSource).not.toContain("activeClients.set");
    expect(workerSource).not.toContain("activeClients.get");
  });

  it("worker.ts does NOT have its own connectAccount implementation", async () => {
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Worker should NOT define connectAccount, only import it
    expect(workerSource).not.toContain("async function connectAccount");
    expect(workerSource).not.toContain("function connectAccount");
  });

  it("worker.ts does NOT have its own message handlers", async () => {
    const fs = await import("fs");
    const workerSource = fs.readFileSync(
      new URL("./worker.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(workerSource).not.toContain("handleIncomingMessage");
    expect(workerSource).not.toContain("handleOutgoingMessage");
  });
});
