/**
 * TeleDesk — Telegram MTProto Service
 * Uses GramJS to connect personal Telegram accounts via QR code,
 * listen for incoming/outgoing messages, and sync full history.
 *
 * FIX: Now syncs ALL dialog types (private, groups, supergroups, channels)
 * FIX: Real-time handler captures all message types (not just private)
 * FIX: Gap-fill on reconnect — fetches messages since lastSyncAt
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import { getDb } from "./db";
import { telegramAccounts, dialogs, messages, contacts, Dialog } from "../drizzle/schema";
import { eq, and, desc, inArray, gt, isNotNull, sql } from "drizzle-orm";
import { createBitrixDeal, addBitrixTimelineComment } from "./bitrix";
import { invokeLLM } from "./_core/llm";
import { emitInboxEvent } from "./sse";
import { storagePut } from "./storage";

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID ?? "36272545");
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH ?? "c287b0998fac419b776486e511f364fc";

// Map of accountId → TelegramClient
const activeClients = new Map<number, TelegramClient>();

// Cache of already-downloaded avatars to avoid re-downloading
const avatarDownloadedSet = new Set<string>();

/**
 * Download a Telegram entity's profile photo and upload to S3.
 * Returns the CDN URL or null if no photo / error.
 */
async function downloadAndStoreAvatar(
  client: TelegramClient,
  entity: any,
  contactTelegramId: string
): Promise<string | null> {
  try {
    if (avatarDownloadedSet.has(contactTelegramId)) return null;
    avatarDownloadedSet.add(contactTelegramId);

    const buffer = await client.downloadProfilePhoto(entity, { isBig: false });
    if (!buffer || (Buffer.isBuffer(buffer) && buffer.length === 0)) return null;
    // buffer can be Buffer or string path — we need Buffer
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
    if (buf.length < 100) return null; // too small, probably empty

    const key = `avatars/${contactTelegramId}.jpg`;
    const { url } = await storagePut(key, buf, "image/jpeg");
    return url;
  } catch (err) {
    // Silently fail — avatar is non-critical
    return null;
  }
}

// Mutex to prevent parallel connection attempts for the same account
const connectingAccounts = new Set<number>();

// Flag to track if restoreAllSessions is currently running
let isRestoringAllSessions = false;

// ─── QR Login Flow ───────────────────────────────────────────────────────────

type PendingQRSession = {
  client: TelegramClient;
  resolveTwoFA: (pw: string) => void;
  rejectTwoFA: (err: Error) => void;
  needsPassword: boolean;
  done: Promise<void>;
};

const pendingQRClients = new Map<number, PendingQRSession>();

export async function startQRLogin(accountId: number): Promise<{ token: string; expires: number }> {
  // Clean up any existing QR session for this account
  const existing = pendingQRClients.get(accountId);
  if (existing) {
    existing.rejectTwoFA(new Error("New QR login attempt started"));
    await existing.client.disconnect().catch(() => {});
    pendingQRClients.delete(accountId);
  }

  const session = new StringSession("");
  const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 3,
    useWSS: true,
    deviceModel: "LeadCash Connect",
    appVersion: "1.0",
    langCode: "ru",
  });

  await client.connect();

  let resolveTwoFA!: (pw: string) => void;
  let rejectTwoFA!: (err: Error) => void;
  const twoFAPromise = new Promise<string>((res, rej) => { resolveTwoFA = res; rejectTwoFA = rej; });

  // Register in Map BEFORE starting signInUserWithQrCode to avoid race condition
  pendingQRClients.set(accountId, {
    client,
    resolveTwoFA,
    rejectTwoFA,
    needsPassword: false,
    done: Promise.resolve(), // placeholder, will be replaced below
  });

  return new Promise((resolve, reject) => {
    const done = client.signInUserWithQrCode(
      { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
      {
        qrCode: async (qr) => {
          // token is base64 encoded — frontend renders it as QR
          console.log(`[Telegram] QR code generated for account #${accountId}, expires: ${qr.expires}`);
          resolve({ token: qr.token.toString("base64"), expires: qr.expires });
        },
        onError: async (err) => {
          console.error(`[Telegram] QR login onError for account #${accountId}: ${err.message} | errorMessage: ${(err as any).errorMessage} | stack: ${err.stack?.split('\n')[1]}`);
          // Don't reject on SESSION_PASSWORD_NEEDED — gramjs handles it internally
          if ((err as any).errorMessage === 'SESSION_PASSWORD_NEEDED') {
            console.log(`[Telegram] SESSION_PASSWORD_NEEDED caught in onError — gramjs should handle this internally`);
            return false; // don't stop auth
          }
          reject(err);
          rejectTwoFA(err);
          return true;
        },
        password: async () => {
          // 2FA is required — signal to frontend and wait for password
          console.log(`[Telegram] QR login: 2FA password required for account #${accountId}`);
          const pending = pendingQRClients.get(accountId);
          if (pending) {
            pending.needsPassword = true;
          }
          // Update DB status to signal frontend that 2FA is needed
          const db = await getDb();
          if (db) {
            await db.update(telegramAccounts)
              .set({ status: "needs_2fa" })
              .where(eq(telegramAccounts.id, accountId))
              .catch((e) => console.error(`[Telegram] Failed to set needs_2fa status:`, e.message));
            console.log(`[Telegram] Set status=needs_2fa for account #${accountId}`);
          }
          return twoFAPromise;
        },
      }
    ).then(async () => {
      // Login successful — save session and start listening
      const sessionStr = client.session.save() as unknown as string;
      await saveSessionAndListen(accountId, client, sessionStr);
      pendingQRClients.delete(accountId);
      console.log(`[Telegram] QR login successful for account #${accountId}`);
    }).catch((err: Error) => {
      pendingQRClients.delete(accountId);
      client.disconnect().catch(() => {});
      console.error(`[Telegram] QR login failed for account #${accountId}:`, err.message);
    });

    // Update the done promise in the Map
    const pending = pendingQRClients.get(accountId);
    if (pending) {
      (pending as any).done = done;
    }
  });
}

export async function verifyQRTwoFAPassword(
  accountId: number,
  password: string
): Promise<void> {
  const pending = pendingQRClients.get(accountId);
  if (!pending) throw new Error("Нет активной QR сессии. Попробуйте подключить аккаунт заново.");

  pending.resolveTwoFA(password);
  await pending.done;

  if (pendingQRClients.has(accountId)) {
    throw new Error("Ошибка авторизации. Проверьте пароль и попробуйте снова.");
  }
}

// Returns in-memory QR session status — used by frontend polling to detect 2FA requirement
// without relying on DB update latency
export function getQRLoginStatus(accountId: number): { pending: boolean; needsPassword: boolean } {
  const session = pendingQRClients.get(accountId);
  if (!session) return { pending: false, needsPassword: false };
  return { pending: true, needsPassword: session.needsPassword };
}

// ─── Restore all active sessions on server start ─────────────────────────────

export async function restoreAllSessions(): Promise<void> {
  // Prevent parallel runs — only one restore at a time
  if (isRestoringAllSessions) {
    console.log("[Telegram] restoreAllSessions already running, skipping");
    return;
  }
  isRestoringAllSessions = true;

  console.log(`[Telegram] restoreAllSessions START — uptime: ${Math.round(process.uptime())}s, activeClients: [${Array.from(activeClients.keys()).join(', ')}]`);

  const db = await getDb();
  if (!db) {
    console.error("[Telegram] restoreAllSessions: DB not available");
    isRestoringAllSessions = false;
    return;
  }

  try {
    // Restore ALL accounts that have a session string, regardless of current status.
    // This ensures disconnected accounts are also reconnected by the watchdog.
    const accounts = await db
      .select()
      .from(telegramAccounts)
      .where(isNotNull(telegramAccounts.sessionString));

    console.log(`[Telegram] restoreAllSessions: found ${accounts.length} accounts with session strings`);

    for (const acc of accounts) {
      if (!acc.sessionString) continue;

      // Skip accounts already connected in this process — no need to reconnect
      if (activeClients.has(acc.id)) {
        console.log(`[Telegram] Account #${acc.id} (@${acc.username}) already connected, skipping`);
        continue;
      }

      console.log(`[Telegram] Attempting to restore account #${acc.id} (@${acc.username})...`);
      try {
        await connectAccount(acc.id, acc.sessionString);
        console.log(`[Telegram] ✓ Restored session for account #${acc.id} (@${acc.username})`);
      } catch (err: any) {
        const errMsg = String(err?.message ?? err ?? "");
        if (errMsg.includes("AUTH_KEY_DUPLICATED")) {
          // connectAccount already retried with backoff — if we're here, all retries failed
          console.warn(`[Telegram] Account #${acc.id} AUTH_KEY_DUPLICATED after all retries — session in use by another process`);
        } else if (errMsg.includes("FLOOD_WAIT")) {
          console.warn(`[Telegram] Account #${acc.id} FLOOD_WAIT — rate limited, will retry later`);
        } else {
          console.error(`[Telegram] Failed to restore account #${acc.id} (@${acc.username}): ${errMsg}`);
          if (errMsg.includes("SESSION_REVOKED") || errMsg.includes("AUTH_KEY_INVALID") || errMsg.includes("USER_DEACTIVATED")) {
            await db
              .update(telegramAccounts)
              .set({ status: "disconnected" })
              .where(eq(telegramAccounts.id, acc.id));
          }
        }
      }
    }

    const connectedNow = Array.from(activeClients.keys());
    console.log(`[Telegram] restoreAllSessions DONE — activeClients: [${connectedNow.join(', ')}] (${connectedNow.length}/${accounts.length})`);
  } catch (err) {
    console.error("[Telegram] Failed to restore sessions:", err);
  } finally {
    isRestoringAllSessions = false;
  }
}

// ─── Connect account with existing session ───────────────────────────────────

export async function connectAccount(accountId: number, sessionString: string): Promise<void> {
  // Prevent parallel connection attempts for the same account
  if (connectingAccounts.has(accountId)) {
    throw new Error(`Account #${accountId} is already being connected`);
  }
  // If already connected, skip
  if (activeClients.has(accountId)) {
    console.log(`[Telegram] Account #${accountId} already in activeClients, skipping connect`);
    return;
  }
  connectingAccounts.add(accountId);
  try {
    // Process lock in index.ts guarantees we're the only process holding MTProto sessions.
    // No retry loop needed — if we get AUTH_KEY_DUPLICATED here, it means the lock didn't work
    // (e.g. /tmp is not shared between processes on this platform).
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
      connectionRetries: 3,
      retryDelay: 2000,
      useWSS: false,
      autoReconnect: true,
    });
    console.log(`[Telegram] Account #${accountId} connecting...`);
    await client.connect();
    // Success — save session and start listening
    await saveSessionAndListen(accountId, client, sessionString);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    if (msg.includes("AUTH_KEY_DUPLICATED")) {
      console.error(`[Telegram] Account #${accountId} AUTH_KEY_DUPLICATED — process lock may not be working on this platform`);
    }
    throw err;
  } finally {
    connectingAccounts.delete(accountId);
  }
}

// ─── Disconnect account ───────────────────────────────────────────────────────

export async function disconnectAccount(accountId: number): Promise<void> {
  const client = activeClients.get(accountId);
  if (client) {
    await client.disconnect();
    activeClients.delete(accountId);
  }
}

/**
 * Gracefully disconnect ALL active MTProto clients.
 * Call this on SIGTERM so Telegram releases sessions immediately.
 */
export async function disconnectAll(): Promise<void> {
  const ids = Array.from(activeClients.keys());
  console.log(`[Telegram] disconnectAll: disconnecting ${ids.length} clients...`);
  await Promise.allSettled(
    ids.map(async (id) => {
      try {
        const client = activeClients.get(id);
        if (client) {
          await client.disconnect();
          activeClients.delete(id);
          console.log(`[Telegram] disconnectAll: account #${id} disconnected`);
        }
      } catch (err) {
        console.error(`[Telegram] disconnectAll: error disconnecting account #${id}:`, err);
      }
    })
  );
  console.log(`[Telegram] disconnectAll: done`);
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

  // Register incoming message handler (ALL chat types)
  client.addEventHandler(
    (event: NewMessageEvent) => handleIncomingMessage(accountId, event),
    new NewMessage({ incoming: true })
  );

  // Register outgoing message handler (messages sent from Telegram app, ALL chat types)
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

// ─── Extract peer ID and type from a message ────────────────────────────────

function extractPeerInfo(msg: any): { peerId: string; peerType: "user" | "group" | "channel" } | null {
  const peerId = msg.peerId as any;
  if (!peerId) return null;

  if (peerId.userId) {
    return { peerId: String(peerId.userId), peerType: "user" };
  } else if (peerId.chatId) {
    return { peerId: `group_${peerId.chatId}`, peerType: "group" };
  } else if (peerId.channelId) {
    return { peerId: `channel_${peerId.channelId}`, peerType: "channel" };
  }
  return null;
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

  // Get account info including lastSyncAt for gap-fill
  const [acc] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, accountId)).limit(1);
  const myTelegramId = acc?.telegramId ?? null;
  const lastSyncAt = acc?.lastSyncAt ?? null;

  // Mark as syncing
  await db.update(telegramAccounts)
    .set({ syncStatus: "syncing" })
    .where(eq(telegramAccounts.id, accountId));

  console.log(`[Sync] Starting history sync for account #${accountId}${lastSyncAt ? ` (gap-fill from ${lastSyncAt.toISOString()})` : " (full sync)"}`);

  let syncedCount = 0;

  try {
    // Get all dialogs (limit 500 — covers most active accounts)
    const tgDialogs = await client.getDialogs({ limit: 500 });

    for (const tgDialog of tgDialogs) {
      try {
        const entity = tgDialog.entity as any;
        if (!entity) continue;

        // Determine entity type and extract ID/name
        let contactTelegramId: string;
        let contactName: string;
        let isBot = false;

        if (entity.className === "User") {
          isBot = !!entity.bot;
          if (isBot) continue; // skip bots
          contactTelegramId = String(entity.id);
          contactName = `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim() || entity.username || `User ${entity.id}`;
        } else if (entity.className === "Chat") {
          // Regular group
          contactTelegramId = `group_${entity.id}`;
          contactName = entity.title ?? `Group ${entity.id}`;
        } else if (entity.className === "Channel") {
          // Supergroup or channel
          contactTelegramId = `channel_${entity.id}`;
          contactName = entity.title ?? `Channel ${entity.id}`;
        } else {
          continue; // unknown type
        }

        // Upsert contact
        let contactId: number;
        const existingContacts = await db.select().from(contacts)
          .where(eq(contacts.telegramId, contactTelegramId)).limit(1);

        if (existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          // Download avatar if missing
          let avatarUrl = existingContacts[0].avatarUrl;
          if (!avatarUrl) {
            avatarUrl = await downloadAndStoreAvatar(client, entity, contactTelegramId);
          }
          // Update contact info
          await db.update(contacts).set({
            username: entity.username ?? existingContacts[0].username,
            firstName: entity.firstName ?? entity.title ?? existingContacts[0].firstName,
            lastName: entity.lastName ?? existingContacts[0].lastName,
            phone: entity.phone ?? existingContacts[0].phone,
            ...(avatarUrl && !existingContacts[0].avatarUrl ? { avatarUrl } : {}),
          }).where(eq(contacts.id, contactId));
        } else {
          const avatarUrl = await downloadAndStoreAvatar(client, entity, contactTelegramId);
          const inserted = await db.insert(contacts).values({
            telegramId: contactTelegramId,
            username: entity.username ?? null,
            firstName: entity.firstName ?? entity.title ?? null,
            lastName: entity.lastName ?? null,
            phone: entity.phone ?? null,
            ...(avatarUrl ? { avatarUrl } : {}),
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

        // Fetch messages — for gap-fill, only fetch since lastSyncAt
        // For full sync, fetch all (paginated)
        let offsetId = 0;
        let hasMore = true;
        let lastMsgText: string | null = null;
        let lastMsgAt: Date | null = null;

        // If gap-fill: convert lastSyncAt to unix timestamp for comparison
        const gapFillFromTs = lastSyncAt ? Math.floor(lastSyncAt.getTime() / 1000) : 0;

        while (hasMore) {
          const batch = await client.getMessages(entity, {
            limit: 100,
            offsetId,
          });

          if (!batch || batch.length === 0) break;

          let hitOldMessage = false;

          for (const msg of batch) {
            const msgAny = msg as any;
            if (!msgAny.id) continue;

            const msgDateTs = Number(msgAny.date ?? 0);

            // Gap-fill: stop when we hit messages older than lastSyncAt
            if (gapFillFromTs > 0 && msgDateTs < gapFillFromTs) {
              hitOldMessage = true;
              continue; // skip old messages but don't break — batch may be unordered
            }

            const tgMsgId = String(msgAny.id);
            const text = msgAny.message ?? msgAny.caption ?? "";
            const msgDate = new Date(msgDateTs * 1000);

            // Determine direction
            let isOutgoing: boolean;
            if (myTelegramId) {
              isOutgoing = msgAny.out === true || String(msgAny.fromId?.userId ?? "") === myTelegramId;
            } else {
              isOutgoing = msgAny.out === true;
            }

            // Skip messages with no text and no media
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

          // Stop paginating if we hit old messages (gap-fill complete) or batch is smaller than limit
          if (hitOldMessage && gapFillFromTs > 0) {
            hasMore = false;
          } else if (batch.length < 100) {
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
        await new Promise(r => setTimeout(r, 50));

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

// ─── Handle incoming message (ALL chat types) ────────────────────────────────

async function handleIncomingMessage(accountId: number, event: NewMessageEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const msg = event.message;
    if (!msg || !msg.peerId) return;

    const peerInfo = extractPeerInfo(msg);
    if (!peerInfo) return;

    const { peerId: senderId, peerType } = peerInfo;
    const text = (msg as any).message ?? "";
    const tgMsgId = String((msg as any).id);

    // ── 1. Upsert contact ──────────────────────────────────────────────────
    let sender: any = null;
    try {
      sender = await (event.client ?? activeClients.get(accountId))?.getEntity(msg.peerId).catch(() => null) ?? null;
    } catch {}

    let contactId: number | null = null;
    const existingContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.telegramId, senderId))
      .limit(1);

    const rtClient = event.client ?? activeClients.get(accountId);
    if (existingContacts.length > 0) {
      contactId = existingContacts[0].id;
      // Download avatar if missing
      if (!existingContacts[0].avatarUrl && sender && rtClient) {
        const avatarUrl = await downloadAndStoreAvatar(rtClient, sender, senderId);
        if (avatarUrl) {
          await db.update(contacts).set({ avatarUrl }).where(eq(contacts.id, contactId));
        }
      }
    } else {
      const name = sender?.firstName ?? sender?.title ?? null;
      let avatarUrl: string | null = null;
      if (sender && rtClient) {
        avatarUrl = await downloadAndStoreAvatar(rtClient, sender, senderId);
      }
      const inserted = await db.insert(contacts).values({
        telegramId: senderId,
        username: sender?.username ?? null,
        firstName: name,
        lastName: sender?.lastName ?? null,
        phone: sender?.phone ?? null,
        ...(avatarUrl ? { avatarUrl } : {}),
      });
      contactId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0);
    }

    if (!contactId) return;

    // ── 2. Find existing dialog or create one ───────────────────────────
    const existingDialogs = await db
      .select()
      .from(dialogs)
      .where(
        and(
          eq(dialogs.telegramAccountId, accountId),
          eq(dialogs.contactId, contactId)
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
        contactId: contactId,
        status: "open",
        lastMessageText: text.substring(0, 255),
        lastMessageAt: new Date(),
        unreadCount: 1,
      });
      dialogId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0);

      // Only create Bitrix deal for private chats (not groups/channels)
      if (peerType === "user") {
        await createBitrixDealForDialog(dialogId, contactId, sender, text, accountId).catch(err =>
          console.error("[Bitrix] Failed to create deal:", err)
        );
      }
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
      createdAt: new Date(Number((msg as any).date) * 1000),
    });

    emitInboxEvent(
      isNewDialog
        ? { type: "new_dialog", dialogId, accountId }
        : { type: "new_message", dialogId, accountId }
    );

    console.log(`[Telegram] Incoming (${peerType}) in dialog #${dialogId}: "${text.substring(0, 50)}"`);
  } catch (err) {
    console.error("[Telegram] Error handling incoming message:", err);
  }
}

// ─── Handle outgoing message (sent from Telegram app, ALL chat types) ────────

async function handleOutgoingMessage(accountId: number, event: NewMessageEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const msg = event.message;
    if (!msg || !msg.peerId) return;

    const peerInfo = extractPeerInfo(msg);
    if (!peerInfo) return;

    const { peerId: recipientId } = peerInfo;
    const text = (msg as any).message ?? "";
    const tgMsgId = String((msg as any).id);

    // Find contact
    const existingContacts = await db.select().from(contacts)
      .where(eq(contacts.telegramId, recipientId)).limit(1);

    const outClient = activeClients.get(accountId);
    if (existingContacts.length === 0) {
      // Contact doesn't exist yet — create it so the dialog can be found/created
      let entity: any = null;
      try {
        entity = await outClient?.getEntity(msg.peerId).catch(() => null) ?? null;
      } catch {}
      let avatarUrl: string | null = null;
      if (entity && outClient) {
        avatarUrl = await downloadAndStoreAvatar(outClient, entity, recipientId);
      }
      const inserted = await db.insert(contacts).values({
        telegramId: recipientId,
        username: entity?.username ?? null,
        firstName: entity?.firstName ?? entity?.title ?? null,
        lastName: entity?.lastName ?? null,
        phone: entity?.phone ?? null,
        ...(avatarUrl ? { avatarUrl } : {}),
      });
      const newContactId = Number((inserted as any)[0]?.insertId ?? 0);
      if (!newContactId) return;
    } else if (!existingContacts[0].avatarUrl && outClient) {
      // Existing contact without avatar — try to download
      try {
        const entity = await outClient.getEntity(msg.peerId).catch(() => null);
        if (entity) {
          const avatarUrl = await downloadAndStoreAvatar(outClient, entity, recipientId);
          if (avatarUrl) {
            await db.update(contacts).set({ avatarUrl }).where(eq(contacts.id, existingContacts[0].id));
          }
        }
      } catch {}
    }

    const [contact] = await db.select().from(contacts)
      .where(eq(contacts.telegramId, recipientId)).limit(1);
    if (!contact) return;

    // Find or create dialog
    const existingDialogs = await db.select().from(dialogs)
      .where(and(eq(dialogs.telegramAccountId, accountId), eq(dialogs.contactId, contact.id)))
      .orderBy(desc(dialogs.id)).limit(1);

    let dialogId: number;
    if (existingDialogs.length === 0) {
      const inserted = await db.insert(dialogs).values({
        telegramAccountId: accountId,
        contactId: contact.id,
        status: "open",
        lastMessageText: text.substring(0, 255),
        lastMessageAt: new Date(Number((msg as any).date) * 1000),
        unreadCount: 0,
      });
      dialogId = Number((inserted as any)[0]?.insertId ?? 0);
      if (!dialogId) return;
    } else {
      dialogId = existingDialogs[0].id;
    }

    // Check for duplicate
    const existingMsg = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.dialogId, dialogId), eq(messages.telegramMessageId, tgMsgId))).limit(1);
    if (existingMsg.length > 0) return;

    await db.insert(messages).values({
      dialogId,
      direction: "outgoing",
      text: text || null,
      telegramMessageId: tgMsgId,
      createdAt: new Date(Number((msg as any).date) * 1000),
    });

    // Update last message
    await db.update(dialogs).set({
      lastMessageText: text.substring(0, 255),
      lastMessageAt: new Date(Number((msg as any).date) * 1000),
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
  if (telegramContactId.startsWith("group_") || telegramContactId.startsWith("channel_")) {
    throw new Error(`Cannot send to group/channel contact ${telegramContactId} — use the Telegram app directly`);
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

// ─── Keep-alive ping for all active clients ───────────────────────────────────
// Sends a lightweight getMe() request to each active MTProto client every 2 minutes
// to prevent Render's idle connection timeout from dropping sessions.

export async function keepAliveAll(): Promise<void> {
  const db = await getDb();
  for (const [accountId, client] of Array.from(activeClients.entries())) {
    try {
      await client.getMe();
      // console.log(`[KeepAlive] Account #${accountId} is alive`);
    } catch (err: any) {
      const errMsg = String(err?.message ?? err ?? "");
      if (errMsg.includes("AUTH_KEY_DUPLICATED")) {
        // Session is valid but used by another instance — remove from active map
        // so the watchdog will reconnect it properly
        activeClients.delete(accountId);
        console.warn(`[KeepAlive] Account #${accountId} AUTH_KEY_DUPLICATED — removed from active map, watchdog will reconnect`);
      } else {
        console.error(`[KeepAlive] Account #${accountId} ping failed:`, err);
        // Remove from active map so watchdog reconnects it
        activeClients.delete(accountId);
        // Mark as disconnected in DB so UI shows correct status
        if (db) {
          await db.update(telegramAccounts)
            .set({ status: "disconnected" })
            .where(eq(telegramAccounts.id, accountId));
        }
      }
    }
  }
}

// ─── Force sync ALL accounts ──────────────────────────────────────────────────────────
// Called by the "Обновить" button in Inbox.
// IMPORTANT: Only uses already-connected clients from activeClients.
// Never creates new connections to avoid AUTH_KEY_DUPLICATED.
// AUTH_KEY_DUPLICATED happens when same session is used from 2 processes simultaneously
// (e.g. old Render instance + new Render instance during deploy).

export async function forceSyncAll(): Promise<{ synced: number; errors: number; accounts: { id: number; username: string | null; dialogs: number; error?: string }[] }> {
  const db = await getDb();
  if (!db) throw new Error("No database connection");

  const accounts = await db.select().from(telegramAccounts);
  const results: { id: number; username: string | null; dialogs: number; error?: string }[] = [];
  let totalErrors = 0;

  const activeIds = Array.from(activeClients.keys());
  console.log(`[ForceSyncAll] Starting sync. DB accounts: ${accounts.length}, Active clients: [${activeIds.join(', ')}]`);

  for (const acc of accounts) {
    if (!acc.sessionString) {
      console.log(`[ForceSyncAll] Account #${acc.id} has no session, skipping`);
      continue;
    }

    let client = activeClients.get(acc.id);

    // If not in activeClients, wait up to 5 minutes for restoreAllSessions to finish (if running)
    // connectAccount now retries with 30s/60s/90s backoff so restoreAllSessions can take up to ~5 min
    if (!client) {
      // Wait for any in-progress restoreAllSessions to finish
      if (isRestoringAllSessions) {
        console.log(`[ForceSyncAll] Account #${acc.id}: waiting for restoreAllSessions to finish (up to 5 min)...`);
        emitInboxEvent({ type: "sync_progress", accountId: acc.id, username: acc.username, status: "connecting" });
        for (let i = 0; i < 300 && isRestoringAllSessions; i++) {
          await new Promise(r => setTimeout(r, 1000));
        }
        client = activeClients.get(acc.id);
      }

      // Still not connected — try to connect ourselves
      if (!client) {
        console.log(`[ForceSyncAll] Account #${acc.id} (@${acc.username}) not in activeClients — attempting to connect...`);
        emitInboxEvent({ type: "sync_progress", accountId: acc.id, username: acc.username, status: "connecting" });
        try {
          await connectAccount(acc.id, acc.sessionString);
          client = activeClients.get(acc.id);
          console.log(`[ForceSyncAll] Account #${acc.id} connected successfully`);
        } catch (err: any) {
          const connectErr = String(err?.message ?? err ?? "");
          console.error(`[ForceSyncAll] Account #${acc.id} connect failed: ${connectErr}`);
          emitInboxEvent({ type: "sync_progress", accountId: acc.id, username: acc.username, status: "error", error: connectErr });
          results.push({ id: acc.id, username: acc.username, dialogs: 0, error: connectErr });
          totalErrors++;
          continue;
        }
      }

      if (!client) {
        const errMsg = "Не подключён. Попробуйте через минуту";
        emitInboxEvent({ type: "sync_progress", accountId: acc.id, username: acc.username, status: "error", error: errMsg });
        results.push({ id: acc.id, username: acc.username, dialogs: 0, error: errMsg });
        totalErrors++;
        continue;
      }
    }

    console.log(`[ForceSyncAll] Account #${acc.id} (@${acc.username}) connected, syncing dialogs...`);
    // Step 2: Get account info for direction detection
    const [accInfo] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, acc.id)).limit(1);
    const myTelegramId = accInfo?.telegramId ?? null;
    const username = accInfo?.username ?? acc.username;

    // Step 3: Fetch dialogs
    let tgDialogs: any[];
    try {
      console.log(`[ForceSyncAll] Account #${acc.id} (@${username}): calling getDialogs(limit=500)...`);
      tgDialogs = await client.getDialogs({ limit: 500 });
      console.log(`[ForceSyncAll] Account #${acc.id}: got ${tgDialogs.length} dialogs from Telegram`);
    } catch (dlgErr: any) {
      const errMsg = String(dlgErr?.message ?? dlgErr ?? "");
      console.error(`[ForceSyncAll] getDialogs failed for account #${acc.id}: ${errMsg}`);
      results.push({ id: acc.id, username, dialogs: 0, error: `getDialogs: ${errMsg}` });
      totalErrors++;
      continue;
    }

    // Step 4: Mark as syncing
    await db.update(telegramAccounts)
      .set({ syncStatus: "syncing", lastSyncAt: null })
      .where(eq(telegramAccounts.id, acc.id));

    let syncedCount = 0;

    // Step 5: Process each dialog
    for (const tgDialog of tgDialogs) {
      try {
        const entity = tgDialog.entity as any;
        if (!entity) continue;

        let contactTelegramId: string;
        let contactName: string;

        if (entity.className === "User") {
          if (entity.bot) continue;
          contactTelegramId = String(entity.id);
          contactName = `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim() || entity.username || `User ${entity.id}`;
        } else if (entity.className === "Chat") {
          contactTelegramId = `group_${entity.id}`;
          contactName = entity.title ?? `Group ${entity.id}`;
        } else if (entity.className === "Channel") {
          contactTelegramId = `channel_${entity.id}`;
          contactName = entity.title ?? `Channel ${entity.id}`;
        } else {
          continue;
        }

        // Upsert contact
        let contactId: number;
        const existingContacts = await db.select().from(contacts)
          .where(eq(contacts.telegramId, contactTelegramId)).limit(1);

        if (existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          let avatarUrl = existingContacts[0].avatarUrl;
          if (!avatarUrl) {
            avatarUrl = await downloadAndStoreAvatar(client, entity, contactTelegramId);
          }
          await db.update(contacts).set({
            username: entity.username ?? existingContacts[0].username,
            firstName: entity.firstName ?? entity.title ?? existingContacts[0].firstName,
            lastName: entity.lastName ?? existingContacts[0].lastName,
            phone: entity.phone ?? existingContacts[0].phone,
            ...(avatarUrl && !existingContacts[0].avatarUrl ? { avatarUrl } : {}),
          }).where(eq(contacts.id, contactId));
        } else {
          const avatarUrl = await downloadAndStoreAvatar(client, entity, contactTelegramId);
          const inserted = await db.insert(contacts).values({
            telegramId: contactTelegramId,
            username: entity.username ?? null,
            firstName: entity.firstName ?? entity.title ?? null,
            lastName: entity.lastName ?? null,
            phone: entity.phone ?? null,
            ...(avatarUrl ? { avatarUrl } : {}),
          });
          contactId = Number((inserted as any)[0]?.insertId ?? 0);
          if (!contactId) continue;
        }

        // Find or create dialog
        let dialogId: number;
        const existingDialogs = await db.select().from(dialogs)
          .where(and(eq(dialogs.telegramAccountId, acc.id), eq(dialogs.contactId, contactId)))
          .orderBy(desc(dialogs.id)).limit(1);

        if (existingDialogs.length > 0) {
          dialogId = existingDialogs[0].id;
        } else {
          const inserted = await db.insert(dialogs).values({
            telegramAccountId: acc.id,
            contactId,
            status: "open",
            lastMessageText: null,
            lastMessageAt: null,
            unreadCount: 0,
          });
          dialogId = Number((inserted as any)[0]?.insertId ?? 0);
          if (!dialogId) continue;
        }

        // Fetch messages (last 100 per dialog — fast, reliable)
        let lastMsgText: string | null = null;
        let lastMsgAt: Date | null = null;

        try {
          const batch = await client.getMessages(entity, { limit: 100 });
          for (const msg of batch) {
            const msgAny = msg as any;
            if (!msgAny.id) continue;
            const msgDateTs = Number(msgAny.date ?? 0);
            const tgMsgId = String(msgAny.id);
            const text = msgAny.message ?? msgAny.caption ?? "";
            const msgDate = new Date(msgDateTs * 1000);

            let isOutgoing: boolean;
            if (myTelegramId) {
              isOutgoing = msgAny.out === true || String(msgAny.fromId?.userId ?? "") === myTelegramId;
            } else {
              isOutgoing = msgAny.out === true;
            }

            if (!text && !msgAny.media) continue;

            const existing = await db.select({ id: messages.id }).from(messages)
              .where(and(eq(messages.dialogId, dialogId), eq(messages.telegramMessageId, tgMsgId))).limit(1);
            if (existing.length > 0) continue;

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
        } catch (msgErr: any) {
          // Message fetch failure is non-fatal — dialog still counts as synced
          console.warn(`[ForceSyncAll] Message fetch failed for dialog ${contactName}: ${msgErr?.message}`);
        }

        // Update dialog's last message
        if (lastMsgAt) {
          await db.update(dialogs).set({
            lastMessageText: lastMsgText?.substring(0, 255) ?? null,
            lastMessageAt: lastMsgAt,
          }).where(eq(dialogs.id, dialogId));
        }

        syncedCount++;
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 30));

      } catch (dlgProcessErr: any) {
        console.error(`[ForceSyncAll] Error processing dialog for account #${acc.id}:`, dlgProcessErr?.message);
      }
    }

    // Mark sync as done
    await db.update(telegramAccounts).set({
      syncStatus: "done",
      lastSyncAt: new Date(),
      syncedDialogs: syncedCount,
    }).where(eq(telegramAccounts.id, acc.id));

    console.log(`[ForceSyncAll] Account #${acc.id} (@${username}): synced ${syncedCount}/${tgDialogs.length} dialogs`);
    results.push({ id: acc.id, username, dialogs: syncedCount });
  }

  const totalSynced = results.reduce((sum, r) => sum + r.dialogs, 0);

  // Notify frontend via SSE with full results
  emitInboxEvent({ type: "sync_complete", totalSynced, totalErrors, accounts: results });

  return { synced: totalSynced, errors: totalErrors, accounts: results };
}

/**
 * Bulk update avatars for all contacts that don't have one yet.
 * Uses active TG clients to download profile photos.
 */
export async function bulkUpdateAvatars(): Promise<{ updated: number; skipped: number; errors: number }> {
  const db = await getDb();
  if (!db) throw new Error("No database connection");

  // Get contacts without avatars
  const contactsWithoutAvatar = await db.select({
    id: contacts.id,
    telegramId: contacts.telegramId,
  }).from(contacts).where(
    sql`${contacts.avatarUrl} IS NULL OR ${contacts.avatarUrl} = ''`
  );

  if (contactsWithoutAvatar.length === 0) {
    return { updated: 0, skipped: 0, errors: 0 };
  }

  console.log(`[BulkAvatars] Starting for ${contactsWithoutAvatar.length} contacts without avatars`);

  // Get any active client to use for downloading
  const clientEntries = Array.from(activeClients.entries());
  if (clientEntries.length === 0) {
    throw new Error("No active Telegram clients available");
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Clear the avatar download cache so we can re-try
  avatarDownloadedSet.clear();

  for (const contact of contactsWithoutAvatar) {
    try {
      // Try each client until one works
      let avatarUrl: string | null = null;
      for (const [, client] of clientEntries) {
        try {
          const entity = await client.getEntity(contact.telegramId).catch(() => null);
          if (entity) {
            avatarUrl = await downloadAndStoreAvatar(client, entity, contact.telegramId);
            break;
          }
        } catch {
          continue;
        }
      }

      if (avatarUrl) {
        await db.update(contacts).set({ avatarUrl }).where(eq(contacts.id, contact.id));
        updated++;
      } else {
        skipped++;
      }

      // Rate limit: small delay
      if ((updated + skipped + errors) % 10 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err: any) {
      errors++;
      if (errors > 50) {
        console.warn(`[BulkAvatars] Too many errors (${errors}), stopping`);
        break;
      }
    }
  }

  console.log(`[BulkAvatars] Done: ${updated} updated, ${skipped} skipped, ${errors} errors`);
  return { updated, skipped, errors };
}
