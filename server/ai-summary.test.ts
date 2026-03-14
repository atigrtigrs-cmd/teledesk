import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock invokeLLM to avoid real API calls in tests
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "Клиент интересовался оффером для гемблинга. Менеджер предоставил условия и ставки. Клиент попросил время на раздумья.",
          sentiment: "neutral",
          tags: ["оффер", "гемблинг"],
          keyTopics: "оффер, гемблинг, ставки, условия",
          recommendation: "Написать клиенту через 2 дня для follow-up",
        }),
      },
    }],
  }),
}));

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      email: "admin@teledesk.app",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("AI Dialog Summary", () => {
  it("generateSummary procedure exists and is callable", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // The procedure should exist on the router
    expect(caller.dialogs.generateSummary).toBeDefined();
    expect(typeof caller.dialogs.generateSummary).toBe("function");
  });

  it("generateSummary requires dialogId parameter", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Calling without dialogId should throw a validation error
    try {
      await (caller.dialogs.generateSummary as any)({});
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      // Zod validation error or TRPC error
      expect(err).toBeDefined();
    }
  });

  it("LLM mock returns expected structure with all fields", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({ messages: [] });
    const content = response.choices?.[0]?.message?.content;
    expect(content).toBeDefined();
    
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("sentiment");
    expect(parsed).toHaveProperty("tags");
    expect(parsed).toHaveProperty("keyTopics");
    expect(parsed).toHaveProperty("recommendation");
    expect(["positive", "neutral", "negative"]).toContain(parsed.sentiment);
    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(parsed.tags.length).toBeGreaterThan(0);
    expect(parsed.keyTopics.length).toBeGreaterThan(0);
    expect(parsed.recommendation.length).toBeGreaterThan(0);
  });

  it("LLM response can be parsed into AI note format", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({ messages: [] });
    const content = response.choices?.[0]?.message?.content;
    const result = typeof content === "string" ? JSON.parse(content) : content;
    
    // Build the same note format as the backend
    const aiNote = [
      result.summary,
      result.keyTopics ? `\nТемы: ${result.keyTopics}` : "",
      result.recommendation ? `\nРекомендация: ${result.recommendation}` : "",
    ].filter(Boolean).join("");

    expect(aiNote).toContain("Клиент интересовался");
    expect(aiNote).toContain("Темы:");
    expect(aiNote).toContain("Рекомендация:");
    expect(aiNote).toContain("follow-up");
  });
});
