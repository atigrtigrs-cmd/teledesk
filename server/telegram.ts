/**
 * TeleDesk — Telegram MTProto Service
 * Uses GramJS to connect personal Telegram accounts via QR code,
 * listen for incoming messages, and sync with Bitrix24.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import { getDb } from "./db";
import { telegramAccounts, dialogs, messages, contacts, Dialog } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createBitrixDeal, addBitrixTimelineComment } from "./bitrix";
import { invokeLLM } from "./_core/llm";
import { emitInboxEvent } from "./sse";

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID ?? "36272545");
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH ?? "c287b0998fac419b776486e511f364fc";

// Map of accountId → TelegramClient
const activeClients = new Map<number, TelegramClient>();

// ─── QR Login Flow ───────────────────────────────────────────────────────────

export async function startQRLogin(accountId: number): Promise<{ token: string; expires: number }> {
  const session = new StringSession("");
  const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 3,
    useWSS: true,
  });

  await client.connect();

  return new Promise((resolve, reject) => {
    client.signInUserWithQrCode(
      { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
      {
        qrCode: async (qr) => {
          // token is base64 encoded — frontend renders it as QR
          resolve({ token: qr.token.toString("base64"), expires: qr.expires });
        },
        onError: async (err) => {
          reject(err);
          return true;
        },
        password: async () => "",
      }
    ).then(async () => {
      // Login successful — save session and start listening
      const sessionStr = client.session.save() as unknown as string;
      await saveSessionAndListen(accountId, client, sessionStr);
    }).catch(reject);
  });
}

// ─── Restore all active sessions on server start ─────────────────────────────

export async function restoreAllSessions(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const accounts = await db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.status, "active"));

    for (const acc of accounts) {
      if (!acc.sessionString) continue;
      try {
        await connectAccount(acc.id, acc.sessionString);
        console.log(`[Telegram] Restored session for account #${acc.id}`);
      } catch (err) {
        console.error(`[Telegram] Failed to restore account #${acc.id}:`, err);
      await db
        .update(telegramAccounts)
        .set({ status: "disconnected" })
        .where(eq(telegramAccounts.id, acc.id));
      }
    }
  } catch (err) {
    console.error("[Telegram] Failed to restore sessions:", err);
  }
}

// ─── Connect account with existing session ───────────────────────────────────

export async function connectAccount(accountId: number, sessionString: string): Promise<void> {
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 3,
    useWSS: true,
  });

  await client.connect();
  await saveSessionAndListen(accountId, client, sessionString);
}

// ─── Disconnect account ───────────────────────────────────────────────────────

export async function disconnectAccount(accountId: number): Promise<void> {
  const client = activeClients.get(accountId);
  if (client) {
    await client.disconnect();
    activeClients.delete(accountId);
  }
}

// ─── Save session and start message listener ─────────────────────────────────

async function saveSessionAndListen(
  accountId: number,
  client: TelegramClient,
  sessionString: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get account info from Telegram
  try {
    const me = await client.getMe();
    const meUser = me as any;
    await db
      .update(telegramAccounts)
      .set({
        sessionString,
        status: "active",
        telegramId: String(meUser.id ?? ""),
        username: meUser.username ?? null,
        firstName: meUser.firstName ?? null,
        lastName: meUser.lastName ?? null,
        phone: meUser.phone ?? null,
      })
      .where(eq(telegramAccounts.id, accountId));
  } catch (err) {
    console.error("[Telegram] Failed to get account info:", err);
  }

  // Register message handler
  client.addEventHandler(
    (event: NewMessageEvent) => handleIncomingMessage(accountId, event),
    new NewMessage({ incoming: true })
  );

  activeClients.set(accountId, client);
  console.log(`[Telegram] Account #${accountId} connected and listening`);
}

// ─── Handle incoming message ─────────────────────────────────────────────────

async function handleIncomingMessage(accountId: number, event: NewMessageEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const msg = event.message;
    if (!msg || !msg.peerId) return;

    // Only handle private messages (not groups/channels)
    const peerId = msg.peerId as any;
    if (!peerId.userId) return;

    const senderId = String(peerId.userId);
    const text = msg.message ?? "";
    const tgMsgId = String(msg.id);

    // ── 1. Upsert contact ──────────────────────────────────────────────────
    const senderEntity = await (event.client ?? activeClients.get(accountId))?.getEntity(peerId).catch(() => null) ?? null;
    const sender = senderEntity as any;

    let contactId: number | null = null;
    const existingContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.telegramId, senderId))
      .limit(1);

    if (existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      const inserted = await db.insert(contacts).values({
        telegramId: senderId,
        username: sender?.username ?? null,
        firstName: sender?.firstName ?? null,
        lastName: sender?.lastName ?? null,
        phone: sender?.phone ?? null,
      });
      contactId = Number((inserted as any).insertId ?? 0);
    }

    // ── 2. Find or create open dialog ─────────────────────────────────────
    const openDialogs = await db
      .select()
      .from(dialogs)
      .where(
        and(
          eq(dialogs.telegramAccountId, accountId),
          eq(dialogs.contactId, contactId!),
          eq(dialogs.status, "open")
        )
      )
      .limit(1);

    let dialogId: number;

    if (openDialogs.length > 0) {
      dialogId = openDialogs[0].id;
      // Update last message
      await db
        .update(dialogs)
        .set({
          lastMessageText: text.substring(0, 255),
          lastMessageAt: new Date(),
          unreadCount: openDialogs[0].unreadCount + 1,
        })
        .where(eq(dialogs.id, dialogId));
    } else {
      // Create new dialog
      const inserted = await db.insert(dialogs).values({
        telegramAccountId: accountId,
        contactId: contactId!,
        status: "open",
        lastMessageText: text.substring(0, 255),
        lastMessageAt: new Date(),
        unreadCount: 1,
      });
      dialogId = Number((inserted as any).insertId ?? 0);

      // Create Bitrix24 deal for new dialog (pass accountId for per-account pipeline settings)
      await createBitrixDealForDialog(dialogId, contactId!, sender, text, accountId).catch(err =>
        console.error("[Bitrix] Failed to create deal:", err)
      );
    }

    // ── 3. Save message ────────────────────────────────────────────────────
    await db.insert(messages).values({
      dialogId,
      direction: "incoming",
      text: text || null,
      telegramMessageId: tgMsgId,
      createdAt: new Date(Number(msg.date) * 1000),
    });

    // ── 4. Push real-time SSE event to all connected browser clients ───────
    const isNewDialog = openDialogs.length === 0;
    emitInboxEvent(
      isNewDialog
        ? { type: "new_dialog", dialogId, accountId }
        : { type: "new_message", dialogId, accountId }
    );

    console.log(`[Telegram] New message in dialog #${dialogId}: "${text.substring(0, 50)}"`);
  } catch (err) {
    console.error("[Telegram] Error handling message:", err);
  }
}

// ─── Send message via Telegram ────────────────────────────────────────────────

export async function sendTelegramMessage(
  accountId: number,
  telegramContactId: string,
  text: string
): Promise<void> {
  const client = activeClients.get(accountId);
  if (!client) throw new Error(`Account #${accountId} is not connected`);

  await client.sendMessage(telegramContactId, { message: text });
}

// ─── Create Bitrix24 deal for new dialog ─────────────────────────────────────

async function createBitrixDealForDialog(
  dialogId: number,
  contactId: number,
  sender: any,
  firstMessage: string,
  accountId?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Load per-account Bitrix24 pipeline settings if accountId is provided
  let pipelineId: string | null = null;
  let stageId: string | null = null;
  let responsibleId: string | null = null;

  if (accountId) {
    const acct = await db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.id, accountId))
      .limit(1);
    if (acct[0]) {
      pipelineId = acct[0].bitrixPipelineId ?? null;
      stageId = acct[0].bitrixStageId ?? null;
      responsibleId = acct[0].bitrixResponsibleId ?? null;
    }
    if (pipelineId || stageId || responsibleId) {
      console.log(`[Bitrix] Using per-account pipeline for account #${accountId}: pipeline=${pipelineId}, stage=${stageId}, responsible=${responsibleId}`);
    }
  }

  const dealId = await createBitrixDeal({
    title: `Telegram: ${sender?.firstName ?? ""} ${sender?.lastName ?? ""} @${sender?.username ?? ""}`.trim(),
    contactName: `${sender?.firstName ?? ""} ${sender?.lastName ?? ""}`.trim(),
    contactPhone: sender?.phone ?? null,
    description: `Первое сообщение: ${firstMessage}`,
    pipelineId,
    stageId,
    responsibleId,
  });

  if (dealId) {
    await db
      .update(dialogs)
      .set({ bitrixDealId: String(dealId) })
      .where(eq(dialogs.id, dialogId));
  }
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

export async function analyzeDialog(dialogId: number): Promise<{
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  tags: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.dialogId, dialogId))
    .limit(50);

  if (!msgs.length) {
    return { summary: "Нет сообщений для анализа", sentiment: "neutral", tags: [] };
  }

  const conversation = msgs
    .map(m => `${m.direction === "incoming" ? "Клиент" : "Менеджер"}: ${m.text ?? "[медиа]"}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Ты аналитик диалогов службы поддержки. Анализируй переписку и возвращай JSON с полями:
- summary: краткое резюме диалога (2-3 предложения на русском)
- sentiment: "positive", "negative" или "neutral"
- tags: массив из 1-3 тегов на русском (например: ["вопрос о цене", "жалоба", "новый клиент"])`,
      },
      {
        role: "user",
        content: `Проанализируй диалог:\n\n${conversation}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "dialog_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "sentiment", "tags"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

  return {
    summary: parsed.summary ?? "",
    sentiment: parsed.sentiment ?? "neutral",
    tags: parsed.tags ?? [],
  };
}

// ─── Phone Login Flow ────────────────────────────────────────────────────────
//
// Uses GramJS high-level client.start() which automatically handles:
//   • PHONE_MIGRATE — switches to the correct DC transparently
//   • FloodWait — surfaces the wait time in the error message
//   • PHONE_NUMBER_INVALID — clear error
//   • SESSION_PASSWORD_NEEDED — triggers 2FA step
//
// The flow is callback-driven: start() calls our callbacks when it needs
// the phone code or 2FA password. We use a Promise pair to bridge the
// async callback into the request/response tRPC model.

type PendingPhoneSession = {
  client: TelegramClient;
  // Resolvers that start() is waiting on
  resolveCode: (code: string) => void;
  rejectCode: (err: Error) => void;
  resolveTwoFA: (pw: string) => void;
  rejectTwoFA: (err: Error) => void;
  // Whether start() has completed (success or error)
  done: Promise<void>;
};

const pendingPhoneClients = new Map<number, PendingPhoneSession>();

export async function startPhoneLogin(
  accountId: number,
  phone: string
): Promise<{ ok: true }> {
  // Clean up any existing pending session
  const existing = pendingPhoneClients.get(accountId);
  if (existing) {
    existing.rejectCode(new Error("New login attempt started"));
    existing.rejectTwoFA(new Error("New login attempt started"));
    await existing.client.disconnect().catch(() => {});
    pendingPhoneClients.delete(accountId);
  }

  const session = new StringSession("");
  const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 5,
    useWSS: true,
    // Let GramJS handle DC migration automatically
    deviceModel: "LeadCash Connect",
    appVersion: "1.0",
    langCode: "ru",
  });

  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  let resolveTwoFA!: (pw: string) => void;
  let rejectTwoFA!: (err: Error) => void;

  const codePromise = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });
  const twoFAPromise = new Promise<string>((res, rej) => { resolveTwoFA = res; rejectTwoFA = rej; });

  const done = client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => {
      // Wait until verifyPhoneCode() provides the code
      return codePromise;
    },
    password: async () => {
      // Wait until verifyTwoFAPassword() provides the password
      return twoFAPromise;
    },
    onError: async (err: Error) => {
      console.error("[Telegram] Phone login error:", err.message);
      rejectCode(err);
      rejectTwoFA(err);
      return true; // tell GramJS we handled it
    },
  }).then(async () => {
    // Login successful — save session
    const sessionStr = client.session.save() as unknown as string;
    await saveSessionAndListen(accountId, client, sessionStr);
    pendingPhoneClients.delete(accountId);
    console.log(`[Telegram] Phone login successful for account #${accountId}`);
  }).catch((err: Error) => {
    pendingPhoneClients.delete(accountId);
    client.disconnect().catch(() => {});
    console.error(`[Telegram] Phone login failed for account #${accountId}:`, err.message);
  });

  pendingPhoneClients.set(accountId, {
    client,
    resolveCode,
    rejectCode,
    resolveTwoFA,
    rejectTwoFA,
    done,
  });

  // Give GramJS a moment to connect and send the code before returning
  // (start() is async and fires the phoneCode callback after sendCode succeeds)
  await new Promise<void>((res) => setTimeout(res, 2000));

  return { ok: true };
}

export async function verifyPhoneCode(
  accountId: number,
  _phone: string,
  code: string
): Promise<{ success: boolean; requiresPassword: boolean }> {
  const pending = pendingPhoneClients.get(accountId);
  if (!pending) throw new Error("Нет активной сессии. Запросите код ещё раз.");

  // Provide the code to the waiting start() callback
  pending.resolveCode(code);

  // Wait briefly to see if start() completes (success) or asks for 2FA
  await new Promise<void>((res) => setTimeout(res, 1500));

  // If the session is gone, login completed successfully
  if (!pendingPhoneClients.has(accountId)) {
    return { success: true, requiresPassword: false };
  }

  // Session still present — either 2FA needed or error
  // We can't distinguish here without more state, so assume 2FA
  return { success: false, requiresPassword: true };
}

export async function verifyTwoFAPassword(
  accountId: number,
  password: string
): Promise<void> {
  const pending = pendingPhoneClients.get(accountId);
  if (!pending) throw new Error("Нет активной сессии.");

  // Provide the 2FA password to the waiting start() callback
  pending.resolveTwoFA(password);

  // Wait for start() to complete
  await pending.done;

  if (pendingPhoneClients.has(accountId)) {
    throw new Error("Ошибка авторизации. Проверьте пароль и попробуйте снова.");
  }
}

// ─── Get QR token for active session check ────────────────────────────────────

export function getActiveAccountIds(): number[] {
  return Array.from(activeClients.keys());
}
