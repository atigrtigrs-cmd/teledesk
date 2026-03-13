import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("UI Redesign - tRPC procedures used by new pages", () => {
  it("dialogs.list procedure exists and accepts status filter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Verify the procedure exists and accepts the expected input shape
    const result = await caller.dialogs.list({ status: "all" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("tags.list procedure exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tags.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("users.list procedure exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.users.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("quickReplies.list procedure exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.quickReplies.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("analytics.summaryByPeriod accepts period filter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.summaryByPeriod({ period: "week" });
    expect(result).toHaveProperty("totalDialogs");
    expect(result).toHaveProperty("totalMessages");
    expect(result).toHaveProperty("totalDeals");
    expect(result).toHaveProperty("activeAccounts");
  });

  it("analytics.accountStats accepts period filter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.accountStats({ period: "week" });
    expect(result).toHaveProperty("stats");
    expect(result).toHaveProperty("period");
    expect(Array.isArray(result.stats)).toBe(true);
  }, 15000);

  it("analytics.managerUserStats accepts period filter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.managerUserStats({ period: "week" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("accounts.list procedure exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.accounts.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("workingHours.list procedure exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.workingHours.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("bitrix.get procedure exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Should return settings or null
    const result = await caller.bitrix.get();
    expect(result === null || typeof result === "object").toBe(true);
  });
});
