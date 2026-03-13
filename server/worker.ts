/**
 * LeadCash Connect — Telegram Sync Worker
 *
 * Runs inside the main Express server process (same IP = no AUTH_KEY_DUPLICATED).
 * Holds all MTProto connections, syncs history, handles real-time messages.
 *
 * COMMUNICATION WITH MAIN SERVER:
 * - Worker writes to DB → main server reads from DB
 * - Worker polls DB every 30s for new accounts (added via QR in main server)
 * - Worker updates account status in DB (active/disconnected)
 */

import "dotenv/config";
import http from "http";
import { TelegramClient } from "telegram";
// processLock removed — using simple startup delay instead
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import type { NewMessageEvent } from "telegram/events/NewMessage.js";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, desc, isNotNull, sql } from "drizzle-orm";
import {
  telegramAccounts,
  dialogs,
  messages,
  contacts,
  bitrixSettings,
} from "../drizzle/schema";

// ─── DB connection ────────────────────────────────────────────────────────────

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("[Worker] DATABASE_URL is not set");
  }
  return drizzle(process.env.DATABASE_URL);
}

const db = getDb();

// Track accounts currently being synced to avoid duplicate syncs
const syncingAccounts = new Set<number>();

// ─── Telegram config ──────────────────────────────────────────────────────────

const TELEGRAM_API_ID = parseInt(process.env.TELEGRAM_API_ID ?? "36272545");
const TELEGRAM_API_HASH =
  process.env.TELEGRAM_API_HASH ?? "c287b0998fac419b776486e511f364fc";

// Map of accountId → TelegramClient
const activeClients = new Map<number, TelegramClient>();

// Set of accountIds currently being connected (prevent parallel attempts)
const connectingAccounts = new Set<number>();

// Cooldown map: accountId → timestamp when cooldown expires (prevents retry spam after AUTH_KEY_DUPLICATED)
const connectionCooldown = new Map<number, number>();

function isInCooldown(accountId: number): boolean {
  const until = connectionCooldown.get(accountId);
  if (!until) return false;
  if (Date.now() >= until) {
    connectionCooldown.delete(accountId);
    return false;
  }
  return true;
}

function setCooldown(accountId: number, durationMs: number): void {
  connectionCooldown.set(accountId, Date.now() + durationMs);
}

// ─── Connect a single account ─────────────────────────────────────────────────

async function connectAccount(
  accountId: number,
  sessionString: string
): Promise<void> {
  if (connectingAccounts.has(accountId)) {
    console.log(`[Worker] Account #${accountId} already connecting, skipping`);
    return;
  }
  if (activeClients.has(accountId)) {
    console.log(`[Worker] Account #${accountId} already connected, skipping`);
    return;
  }

  connectingAccounts.add(accountId);
  let client: TelegramClient | null = null;
  try {
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
      connectionRetries: 3,
      retryDelay: 3000,
      useWSS: true,
      autoReconnect: false, // Disable auto-reconnect during initial connect to prevent AUTH_KEY_DUPLICATED loops
      deviceModel: "LeadCash Connect Worker",
      appVersion: "1.0",
      langCode: "ru",
    });

    console.log(`[Worker] Account #${accountId} connecting...`);
    await client.connect();

    // Enable auto-reconnect only after successful initial connection
    (client as any)._autoReconnect = true;

    // Get account info from Telegram
    let myTelegramId: string | null = null;
    try {
      const me = await client.getMe();
      const meUser = me as any;
      myTelegramId = String(meUser.id ?? "");
      await db
        .update(telegramAccounts)
        .set({
          sessionString: client.session.save() as unknown as string,
          status: "active",
          telegramId: myTelegramId,
          username: meUser.username ?? null,
          firstName: meUser.firstName ?? null,
          lastName: meUser.lastName ?? null,
          phone: meUser.phone ?? null,
          lastError: null,
        })
        .where(eq(telegramAccounts.id, accountId));
      console.log(
        `[Worker] Account #${accountId} (@${meUser.username}) connected successfully`
      );
    } catch (err) {
      console.error(`[Worker] Failed to get account info for #${accountId}:`, err);
    }

    // Register incoming message handler
    client.addEventHandler(
      (event: NewMessageEvent) =>
        handleIncomingMessage(accountId, myTelegramId, event),
      new NewMessage({ incoming: true })
    );

    // Register outgoing message handler (messages sent from Telegram app)
    client.addEventHandler(
      (event: NewMessageEvent) =>
        handleOutgoingMessage(accountId, myTelegramId, event),
      new NewMessage({ outgoing: true })
    );

    activeClients.set(accountId, client);

    // Start history sync in background
    syncingAccounts.add(accountId);
    syncAccountHistory(accountId, client, myTelegramId)
      .catch((err) =>
        console.error(
          `[Worker] History sync failed for account #${accountId}:`,
          err
        )
      )
      .finally(() => syncingAccounts.delete(accountId));
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    console.error(`[Worker] Failed to connect account #${accountId}: ${msg}`);

    // Save error to DB for debugging
    await db
      .update(telegramAccounts)
      .set({ lastError: msg.substring(0, 500) })
      .where(eq(telegramAccounts.id, accountId))
      .catch(() => {});

    if (
      msg.includes("SESSION_REVOKED") ||
      msg.includes("AUTH_KEY_INVALID") ||
      msg.includes("USER_DEACTIVATED")
    ) {
      await db
        .update(telegramAccounts)
        .set({ status: "disconnected" })
        .where(eq(telegramAccounts.id, accountId));
    }

    // FIX #1 (AUTH_KEY_DUPLICATED): old server instance still running.
    // Set cooldown — pollForNewAccounts will retry after cooldown expires.
    // No setTimeout retry — avoids cascading retry loops.
    if (msg.includes("AUTH_KEY_DUPLICATED")) {
      setCooldown(accountId, 120 * 1000);
      console.log(`[Worker] AUTH_KEY_DUPLICATED for account #${accountId} — cooldown set for 120s. pollForNewAccounts will retry after.`);
    }

    // Disconnect the gramjs client to stop its internal reconnect loop
    if (client) {
      try {
        await client.disconnect();
        console.log(`[Worker] Disconnected failed client for account #${accountId}`);
      } catch (disconnectErr) {
        // Ignore disconnect errors
      }
    }

    throw err;
  } finally {
    connectingAccounts.delete(accountId);
  }
}

// ─── Disconnect a single account ──────────────────────────────────────────────

async function disconnectAccount(accountId: number): Promise<void> {
  const client = activeClients.get(accountId);
  if (client) {
    try {
      await client.disconnect();
    } catch {}
    activeClients.delete(accountId);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log(
    `[Worker] Shutting down — disconnecting ${activeClients.size} clients...`
  );
  const ids = Array.from(activeClients.keys());
  await Promise.allSettled(ids.map((id) => disconnectAccount(id)));
  if (ids.length > 0) {
    for (const id of ids) {
      try {
        await db
          .update(telegramAccounts)
          .set({ status: "disconnected" })
          .where(eq(telegramAccounts.id, id));
      } catch {}
    }
  }
  console.log("[Worker] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => {
  console.log("[Worker] SIGTERM received");
  shutdown();
});
process.on("SIGINT", () => {
  console.log("[Worker] SIGINT received");
  shutdown();
});

// ─── Restore all sessions on startup ─────────────────────────────────────────

async function restoreAllSessions(): Promise<void> {
  console.log(
    `[Worker] restoreAllSessions START — uptime: ${Math.round(process.uptime())}s`
  );

  const accounts = await db
    .select()
    .from(telegramAccounts)
    .where(isNotNull(telegramAccounts.sessionString));

  console.log(
    `[Worker] Found ${accounts.length} accounts with session strings`
  );

  for (const acc of accounts) {
    if (!acc.sessionString) continue;
    if (activeClients.has(acc.id)) continue;

    try {
      await connectAccount(acc.id, acc.sessionString);
    } catch (err: any) {
      console.error(
        `[Worker] Failed to restore account #${acc.id}: ${err?.message ?? err}`
      );
    }
  }

  console.log(
    `[Worker] restoreAllSessions DONE — active: [${Array.from(activeClients.keys()).join(", ")}]`
  );
}

// ─── Poll for new accounts (added via QR in main server) ─────────────────────

async function pollForNewAccounts(): Promise<void> {
  try {
    const accounts = await db
      .select()
      .from(telegramAccounts)
      .where(isNotNull(telegramAccounts.sessionString));

    for (const acc of accounts) {
      if (!acc.sessionString) continue;
      if (activeClients.has(acc.id)) continue;
      if (connectingAccounts.has(acc.id)) continue;
      if (isInCooldown(acc.id)) continue; // Skip accounts in AUTH_KEY_DUPLICATED cooldown

      console.log(
        `[Worker] New account detected: #${acc.id} (@${acc.username}) — connecting...`
      );
      connectAccount(acc.id, acc.sessionString).catch((err) =>
        console.error(
          `[Worker] Failed to connect new account #${acc.id}: ${err?.message ?? err}`
        )
      );
    }

    // Also check for accounts that are in activeClients but no longer in DB (deleted)
    for (const [id] of Array.from(activeClients.entries())) {
      const found = accounts.find((a) => a.id === id);
      if (!found) {
        console.log(
          `[Worker] Account #${id} removed from DB — disconnecting...`
        );
        await disconnectAccount(id);
      }
    }
  } catch (err) {
    console.error("[Worker] pollForNewAccounts error:", err);
  }
}

// ─── Keep-alive ping ──────────────────────────────────────────────────────────

async function keepAliveAll(): Promise<void> {
  for (const [accountId, client] of Array.from(activeClients.entries()) as [number, TelegramClient][]) {
    try {
      await client.getMe();
    } catch (err: any) {
      const errMsg = String(err?.message ?? err ?? "");
      console.warn(
        `[Worker] KeepAlive failed for account #${accountId}: ${errMsg}`
      );
      activeClients.delete(accountId);
      await db
        .update(telegramAccounts)
        .set({ status: "disconnected" })
        .where(eq(telegramAccounts.id, accountId));

      // FIX #6: don't reconnect banned/revoked accounts; add delay to avoid tight loop
      if (
        errMsg.includes("SESSION_REVOKED") ||
        errMsg.includes("AUTH_KEY_INVALID") ||
        errMsg.includes("USER_DEACTIVATED") ||
        errMsg.includes("USER_BANNED")
      ) {
        console.warn(`[Worker] Account #${accountId} is permanently disconnected (${errMsg}), skipping reconnect`);
        continue;
      }

      // Try to reconnect after a short delay
      const [acc] = await db
        .select()
        .from(telegramAccounts)
        .where(eq(telegramAccounts.id, accountId))
        .limit(1);
      if (acc?.sessionString) {
        console.log(`[Worker] Scheduling reconnect for account #${accountId} in 30s...`);
        setTimeout(() => {
          if (!activeClients.has(accountId) && !connectingAccounts.has(accountId)) {
            connectAccount(accountId, acc.sessionString!).catch(() => {});
          }
        }, 30 * 1000);
      }
    }
  }
}

// ─── Extract peer info ────────────────────────────────────────────────────────

function extractPeerInfo(
  msg: any
): { peerId: string; peerType: "user" | "group" | "channel" } | null {
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

// ─── Handle incoming message ──────────────────────────────────────────────────

async function handleIncomingMessage(
  accountId: number,
  myTelegramId: string | null,
  event: NewMessageEvent
): Promise<void> {
  try {
    const msg = event.message;
    if (!msg || !msg.peerId) return;

    const peerInfo = extractPeerInfo(msg);
    if (!peerInfo) return;

    const { peerId: senderId, peerType } = peerInfo;

    // Skip channels and supergroups — only handle personal chats and small groups
    if (peerType === "channel") return;

    const text = (msg as any).message ?? "";
    const tgMsgId = String((msg as any).id);
    // FIX #5: use actual message timestamp, not new Date()
    const msgDate = new Date(Number((msg as any).date) * 1000);

    // Get sender entity for name/username
    let sender: any = null;
    try {
      sender =
        (await (
          event.client ?? activeClients.get(accountId)
        )
          ?.getEntity(msg.peerId)
          .catch(() => null)) ?? null;
    } catch {}

    // Upsert contact
    let contactId: number | null = null;
    const existingContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.telegramId, senderId))
      .limit(1);

    if (existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      const name = sender?.firstName ?? sender?.title ?? null;
      const inserted = await db.insert(contacts).values({
        telegramId: senderId,
        username: sender?.username ?? null,
        firstName: name,
        lastName: sender?.lastName ?? null,
        phone: sender?.phone ?? null,
      });
      contactId = Number(
        (inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0
      );
    }

    if (!contactId) return;

    // Find or create dialog
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
      // FIX #3: use SQL atomic increment to avoid race condition on unreadCount
      await db
        .update(dialogs)
        .set({
          status: "open",
          lastMessageText: text.substring(0, 255),
          lastMessageAt: msgDate,
          unreadCount: sql`${dialogs.unreadCount} + 1`,
        })
        .where(eq(dialogs.id, dialogId));
    } else {
      const inserted = await db.insert(dialogs).values({
        telegramAccountId: accountId,
        contactId: contactId,
        status: "open",
        lastMessageText: text.substring(0, 255),
        lastMessageAt: msgDate,
        unreadCount: 1,
      });
      dialogId = Number(
        (inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0
      );

      // Create Bitrix deal for new private chats
      if (peerType === "user" && dialogId) {
        createBitrixDealForDialog(
          dialogId,
          contactId,
          sender,
          text,
          accountId
        ).catch((err) =>
          console.error("[Worker] Failed to create Bitrix deal:", err)
        );
      }
    }

    if (!dialogId) return;

    // Check for duplicate
    const existingMsg = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.dialogId, dialogId),
          eq(messages.telegramMessageId, tgMsgId)
        )
      )
      .limit(1);
    if (existingMsg.length > 0) return;

    // Determine senderName
    const senderName =
      sender?.firstName
        ? `${sender.firstName}${sender.lastName ? " " + sender.lastName : ""}`.trim()
        : sender?.title ?? sender?.username ?? null;

    await db.insert(messages).values({
      dialogId,
      direction: "incoming",
      text: text || null,
      telegramMessageId: tgMsgId,
      senderName,
      createdAt: msgDate,
    });

    console.log(
      `[Worker] Incoming (${peerType}) in dialog #${dialogId}: "${text.substring(0, 50)}"`
    );
  } catch (err) {
    console.error("[Worker] Error handling incoming message:", err);
  }
}

// ─── Handle outgoing message ──────────────────────────────────────────────────

async function handleOutgoingMessage(
  accountId: number,
  myTelegramId: string | null,
  event: NewMessageEvent
): Promise<void> {
  try {
    const msg = event.message;
    if (!msg || !msg.peerId) return;

    const peerInfo = extractPeerInfo(msg);
    if (!peerInfo) return;

    const { peerId: recipientId, peerType: outPeerType } = peerInfo;

    // Skip channels and supergroups
    if (outPeerType === "channel") return;

    const text = (msg as any).message ?? "";
    const tgMsgId = String((msg as any).id);
    const msgDate = new Date(Number((msg as any).date) * 1000);

    // Find or create contact
    let existingContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.telegramId, recipientId))
      .limit(1);

    if (existingContacts.length === 0) {
      let entity: any = null;
      try {
        entity =
          (await activeClients
            .get(accountId)
            ?.getEntity(msg.peerId)
            .catch(() => null)) ?? null;
      } catch {}
      await db.insert(contacts).values({
        telegramId: recipientId,
        username: entity?.username ?? null,
        firstName: entity?.firstName ?? entity?.title ?? null,
        lastName: entity?.lastName ?? null,
        phone: entity?.phone ?? null,
      });
      existingContacts = await db
        .select()
        .from(contacts)
        .where(eq(contacts.telegramId, recipientId))
        .limit(1);
    }

    const contact = existingContacts[0];
    if (!contact) return;

    // Find or create dialog
    const existingDialogs = await db
      .select()
      .from(dialogs)
      .where(
        and(
          eq(dialogs.telegramAccountId, accountId),
          eq(dialogs.contactId, contact.id)
        )
      )
      .orderBy(desc(dialogs.id))
      .limit(1);

    let dialogId: number;
    if (existingDialogs.length === 0) {
      const inserted = await db.insert(dialogs).values({
        telegramAccountId: accountId,
        contactId: contact.id,
        status: "open",
        lastMessageText: text.substring(0, 255),
        lastMessageAt: msgDate,
        unreadCount: 0,
      });
      dialogId = Number((inserted as any)[0]?.insertId ?? 0);
      if (!dialogId) return;
    } else {
      dialogId = existingDialogs[0].id;
    }

    // Check for duplicate
    const existingMsg = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.dialogId, dialogId),
          eq(messages.telegramMessageId, tgMsgId)
        )
      )
      .limit(1);
    if (existingMsg.length > 0) return;

    // Get account name for senderName
    const [accInfo] = await db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.id, accountId))
      .limit(1);
    const senderName = accInfo?.firstName
      ? `${accInfo.firstName}${accInfo.lastName ? " " + accInfo.lastName : ""}`.trim()
      : accInfo?.username ?? null;

    await db.insert(messages).values({
      dialogId,
      direction: "outgoing",
      text: text || null,
      telegramMessageId: tgMsgId,
      senderName,
      createdAt: msgDate,
    });

    await db
      .update(dialogs)
      .set({
        lastMessageText: text.substring(0, 255),
        lastMessageAt: msgDate,
        // FIX #8: reset unreadCount to 0 when we send a message (we've "read" the dialog)
        unreadCount: 0,
      })
      .where(eq(dialogs.id, dialogId));

    console.log(
      `[Worker] Outgoing (from app) in dialog #${dialogId}: "${text.substring(0, 50)}"`
    );
  } catch (err) {
    console.error("[Worker] Error handling outgoing message:", err);
  }
}

// ─── Full history sync for one account ───────────────────────────────────────

async function syncAccountHistory(
  accountId: number,
  client: TelegramClient,
  myTelegramId: string | null
): Promise<void> {
  const [acc] = await db
    .select()
    .from(telegramAccounts)
    .where(eq(telegramAccounts.id, accountId))
    .limit(1);
  const lastSyncAt = acc?.lastSyncAt ?? null;

  await db
    .update(telegramAccounts)
    .set({ syncStatus: "syncing" })
    .where(eq(telegramAccounts.id, accountId));

  console.log(
    `[Worker] Starting history sync for account #${accountId}${lastSyncAt ? ` (gap-fill from ${lastSyncAt.toISOString()})` : " (full sync)"}`
  );

  let syncedCount = 0;

  try {
     // Per official gramjs source (dialogs.ts), getDialogs() internally calls
    // iterDialogs().collect() which handles ALL pagination automatically.
    // Passing limit: undefined fetches ALL dialogs. No manual pagination needed.
    // Also fetch archived dialogs (folder=1) separately and merge.
    console.log(`[Worker] Fetching all dialogs for account #${accountId}...`);
    const regularDialogs = await client.getDialogs({ limit: undefined, ignoreMigrated: true });
    let archivedDialogs: any[] = [];
    try {
      archivedDialogs = await client.getDialogs({ limit: undefined, ignoreMigrated: true, archived: true });
    } catch (e) {
      console.log(`[Worker] Could not fetch archived dialogs:`, e);
    }
    // Merge and deduplicate by entity id
    const seenIds = new Set<string>();
    const allDialogs: any[] = [];
    for (const d of [...regularDialogs, ...archivedDialogs]) {
      const key = String((d as any).entity?.id ?? (d as any).id ?? Math.random());
      if (!seenIds.has(key)) {
        seenIds.add(key);
        allDialogs.push(d);
      }
    }

    console.log(`[Worker] Total dialogs fetched: ${allDialogs.length} (regular: ${regularDialogs.length}, archived: ${archivedDialogs.length})`);

    // Save real total dialog count from Telegram so frontend can show accurate progress
    await db
      .update(telegramAccounts)
      .set({ totalTgDialogs: allDialogs.length })
      .where(eq(telegramAccounts.id, accountId));

    const gapFillFromTs = lastSyncAt
      ? Math.floor(lastSyncAt.getTime() / 1000)
      : 0;

    // FIX #4: cache account info outside the per-dialog loop to avoid N DB queries
    const [myAccInfo] = await db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.id, accountId))
      .limit(1);
    const myDisplayName = myAccInfo?.firstName
      ? `${myAccInfo.firstName}${myAccInfo.lastName ? " " + myAccInfo.lastName : ""}`.trim()
      : myAccInfo?.username ?? null;

    for (const tgDialog of allDialogs) {
      try {
        const entity = tgDialog.entity as any;
        if (!entity) continue;

        let contactTelegramId: string;
        let contactName: string;

        if (entity.className === "User") {
          if (entity.bot) continue;
          contactTelegramId = String(entity.id);
          contactName =
            `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim() ||
            entity.username ||
            `User ${entity.id}`;
        } else if (entity.className === "Chat") {
          // Skip groups with more than 20 participants
          const memberCount = entity.participantsCount ?? 0;
          if (memberCount > 20) continue;
          contactTelegramId = `group_${entity.id}`;
          contactName = entity.title ?? `Group ${entity.id}`;
        } else if (entity.className === "Channel") {
          // Skip all channels (news channels, supergroups) — only personal chats and small groups needed
          continue;
        } else {
          continue;
        }

        // Upsert contact
        let contactId: number;
        const existingContacts = await db
          .select()
          .from(contacts)
          .where(eq(contacts.telegramId, contactTelegramId))
          .limit(1);

        if (existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          await db
            .update(contacts)
            .set({
              username: entity.username ?? existingContacts[0].username,
              firstName:
                entity.firstName ??
                entity.title ??
                existingContacts[0].firstName,
              lastName: entity.lastName ?? existingContacts[0].lastName,
              phone: entity.phone ?? existingContacts[0].phone,
            })
            .where(eq(contacts.id, contactId));
        } else {
          const inserted = await db.insert(contacts).values({
            telegramId: contactTelegramId,
            username: entity.username ?? null,
            firstName: entity.firstName ?? entity.title ?? null,
            lastName: entity.lastName ?? null,
            phone: entity.phone ?? null,
          });
          contactId = Number((inserted as any)[0]?.insertId ?? 0);
          if (!contactId) continue;
        }

        // Find or create dialog
        let dialogId: number;
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

        // Fetch messages
        let msgOffsetId = 0;
        let hasMore = true;
        let lastMsgText: string | null = null;
        let lastMsgAt: Date | null = null;

        while (hasMore) {
          const batch = await client.getMessages(entity, {
            limit: 100,
            offsetId: msgOffsetId,
          });

          if (!batch || batch.length === 0) break;

          // FIX #2: track whether we should stop AFTER processing the batch,
          // not mid-batch (so we still update offsetId correctly)
          let shouldStopAfterBatch = false;
          let lastProcessedId = 0;

          for (const msg of batch) {
            const msgAny = msg as any;
            if (!msgAny.id) continue;

            const msgDateTs = Number(msgAny.date ?? 0);
            lastProcessedId = msgAny.id;

            // BUG-8 FIX: messages in a batch are ordered newest→oldest, so once we hit
            // a message older than the cutoff, ALL subsequent ones are also older — break immediately
            if (gapFillFromTs > 0 && msgDateTs < gapFillFromTs) {
              shouldStopAfterBatch = true;
              break; // no need to iterate the rest of the batch
            }

            const tgMsgId = String(msgAny.id);
            const text = msgAny.message ?? msgAny.caption ?? "";
            const msgDate = new Date(msgDateTs * 1000);

            let isOutgoing: boolean;
            if (myTelegramId) {
              isOutgoing =
                msgAny.out === true ||
                String(msgAny.fromId?.userId ?? "") === myTelegramId;
            } else {
              isOutgoing = msgAny.out === true;
            }

            if (!text && !msgAny.media) continue;

            const existing = await db
              .select({ id: messages.id })
              .from(messages)
              .where(
                and(
                  eq(messages.dialogId, dialogId),
                  eq(messages.telegramMessageId, tgMsgId)
                )
              )
              .limit(1);
            if (existing.length > 0) continue;

            // FIX #4: use cached account name instead of querying DB per message
            const senderName = isOutgoing ? myDisplayName : contactName;

            await db.insert(messages).values({
              dialogId,
              direction: isOutgoing ? "outgoing" : "incoming",
              text: text || null,
              telegramMessageId: tgMsgId,
              senderName,
              createdAt: msgDate,
            });

            if (!lastMsgAt || msgDate > lastMsgAt) {
              lastMsgAt = msgDate;
              lastMsgText = text || null;
            }
          }

          // FIX #2: correct loop termination logic
          if (shouldStopAfterBatch && gapFillFromTs > 0) {
            hasMore = false;
          } else if (batch.length < 100) {
            hasMore = false;
          } else {
            msgOffsetId = lastProcessedId;
          }
        }

        // Always update lastMessageAt/lastMessageText from DB
        if (lastMsgAt) {
          await db
            .update(dialogs)
            .set({
              lastMessageText: lastMsgText?.substring(0, 255) ?? null,
              lastMessageAt: lastMsgAt,
            })
            .where(eq(dialogs.id, dialogId));
        } else {
          // No new messages inserted — update from existing messages in DB
          const [latestMsg] = await db
            .select({ createdAt: messages.createdAt, text: messages.text })
            .from(messages)
            .where(eq(messages.dialogId, dialogId))
            .orderBy(desc(messages.createdAt))
            .limit(1);
          if (latestMsg) {
            await db
              .update(dialogs)
              .set({
                lastMessageText: latestMsg.text?.substring(0, 255) ?? null,
                lastMessageAt: latestMsg.createdAt,
              })
              .where(eq(dialogs.id, dialogId));
          }
        }

        syncedCount++;
        console.log(
          `[Worker] Synced dialog with ${contactName} (${contactTelegramId}), dialogId=#${dialogId}`
        );

        // BUG-7 FIX: update syncedDialogs incrementally every 100 dialogs so progress
        // is visible in UI and not lost if sync crashes mid-way
        if (syncedCount % 100 === 0) {
          await db
            .update(telegramAccounts)
            .set({ syncedDialogs: syncedCount })
            .where(eq(telegramAccounts.id, accountId))
            .catch(() => {});
        }

        await new Promise((r) => setTimeout(r, 50));
      } catch (err: any) {
        const errMsg = String(err?.message ?? err ?? "");
        // AUTH_KEY_DUPLICATED means old server instance is still alive — abort sync entirely
        if (errMsg.includes("AUTH_KEY_DUPLICATED")) {
          console.log(`[Worker] AUTH_KEY_DUPLICATED during sync for account #${accountId} — aborting sync, will retry after reconnect`);
          await db
            .update(telegramAccounts)
            .set({ syncStatus: "idle", lastError: "AUTH_KEY_DUPLICATED — retrying after reconnect" })
            .where(eq(telegramAccounts.id, accountId));
          // Disconnect and reschedule reconnect after 120s
          activeClients.delete(accountId);
          setTimeout(async () => {
            const [acc] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, accountId)).limit(1).catch(() => [null as any]);
            if (acc?.sessionString && !activeClients.has(accountId)) {
              connectAccount(accountId, acc.sessionString).catch(() => {});
            }
          }, 120 * 1000);
          return;
        }
        console.error(`[Worker] Error syncing dialog:`, err);
      }
    }

    await db
      .update(telegramAccounts)
      .set({
        syncStatus: "done",
        lastSyncAt: new Date(),
        syncedDialogs: syncedCount,
      })
      .where(eq(telegramAccounts.id, accountId));

    console.log(
      `[Worker] Sync complete for account #${accountId}: ${syncedCount} dialogs`
    );
  } catch (err: any) {
    const errMsg = String(err?.message ?? err ?? "");
    console.error(`[Worker] Fatal sync error for account #${accountId}:`, err);
    // AUTH_KEY_DUPLICATED at top level — reschedule
    if (errMsg.includes("AUTH_KEY_DUPLICATED")) {
      await db
        .update(telegramAccounts)
        .set({ syncStatus: "idle", lastError: "AUTH_KEY_DUPLICATED — retrying after reconnect" })
        .where(eq(telegramAccounts.id, accountId));
      return;
    }
    await db
      .update(telegramAccounts)
      .set({ syncStatus: "error", lastError: errMsg.substring(0, 500) })
      .where(eq(telegramAccounts.id, accountId));
  }
}

// ─── Bitrix24 deal creation ───────────────────────────────────────────────────

async function createBitrixDealForDialog(
  dialogId: number,
  contactId: number,
  sender: any,
  firstMessage: string,
  accountId: number
): Promise<void> {
  const settings = await db.select().from(bitrixSettings).limit(1);
  const webhookUrl = settings[0]?.webhookUrl ?? null;
  if (!webhookUrl) return;

  const acct = await db
    .select()
    .from(telegramAccounts)
    .where(eq(telegramAccounts.id, accountId))
    .limit(1);
  const pipelineId = acct[0]?.bitrixPipelineId ?? null;
  const stageId = acct[0]?.bitrixStageId ?? null;
  const responsibleId = acct[0]?.bitrixResponsibleId ?? null;

  try {
    const dealParams: Record<string, any> = {
      TITLE: `Telegram: ${sender?.firstName ?? ""} ${sender?.lastName ?? ""} @${sender?.username ?? ""}`.trim(),
      COMMENTS: `Первое сообщение: ${firstMessage}`,
    };
    if (pipelineId) dealParams.CATEGORY_ID = pipelineId;
    if (stageId) dealParams.STAGE_ID = stageId;
    if (responsibleId) dealParams.ASSIGNED_BY_ID = responsibleId;

    const res = await fetch(`${webhookUrl}crm.deal.add.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: dealParams }),
    });
    const data = (await res.json()) as any;
    const dealId = data?.result ?? null;

    if (dealId) {
      await db
        .update(dialogs)
        .set({ bitrixDealId: String(dealId) })
        .where(eq(dialogs.id, dialogId));
    }
  } catch (err) {
    console.error("[Worker] Bitrix deal creation failed:", err);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[Worker] Starting Telegram Sync Worker...");
  console.log(`[Worker] PID: ${process.pid}`);
  console.log(`[Worker] NODE_ENV: ${process.env.NODE_ENV}`);

  // Simple startup delay: wait 60s for old Render instance to fully die.
  // Distributed lock approach caused deadlocks because Render kills the new instance
  // if it doesn't respond to health checks while waiting for the lock.
  const STARTUP_DELAY_MS = 60 * 1000;
  console.log(`[Worker] Waiting ${STARTUP_DELAY_MS / 1000}s for old instance to die before connecting to Telegram...`);
  await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));
  console.log("[Worker] Startup delay complete — safe to connect Telegram sessions.");

  // Initial session restore
  await restoreAllSessions();

  // Poll for new accounts every 30 seconds
  setInterval(() => {
    pollForNewAccounts().catch((err) =>
      console.error("[Worker] Poll error:", err)
    );
  }, 30 * 1000);

  // Keep-alive ping every 3 minutes
  setInterval(() => {
    keepAliveAll().catch((err) =>
      console.error("[Worker] KeepAlive error:", err)
    );
  }, 3 * 60 * 1000);

  // FIX #7: Watchdog reconnect skips banned/revoked accounts
  setInterval(async () => {
    console.log("[Worker] Watchdog: checking connections...");
    const accounts = await db
      .select()
      .from(telegramAccounts)
      .where(isNotNull(telegramAccounts.sessionString))
      .catch(() => []);

    for (const acc of accounts) {
      if (!acc.sessionString) continue;
      if (activeClients.has(acc.id)) continue;
      if (connectingAccounts.has(acc.id)) continue;
      if (isInCooldown(acc.id)) continue; // Skip accounts in AUTH_KEY_DUPLICATED cooldown
      // FIX #7: don't try to reconnect permanently disconnected accounts
      if (acc.status === "banned") continue;
      // Don't reconnect if last error was permanent
      const lastErr = acc.lastError ?? "";
      if (
        lastErr.includes("SESSION_REVOKED") ||
        lastErr.includes("AUTH_KEY_INVALID") ||
        lastErr.includes("USER_DEACTIVATED")
      ) continue;

      console.log(
        `[Worker] Watchdog: reconnecting account #${acc.id} (@${acc.username})...`
      );
      connectAccount(acc.id, acc.sessionString).catch((err) =>
        console.error(
          `[Worker] Watchdog reconnect failed for #${acc.id}: ${err?.message ?? err}`
        )
      );
    }
  }, 5 * 60 * 1000);

  // Sync watchdog: check for accounts with syncStatus='idle' or lastSyncAt=null every 2 minutes
  setInterval(async () => {
    const accounts = await db
      .select()
      .from(telegramAccounts)
      .where(isNotNull(telegramAccounts.sessionString))
      .catch(() => []);

    for (const acc of accounts) {
      if (!acc.sessionString) continue;
      if (!activeClients.has(acc.id)) continue; // must be connected
      if (syncingAccounts.has(acc.id)) continue; // already syncing
      if (acc.syncStatus === "syncing") continue; // already syncing in DB

      const needsSync = acc.syncStatus === "idle" || acc.lastSyncAt === null;
      if (!needsSync) continue;

      console.log(
        `[Worker] Sync watchdog: triggering sync for account #${acc.id} (@${acc.username}), syncStatus=${acc.syncStatus}`
      );
      const client = activeClients.get(acc.id)!;
      syncingAccounts.add(acc.id);
      syncAccountHistory(acc.id, client, acc.telegramId ?? null)
        .catch((err) =>
          console.error(`[Worker] Sync watchdog error for #${acc.id}: ${err?.message ?? err}`)
        )
        .finally(() => syncingAccounts.delete(acc.id));
    }
  }, 2 * 60 * 1000);

  console.log("[Worker] All intervals started. Worker is running.");

  // Minimal HTTP server for health checks and force-sync trigger
  const port = parseInt(process.env.WORKER_PORT ?? "3001");
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        activeClients: Array.from(activeClients.keys()),
        syncingAccounts: Array.from(syncingAccounts),
      }));
      return;
    }
    if (req.method === "POST" && req.url === "/force-sync") {
      const accounts = await db.select().from(telegramAccounts).where(isNotNull(telegramAccounts.sessionString)).catch(() => []);
      let triggered = 0;
      for (const acc of accounts) {
        if (!acc.sessionString) continue;
        if (!activeClients.has(acc.id)) continue;
        if (syncingAccounts.has(acc.id)) continue;
        const client = activeClients.get(acc.id)!;
        syncingAccounts.add(acc.id);
        syncAccountHistory(acc.id, client, acc.telegramId ?? null)
          .catch(err => console.error(`[Worker] Force-sync error for #${acc.id}:`, err))
          .finally(() => syncingAccounts.delete(acc.id));
        triggered++;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ triggered }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  httpServer.listen(port, () => {
    console.log(`[Worker] HTTP server listening on port ${port}`);
  });
}

// Export for in-process usage from main server
export async function startWorker(): Promise<void> {
  return main();
}

// Only auto-start when run directly as a standalone worker process
if (process.env.RUN_WORKER_STANDALONE === "true") {
  main().catch((err) => {
    console.error("[Worker] Fatal error:", err);
    process.exit(1);
  });
}
