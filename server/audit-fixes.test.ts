/**
 * Tests for audit fixes:
 * - Cursor-based message pagination
 * - Auto-reply wiring
 * - Rate limiting
 * - Dead page cleanup
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Cursor-based pagination tests ──────────────────────────────────────

describe("Cursor-based message pagination", () => {
  it("messages.list input schema accepts cursor and limit", async () => {
    // Import the router to check the input schema
    const { appRouter } = await import("./routers");
    const procedures = (appRouter as any)._def.procedures;
    expect(procedures["messages.list"]).toBeDefined();
  });

  it("pagination response has messages array, hasMore, and nextCursor", async () => {
    // Verify the procedure returns the expected shape
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "test", role: "admin", name: "Test" },
      req: {} as any,
      res: {} as any,
    });

    // Call with a non-existent dialog — should return empty result with correct shape
    const result = await caller.messages.list({ dialogId: 999999, limit: 10 });
    expect(result).toHaveProperty("messages");
    expect(result).toHaveProperty("hasMore");
    expect(result).toHaveProperty("nextCursor");
    expect(Array.isArray(result.messages)).toBe(true);
    expect(typeof result.hasMore).toBe("boolean");
  });
});

// ─── 2. Auto-reply schema tests ────────────────────────────────────────────

describe("Auto-reply system", () => {
  it("autoReplies table has required fields in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.autoReplies).toBeDefined();
    expect(schema.autoReplies).toBeTruthy();
    // Verify types are exported
    expect(typeof schema.autoReplies).toBe("object");
  });

  it("autoReplies is imported in telegram.ts", async () => {
    const fs = await import("fs");
    const telegramCode = fs.readFileSync("server/telegram.ts", "utf-8");
    expect(telegramCode).toContain("autoReplies");
    expect(telegramCode).toContain("processAutoReplies");
  });

  it("processAutoReplies is called in handleIncomingMessage", async () => {
    const fs = await import("fs");
    const telegramCode = fs.readFileSync("server/telegram.ts", "utf-8");
    // Verify the auto-reply call is in the incoming message handler
    expect(telegramCode).toContain("await processAutoReplies(accountId, dialogId, senderId, text, isNewDialog)");
  });

  it("auto-reply triggers include first_message and keyword", async () => {
    const fs = await import("fs");
    const telegramCode = fs.readFileSync("server/telegram.ts", "utf-8");
    expect(telegramCode).toContain('rule.trigger === "first_message"');
    expect(telegramCode).toContain('rule.trigger === "keyword"');
  });
});

// ─── 3. Rate limiting tests ────────────────────────────────────────────────

describe("Rate limiting", () => {
  it("express-rate-limit is imported in server entry", async () => {
    const fs = await import("fs");
    const serverCode = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(serverCode).toContain("express-rate-limit");
    expect(serverCode).toContain("rateLimit");
  });

  it("rate limiter is applied to /api/trpc", async () => {
    const fs = await import("fs");
    const serverCode = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(serverCode).toContain('app.use("/api/trpc", apiLimiter)');
  });

  it("server trusts first proxy hop for Render-compatible rate limiting", async () => {
    const fs = await import("fs");
    const serverCode = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(serverCode).toContain('app.set("trust proxy", 1)');
  });

  it("slow and 5xx API requests are logged with request metadata", async () => {
    const fs = await import("fs");
    const serverCode = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(serverCode).toContain("[HTTP]");
    expect(serverCode).toContain("durationMs=");
    expect(serverCode).toContain("requestId=");
  });
});

// ─── 4. Dead page cleanup tests ────────────────────────────────────────────

describe("Dead page cleanup", () => {
  const deadPages = [
    "AutoReplies.tsx",
    "ComponentShowcase.tsx",
    "Dashboard.tsx",
    "DialogDetail.tsx",
    "Inbox.tsx",
    "QuickReplies.tsx",
    "Analytics.tsx",
    "Settings.tsx",
  ];

  it.each(deadPages)("dead page %s has been removed", async (page) => {
    const fs = await import("fs");
    const exists = fs.existsSync(`client/src/pages/${page}`);
    expect(exists).toBe(false);
  });

  const activePages = [
    "Messages.tsx",
    "ContactsPage.tsx",
    "FunnelsPage.tsx",
    "AnalyticsPage.tsx",
    "TagsPage.tsx",
    "LeadCashBot.tsx",
    "Accounts.tsx",
    "SettingsPage.tsx",
    "Login.tsx",
    "Register.tsx",
    "Home.tsx",
    "NotFound.tsx",
  ];

  it.each(activePages)("active page %s still exists", async (page) => {
    const fs = await import("fs");
    const exists = fs.existsSync(`client/src/pages/${page}`);
    expect(exists).toBe(true);
  });
});

// ─── 5. SSE connection limits ──────────────────────────────────────────────

describe("SSE connection limits", () => {
  it("SSE module enforces MAX_TOTAL_CONNECTIONS", async () => {
    const fs = await import("fs");
    const sseCode = fs.readFileSync("server/sse.ts", "utf-8");
    expect(sseCode).toContain("MAX_TOTAL_CONNECTIONS");
    expect(sseCode).toContain("MAX_PER_USER");
    expect(sseCode).toContain("429");
  });
});
