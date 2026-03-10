/**
 * TeleDesk — Telegram MTProto Service
 * Uses GramJS to connect personal Telegram accounts via QR code,
 * listen for incoming/outgoing messages, and sync full history.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import { getDb } from "./db";
import { telegramAccounts, dialogs, messages, contacts, Dialog } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
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
      } catch (err: any) {
        const errMsg = String(err?.message ?? err ?? "");
        // AUTH_KEY_DUPLICATED means the session is valid but already in use elsewhere
        // (e.g. another server instance). Don't mark as disconnected — just skip.
        if (errMsg.includes("AUTH_KEY_DUPLICATED")) {
          console.warn(`[Telegram] Account #${acc.id} AUTH_KEY_DUPLICATED — session already active elsewhere, skipping`);
        } else {
          console.error(`[Telegram] Failed to restore account #${acc.id}:`, err);
          await db
            .update(telegramAccounts)
            .set({ status: "disconnected" })
            .where(eq(telegramAccounts.id, acc.id));
        }
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
  let myTelegramId: string | null = null;
  try {
    const me = await client.getMe();
    const meUser = me as any;
    myTelegramId = String(meUser.id ?? "");
    await db
      .update(telegramAccounts)
      .set({
        sessionString,
        status: "active",
        telegramId: myTelegramId,
        username: meUser.username ?? null,
        firstName: meUser.firstName ?? null,
        lastName: meUser.lastName ?? null,
        phone: meUser.phone ?? null,
      })
      .where(eq(telegramAccounts.id, accountId));
  } catch (err) {
    console.error("[Telegram] Failed to get account info:", err);
  }

  // Register incoming message handler
  client.addEventHandler(
    (event: NewMessageEvent) => handleIncomingMessage(accountId, event),
    new NewMessage({ incoming: true })
  );

  // Register outgoing message handler (messages sent from Telegram app)
  client.addEventHandler(
    (event: NewMessageEvent) => handleOutgoingMessage(accountId, event),
    new NewMessage({ outgoing: true })
  );

  activeClients.set(accountId, client);
  console.log(`[Telegram] Account #${accountId} connected and listening`);

  // Start history sync in background (don't await — let it run async)
  syncAccountHistory(accountId, client).catch(err =>
    console.error(`[Telegram] History sync failed for account #${accountId}:`, err)
  );
}

// ─── Full History Sync ────────────────────────────────────────────────────────

export async function syncAccountHistory(accountId: number, clientArg?: TelegramClient): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const client = clientArg ?? activeClients.get(accountId);
  if (!client) {
    console.error(`[Sync] No active client for account #${accountId}`);
    return;
  }

  // Mark as syncing
  await db.update(telegramAccounts)
    .set({ syncStatus: "syncing" })
    .where(eq(telegramAccounts.id, accountId));

  console.log(`[Sync] Starting history sync for account #${accountId}`);

  let syncedCount = 0;

  try {
    // Get account's own telegramId for direction detection
    const [acc] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, accountId)).limit(1);
    const myTelegramId = acc?.telegramId ?? null;

    // Get all dialogs (personal chats only)
    const tgDialogs = await client.getDialogs({ limit: 500 });

    for (const tgDialog of tgDialogs) {
      try {
        const entity = tgDialog.entity as any;

        // Only process private chats (not groups/channels/bots)
        if (!entity || entity.className !== "User") continue;
        if (entity.bot) continue; // skip bots

        const contactTelegramId = String(entity.id);
        const contactName = `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim();

        // Upsert contact
        let contactId: number;
        const existingContacts = await db.select().from(contacts)
          .where(eq(contacts.telegramId, contactTelegramId)).limit(1);

        if (existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          // Update contact info
          await db.update(contacts).set({
            username: entity.username ?? existingContacts[0].username,
            firstName: entity.firstName ?? existingContacts[0].firstName,
            lastName: entity.lastName ?? existingContacts[0].lastName,
            phone: entity.phone ?? existingContacts[0].phone,
          }).where(eq(contacts.id, contactId));
        } else {
          const inserted = await db.insert(contacts).values({
            telegramId: contactTelegramId,
            username: entity.username ?? null,
            firstName: entity.firstName ?? null,
            lastName: entity.lastName ?? null,
            phone: entity.phone ?? null,
          });
          contactId = Number((inserted as any)[0]?.insertId ?? 0);
          if (!contactId) continue;
        }

        // Find or create dialog
        let dialogId: number;
        const existingDialogs = await db.select().from(dialogs)
          .where(and(eq(dialogs.telegramAccountId, accountId), eq(dialogs.contactId, contactId)))
          .orderBy(desc(dialogs.id)).limit(1);

        if (existingDialogs.length > 0) {
          dialogId = existingDialogs[0].id;
        } else {
          const inserted = await db.insert(dialogs).values({
            telegramAccountId: accountId,
            contactId,
            status: "open",
            lastMessageText: null,
            lastMessageAt: null,
            unreadCount: 0,
          });
          dialogId = Number((inserted as any)[0]?.insertId ?? 0);
          if (!dialogId) continue;
        }

        // Fetch all messages for this dialog (paginated)
        let offsetId = 0;
        let hasMore = true;
        let lastMsgText: string | null = null;
        let lastMsgAt: Date | null = null;

        while (hasMore) {
          const batch = await client.getMessages(entity, {
            limit: 100,
            offsetId,
          });

          if (!batch || batch.length === 0) break;

          for (const msg of batch) {
            const msgAny = msg as any;
            if (!msgAny.id) continue;

            const tgMsgId = String(msgAny.id);
            const text = msgAny.message ?? msgAny.caption ?? "";
            const msgDate = new Date(Number(msgAny.date) * 1000);
            const isOutgoing = msgAny.out === true;

            // Skip non-text messages with no caption
            if (!text && !msgAny.media) continue;

            // Check for duplicate
            const existing = await db.select({ id: messages.id }).from(messages)
              .where(and(
                eq(messages.dialogId, dialogId),
                eq(messages.telegramMessageId, tgMsgId)
              )).limit(1);

            if (existing.length > 0) continue; // already saved

            await db.insert(messages).values({
              dialogId,
              direction: isOutgoing ? "outgoing" : "incoming",
              text: text || null,
              telegramMessageId: tgMsgId,
              createdAt: msgDate,
            });

            if (!lastMsgAt || msgDate > lastMsgAt) {
              lastMsgAt = msgDate;
              lastMsgText = text || null;
            }
          }

          if (batch.length < 100) {
            hasMore = false;
          } else {
            offsetId = (batch[batch.length - 1] as any).id;
          }
        }

        // Update dialog's last message
        if (lastMsgAt) {
          await db.update(dialogs).set({
            lastMessageText: lastMsgText?.substring(0, 255) ?? null,
            lastMessageAt: lastMsgAt,
          }).where(eq(dialogs.id, dialogId));
        }

        syncedCount++;
        console.log(`[Sync] Synced dialog with ${contactName} (${contactTelegramId}), dialogId=#${dialogId}`);

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));

      } catch (err) {
        console.error(`[Sync] Error syncing dialog:`, err);
      }
    }

    // Mark sync as done
    await db.update(telegramAccounts).set({
      syncStatus: "done",
      lastSyncAt: new Date(),
      syncedDialogs: syncedCount,
    }).where(eq(telegramAccounts.id, accountId));

    console.log(`[Sync] Completed for account #${accountId}: ${syncedCount} dialogs synced`);

    // Notify frontend
    emitInboxEvent({ type: "sync_complete", accountId, syncedCount } as any);

  } catch (err) {
    console.error(`[Sync] Fatal error for account #${accountId}:`, err);
    await db.update(telegramAccounts).set({ syncStatus: "error" })
      .where(eq(telegramAccounts.id, accountId));
  }
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
      contactId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0);
    }

    // ── 2. Find existing dialog (any status) or create one ───────────────
    const existingDialogs = await db
      .select()
      .from(dialogs)
      .where(
        and(
          eq(dialogs.telegramAccountId, accountId),
          eq(dialogs.contactId, contactId!)
        )
      )
      .orderBy(desc(dialogs.id))
      .limit(1);

    let dialogId: number;
    const isNewDialog = existingDialogs.length === 0;

    if (existingDialogs.length > 0) {
      dialogId = existingDialogs[0].id;
      await db
        .update(dialogs)
        .set({
          status: "open",
          lastMessageText: text.substring(0, 255),
          lastMessageAt: new Date(),
          unreadCount: existingDialogs[0].unreadCount + 1,
        })
        .where(eq(dialogs.id, dialogId));
    } else {
      const inserted = await db.insert(dialogs).values({
        telegramAccountId: accountId,
        contactId: contactId!,
        status: "open",
        lastMessageText: text.substring(0, 255),
        lastMessageAt: new Date(),
        unreadCount: 1,
      });
      dialogId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0);

      await createBitrixDealForDialog(dialogId, contactId!, sender, text, accountId).catch(err =>
        console.error("[Bitrix] Failed to create deal:", err)
      );
    }

    if (!dialogId) {
      console.error(`[Telegram] dialogId is 0 or null, cannot save message.`);
      return;
    }

    // Check for duplicate (may have been synced already)
    const existingMsg = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.dialogId, dialogId), eq(messages.telegramMessageId, tgMsgId))).limit(1);
    if (existingMsg.length > 0) return;

    await db.insert(messages).values({
      dialogId,
      direction: "incoming",
      text: text || null,
      telegramMessageId: tgMsgId,
      createdAt: new Date(Number(msg.date) * 1000),
    });

    emitInboxEvent(
      isNewDialog
        ? { type: "new_dialog", dialogId, accountId }
        : { type: "new_message", dialogId, accountId }
    );

    console.log(`[Telegram] Incoming message in dialog #${dialogId}: "${text.substring(0, 50)}"`);
  } catch (err) {
    console.error("[Telegram] Error handling incoming message:", err);
  }
}

// ─── Handle outgoing message (sent from Telegram app) ────────────────────────

async function handleOutgoingMessage(accountId: number, event: NewMessageEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const msg = event.message;
    if (!msg || !msg.peerId) return;

    // Only private chats
    const peerId = msg.peerId as any;
    if (!peerId.userId) return;

    const recipientId = String(peerId.userId);
    const text = msg.message ?? "";
    const tgMsgId = String(msg.id);

    // Find contact
    const existingContacts = await db.select().from(contacts)
      .where(eq(contacts.telegramId, recipientId)).limit(1);

    if (existingContacts.length === 0) return; // unknown contact, skip

    const contactId = existingContacts[0].id;

    // Find dialog
    const existingDialogs = await db.select().from(dialogs)
      .where(and(eq(dialogs.telegramAccountId, accountId), eq(dialogs.contactId, contactId)))
      .orderBy(desc(dialogs.id)).limit(1);

    if (existingDialogs.length === 0) return;

    const dialogId = existingDialogs[0].id;

    // Check for duplicate
    const existingMsg = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.dialogId, dialogId), eq(messages.telegramMessageId, tgMsgId))).limit(1);
    if (existingMsg.length > 0) return;

    await db.insert(messages).values({
      dialogId,
      direction: "outgoing",
      text: text || null,
      telegramMessageId: tgMsgId,
      createdAt: new Date(Number(msg.date) * 1000),
    });

    // Update last message
    await db.update(dialogs).set({
      lastMessageText: text.substring(0, 255),
      lastMessageAt: new Date(Number(msg.date) * 1000),
    }).where(eq(dialogs.id, dialogId));

    emitInboxEvent({ type: "new_message", dialogId, accountId });

    console.log(`[Telegram] Outgoing (from app) in dialog #${dialogId}: "${text.substring(0, 50)}"`);
  } catch (err) {
    console.error("[Telegram] Error handling outgoing message:", err);
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

  // For group chats imported via JSON export, telegramId starts with 'group_'
  // These cannot be sent to via MTProto without a proper peer resolution
  if (telegramContactId.startsWith("group_")) {
    throw new Error(`Cannot send to group contact ${telegramContactId} — use the Telegram app directly`);
  }

  // Resolve entity by numeric ID to ensure correct peer
  const numericId = parseInt(telegramContactId, 10);
  if (isNaN(numericId)) throw new Error(`Invalid telegramContactId: ${telegramContactId}`);

  try {
    const entity = await client.getInputEntity(numericId);
    await client.sendMessage(entity, { message: text });
    console.log(`[Telegram] Sent message to ${telegramContactId} via account #${accountId}`);
  } catch (err: any) {
    console.error(`[Telegram] sendMessage failed for ${telegramContactId}:`, err?.message ?? err);
    throw new Error(`Telegram send failed: ${err?.message ?? String(err)}`);
  }
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

type PendingPhoneSession = {
  client: TelegramClient;
  resolveCode: (code: string) => void;
  rejectCode: (err: Error) => void;
  resolveTwoFA: (pw: string) => void;
  rejectTwoFA: (err: Error) => void;
  done: Promise<void>;
};

const pendingPhoneClients = new Map<number, PendingPhoneSession>();

export async function startPhoneLogin(
  accountId: number,
  phone: string
): Promise<{ ok: true }> {
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
    phoneCode: async () => codePromise,
    password: async () => twoFAPromise,
    onError: async (err: Error) => {
      console.error("[Telegram] Phone login error:", err.message);
      rejectCode(err);
      rejectTwoFA(err);
      return true;
    },
  }).then(async () => {
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

  pending.resolveCode(code);
  await new Promise<void>((res) => setTimeout(res, 1500));

  if (!pendingPhoneClients.has(accountId)) {
    return { success: true, requiresPassword: false };
  }
  return { success: false, requiresPassword: true };
}

export async function verifyTwoFAPassword(
  accountId: number,
  password: string
): Promise<void> {
  const pending = pendingPhoneClients.get(accountId);
  if (!pending) throw new Error("Нет активной сессии.");

  pending.resolveTwoFA(password);
  await pending.done;

  if (pendingPhoneClients.has(accountId)) {
    throw new Error("Ошибка авторизации. Проверьте пароль и попробуйте снова.");
  }
}

// ─── Get active account IDs ───────────────────────────────────────────────────

export function getActiveAccountIds(): number[] {
  return Array.from(activeClients.keys());
}
