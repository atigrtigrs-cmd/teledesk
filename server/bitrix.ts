/**
 * TeleDesk — Bitrix24 Integration Service
 * Creates deals, contacts, and timeline comments via Bitrix24 REST API (webhook)
 */
import { getDb } from "./db";
import { bitrixSettings } from "../drizzle/schema";

// ─── Get active Bitrix24 webhook URL ─────────────────────────────────────────

async function getWebhookUrl(): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const settings = await db
    .select()
    .from(bitrixSettings)
    .limit(1);

  return settings[0]?.webhookUrl ?? null;
}

// ─── Create a deal in Bitrix24 CRM ────────────────────────────────────────────

export async function createBitrixDeal(params: {
  title: string;
  contactName: string;
  contactPhone: string | null;
  description: string;
  // Per-account Bitrix24 pipeline settings
  pipelineId?: string | null;
  stageId?: string | null;
  responsibleId?: string | null;
}): Promise<number | null> {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) {
    console.warn("[Bitrix] No webhook URL configured, skipping deal creation");
    return null;
  }

  try {
    // 1. Create or find contact
    let bitrixContactId: number | null = null;

    if (params.contactPhone) {
      const searchRes = await bitrixCall(webhookUrl, "crm.contact.list", {
        filter: { PHONE: params.contactPhone },
        select: ["ID"],
      });
      if (searchRes?.result?.length > 0) {
        bitrixContactId = parseInt(searchRes.result[0].ID);
      }
    }

    if (!bitrixContactId) {
      const [firstName, ...rest] = params.contactName.split(" ");
      const createContactRes = await bitrixCall(webhookUrl, "crm.contact.add", {
        fields: {
          NAME: firstName ?? params.contactName,
          LAST_NAME: rest.join(" ") || "",
          PHONE: params.contactPhone ? [{ VALUE: params.contactPhone, VALUE_TYPE: "WORK" }] : [],
          SOURCE_ID: "TELEGRAM",
        },
      });
      bitrixContactId = createContactRes?.result ?? null;
    }

    // 2. Create deal
    const dealFields: Record<string, unknown> = {
      TITLE: params.title,
      CONTACT_ID: bitrixContactId,
      COMMENTS: params.description,
      SOURCE_ID: "TELEGRAM",
      OPENED: "Y",
    };

    // Apply per-account pipeline settings if configured
    if (params.pipelineId) dealFields.CATEGORY_ID = params.pipelineId;
    if (params.stageId) dealFields.STAGE_ID = params.stageId;
    if (params.responsibleId) dealFields.ASSIGNED_BY_ID = params.responsibleId;

    const createDealRes = await bitrixCall(webhookUrl, "crm.deal.add", {
      fields: dealFields,
    });

    const dealId = createDealRes?.result ?? null;
    console.log(`[Bitrix] Created deal #${dealId}: "${params.title}"`);
    return dealId ? parseInt(dealId) : null;
  } catch (err) {
    console.error("[Bitrix] Failed to create deal:", err);
    return null;
  }
}

// ─── Add timeline comment to a deal ──────────────────────────────────────────

export async function addBitrixTimelineComment(
  dealId: string,
  comment: string
): Promise<void> {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl || !dealId) return;

  try {
    await bitrixCall(webhookUrl, "crm.timeline.comment.add", {
      fields: {
        ENTITY_ID: parseInt(dealId),
        ENTITY_TYPE: "deal",
        COMMENT: comment,
      },
    });
  } catch (err) {
    console.error("[Bitrix] Failed to add timeline comment:", err);
  }
}

// ─── Update deal with AI summary ─────────────────────────────────────────────

export async function updateBitrixDealSummary(
  dealId: string,
  summary: string,
  sentiment: string,
  tags: string[]
): Promise<void> {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl || !dealId) return;

  try {
    const comment = `📊 AI-Анализ диалога:\n\n📝 Резюме: ${summary}\n\n💬 Тональность: ${sentiment === "positive" ? "✅ Позитивная" : sentiment === "negative" ? "❌ Негативная" : "⚪ Нейтральная"}\n\n🏷 Теги: ${tags.join(", ")}`;

    await addBitrixTimelineComment(dealId, comment);
  } catch (err) {
    console.error("[Bitrix] Failed to update deal summary:", err);
  }
}

// ─── Close deal in Bitrix24 ───────────────────────────────────────────────────

export async function closeBitrixDeal(dealId: string): Promise<void> {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl || !dealId) return;

  try {
    await bitrixCall(webhookUrl, "crm.deal.update", {
      id: parseInt(dealId),
      fields: {
        CLOSED: "Y",
        STAGE_ID: "WON",
      },
    });
  } catch (err) {
    console.error("[Bitrix] Failed to close deal:", err);
  }
}

// ─── Test Bitrix24 connection ─────────────────────────────────────────────────

export async function testBitrixConnection(webhookUrl: string): Promise<boolean> {
  try {
    const res = await bitrixCall(webhookUrl, "profile", {});
    return !!res?.result;
  } catch {
    return false;
  }
}

// ─── Get Bitrix24 pipelines ───────────────────────────────────────────────────

export async function getBitrixPipelines(webhookUrl: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await bitrixCall(webhookUrl, "crm.category.list", { entityTypeId: 2 });
    const categories = res?.result?.categories ?? [];
    return categories.map((c: any) => ({ id: String(c.id), name: c.name }));
  } catch {
    return [];
  }
}

// ─── Low-level Bitrix24 API call ──────────────────────────────────────────────

async function bitrixCall(
  webhookUrl: string,
  method: string,
  params: Record<string, unknown>
): Promise<any> {
  const url = `${webhookUrl.replace(/\/$/, "")}/${method}.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Bitrix24 API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
