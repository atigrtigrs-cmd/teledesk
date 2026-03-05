/**
 * Unit tests for per-account Bitrix24 pipeline settings.
 *
 * Verifies that createBitrixDeal correctly maps the optional
 * pipelineId / stageId / responsibleId params to the Bitrix24 API fields
 * CATEGORY_ID / STAGE_ID / ASSIGNED_BY_ID.
 *
 * We mock global fetch and the db module so no real HTTP requests are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock the db module so getWebhookUrl returns a fake URL ──────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ webhookUrl: "https://fake.bitrix24.com/rest/1/fake/" }]),
  }),
}));

// ─── Capture what fields are sent to crm.deal.add ────────────────────────────
let capturedDealFields: Record<string, unknown> = {};

const mockFetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
  const body = JSON.parse(opts?.body ?? "{}");
  if (String(url).includes("crm.deal.add")) {
    capturedDealFields = body.fields ?? {};
  }
  return {
    ok: true,
    json: async () => ({ result: 42 }),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createBitrixDeal – per-account pipeline settings", () => {
  beforeEach(() => {
    capturedDealFields = {};
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does NOT set CATEGORY_ID / STAGE_ID / ASSIGNED_BY_ID when params are absent", async () => {
    const { createBitrixDeal } = await import("./bitrix");

    await createBitrixDeal({
      title: "Test deal",
      contactName: "John Doe",
      contactPhone: null,
      description: "Hello",
    });

    expect(capturedDealFields).not.toHaveProperty("CATEGORY_ID");
    expect(capturedDealFields).not.toHaveProperty("STAGE_ID");
    expect(capturedDealFields).not.toHaveProperty("ASSIGNED_BY_ID");
  });

  it("sets CATEGORY_ID / STAGE_ID / ASSIGNED_BY_ID when params are provided", async () => {
    const { createBitrixDeal } = await import("./bitrix");

    await createBitrixDeal({
      title: "Test deal",
      contactName: "Jane Doe",
      contactPhone: "+79001234567",
      description: "Hello",
      pipelineId: "5",
      stageId: "C5:NEW",
      responsibleId: "12",
    });

    expect(capturedDealFields).toMatchObject({
      CATEGORY_ID: "5",
      STAGE_ID: "C5:NEW",
      ASSIGNED_BY_ID: "12",
    });
  });

  it("does NOT set fields when params are null", async () => {
    const { createBitrixDeal } = await import("./bitrix");

    await createBitrixDeal({
      title: "Test deal",
      contactName: "Bob",
      contactPhone: null,
      description: "Hi",
      pipelineId: null,
      stageId: null,
      responsibleId: null,
    });

    expect(capturedDealFields).not.toHaveProperty("CATEGORY_ID");
    expect(capturedDealFields).not.toHaveProperty("STAGE_ID");
    expect(capturedDealFields).not.toHaveProperty("ASSIGNED_BY_ID");
  });
});
