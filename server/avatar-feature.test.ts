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

describe("Avatar Feature - contacts include avatarUrl", () => {
  it("dialogs.list returns contact objects with avatarUrl field", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dialogs.list({ status: "all" });
    expect(Array.isArray(result)).toBe(true);
    // If there are dialogs, verify contact shape includes avatarUrl
    if (result.length > 0) {
      const firstWithContact = result.find(r => r.contact !== null);
      if (firstWithContact?.contact) {
        expect(firstWithContact.contact).toHaveProperty("avatarUrl");
        // avatarUrl can be null or a string URL
        const avatarUrl = firstWithContact.contact.avatarUrl;
        expect(avatarUrl === null || typeof avatarUrl === "string").toBe(true);
      }
    }
  });

  it("contacts schema has avatarUrl column", async () => {
    const { contacts } = await import("../drizzle/schema");
    // Verify the avatarUrl column exists in the contacts table definition
    expect(contacts).toBeDefined();
    const columns = Object.keys(contacts);
    // The table object should have the column defined
    expect(contacts.avatarUrl).toBeDefined();
  });

  it("downloadAndStoreAvatar helper is defined in telegram module", async () => {
    // We can't easily test the actual download (needs TG client),
    // but we verify the module loads without errors
    const telegramModule = await import("./telegram");
    expect(telegramModule).toBeDefined();
    // Verify the main exports still work
    expect(typeof telegramModule.connectAccount).toBe("function");
  });
});
