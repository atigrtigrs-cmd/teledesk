/**
 * Import Telegram Desktop exports (result.json) into TeleDesk database.
 * 
 * Mapping:
 *   DataExport_2026-03-13 → +79059365077 (Менеджер LeadCash, accountId 210003)
 *   DataExport_2026-03-10(1) → +79231776601 (Ulyana LeadCash, accountId 210004)
 *   DataExport_2026-03-10 → +79059374229 (Irina Koripenko, create new account)
 */

import fs from "fs";
import mysql from "mysql2/promise";

const EXPORTS = [
  {
    file: "/tmp/tg-study/DataExport_2026-03-13/result.json",
    accountId: 210003,
    phone: "79059365077",
    label: "Менеджер LeadCash",
  },
  {
    file: "/tmp/tg-study/DataExport_2026-03-10 (1)/result.json",
    accountId: 210004,
    phone: "79231776601",
    label: "Ulyana LeadCash",
  },
  {
    file: "/tmp/tg-study/DataExport_2026-03-10/result.json",
    accountId: null, // will be created
    phone: "79059374229",
    label: "Irina Koripenko",
  },
];

// Chat types we want to import
const IMPORTABLE_TYPES = new Set([
  "personal_chat",
  "private_supergroup",
  "private_group",
  "bot_chat",
  "private_channel",
  "saved_messages",
]);

function extractText(text) {
  if (text === null || text === undefined) return "";
  if (typeof text === "string") return text;
  if (Array.isArray(text)) {
    return text
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && part.text) return part.text;
        return "";
      })
      .join("");
  }
  return String(text);
}

function extractSenderId(fromId) {
  if (!fromId) return null;
  // Format: "user7480546401" → "7480546401"
  if (typeof fromId === "string" && fromId.startsWith("user")) {
    return fromId.slice(4);
  }
  // Format: "channel1234567" → "channel_1234567"
  if (typeof fromId === "string" && fromId.startsWith("channel")) {
    return "channel_" + fromId.slice(7);
  }
  return String(fromId);
}

function chatTypeToContactPrefix(chatType, chatId) {
  switch (chatType) {
    case "personal_chat":
    case "bot_chat":
    case "saved_messages":
      return String(chatId);
    case "private_supergroup":
    case "public_supergroup":
      return `channel_${chatId}`;
    case "private_group":
      return `group_${chatId}`;
    case "private_channel":
      return `channel_${chatId}`;
    default:
      return String(chatId);
  }
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Stats
  const stats = {
    totalChats: 0,
    importedChats: 0,
    skippedChats: 0,
    totalMessages: 0,
    importedMessages: 0,
    duplicateMessages: 0,
    newContacts: 0,
    existingContacts: 0,
    newDialogs: 0,
    existingDialogs: 0,
    errors: 0,
  };

  for (const exp of EXPORTS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing: ${exp.label} (${exp.phone})`);
    console.log(`File: ${exp.file}`);
    console.log(`${"=".repeat(60)}`);

    const raw = fs.readFileSync(exp.file, "utf-8");
    const data = JSON.parse(raw);
    const ownerTelegramId = String(data.personal_information.user_id);
    const chatList = data.chats?.list ?? [];

    console.log(`Owner Telegram ID: ${ownerTelegramId}`);
    console.log(`Total chats in export: ${chatList.length}`);

    // Create account for Irina if needed
    let accountId = exp.accountId;
    if (!accountId) {
      // Check if account already exists
      const [existing] = await conn.query(
        "SELECT id FROM telegram_accounts WHERE phone = ?",
        [exp.phone]
      );
      if (existing.length > 0) {
        accountId = existing[0].id;
        console.log(`Found existing account: ${accountId}`);
      } else {
        const [result] = await conn.query(
          `INSERT INTO telegram_accounts (ownerId, phone, firstName, lastName, telegramId, status, syncStatus) 
           VALUES (?, ?, ?, ?, ?, 'disconnected', 'idle')`,
          [90001, exp.phone, data.personal_information.first_name, data.personal_information.last_name || null, ownerTelegramId]
        );
        accountId = result.insertId;
        console.log(`Created new account: ${accountId}`);
      }
    }

    // Process each chat
    for (const chat of chatList) {
      stats.totalChats++;
      const chatType = chat.type;
      const chatId = chat.id;
      const chatName = chat.name || `${chatType}_${chatId}`;
      const chatMessages = chat.messages || [];

      // Skip empty chats and non-importable types
      if (!IMPORTABLE_TYPES.has(chatType)) {
        stats.skippedChats++;
        continue;
      }
      if (chatMessages.length === 0) {
        stats.skippedChats++;
        continue;
      }

      // Only count actual messages (not service messages)
      const realMessages = chatMessages.filter((m) => m.type === "message");
      if (realMessages.length === 0) {
        stats.skippedChats++;
        continue;
      }

      stats.importedChats++;

      // Determine contact telegramId
      const contactTelegramId = chatTypeToContactPrefix(chatType, chatId);

      // Find or create contact
      let contactId;
      const [existingContacts] = await conn.query(
        "SELECT id FROM contacts WHERE telegramId = ? LIMIT 1",
        [contactTelegramId]
      );
      if (existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        stats.existingContacts++;
      } else {
        const firstName = chatName || null;
        const [result] = await conn.query(
          "INSERT INTO contacts (telegramId, firstName) VALUES (?, ?)",
          [contactTelegramId, firstName]
        );
        contactId = result.insertId;
        stats.newContacts++;
      }

      // Find or create dialog (unique per account + contact)
      let dialogId;
      const [existingDialogs] = await conn.query(
        "SELECT id FROM dialogs WHERE telegramAccountId = ? AND contactId = ? LIMIT 1",
        [accountId, contactId]
      );
      if (existingDialogs.length > 0) {
        dialogId = existingDialogs[0].id;
        stats.existingDialogs++;
      } else {
        const [result] = await conn.query(
          `INSERT INTO dialogs (telegramAccountId, contactId, status, unreadCount) 
           VALUES (?, ?, 'open', 0)`,
          [accountId, contactId]
        );
        dialogId = result.insertId;
        stats.newDialogs++;
      }

      // Batch insert messages
      let lastMsgAt = null;
      let lastMsgText = null;
      let batchValues = [];
      let batchCount = 0;

      for (const msg of realMessages) {
        stats.totalMessages++;
        const tgMsgId = String(msg.id);
        const text = extractText(msg.text);
        const dateUnix = parseInt(msg.date_unixtime, 10);
        const msgDate = new Date(dateUnix * 1000);
        const fromId = msg.from_id;
        const senderId = extractSenderId(fromId);
        const senderName = msg.from || null;

        // Determine direction
        const isOutgoing =
          senderId === ownerTelegramId ||
          (fromId && fromId === `user${ownerTelegramId}`);

        // Skip messages with no text
        if (!text && !msg.photo && !msg.file) continue;

        batchValues.push([
          dialogId,
          tgMsgId,
          isOutgoing ? "outgoing" : "incoming",
          senderId,
          text || null,
          null, // mediaUrl
          null, // mediaType
          senderName ? senderName.substring(0, 255) : null,
          0, // isRead
          msgDate,
        ]);
        batchCount++;

        if (!lastMsgAt || msgDate > lastMsgAt) {
          lastMsgAt = msgDate;
          lastMsgText = text || null;
        }

        // Flush batch every 500 rows
        if (batchValues.length >= 500) {
          const inserted = await insertBatch(conn, batchValues, stats);
          batchValues = [];
        }
      }

      // Flush remaining
      if (batchValues.length > 0) {
        await insertBatch(conn, batchValues, stats);
      }

      // Update dialog's last message
      if (lastMsgAt) {
        await conn.query(
          `UPDATE dialogs SET lastMessageText = ?, lastMessageAt = ? 
           WHERE id = ? AND (lastMessageAt IS NULL OR lastMessageAt < ?)`,
          [
            lastMsgText ? lastMsgText.substring(0, 255) : null,
            lastMsgAt,
            dialogId,
            lastMsgAt,
          ]
        );
      }
    }

    console.log(`\nAccount ${exp.label} done.`);
  }

  // Print final stats
  console.log(`\n${"=".repeat(60)}`);
  console.log("IMPORT COMPLETE");
  console.log(`${"=".repeat(60)}`);
  console.log(`Total chats processed: ${stats.totalChats}`);
  console.log(`Imported chats: ${stats.importedChats}`);
  console.log(`Skipped chats: ${stats.skippedChats}`);
  console.log(`Total messages: ${stats.totalMessages}`);
  console.log(`Imported messages: ${stats.importedMessages}`);
  console.log(`Duplicate messages (skipped): ${stats.duplicateMessages}`);
  console.log(`New contacts: ${stats.newContacts}`);
  console.log(`Existing contacts: ${stats.existingContacts}`);
  console.log(`New dialogs: ${stats.newDialogs}`);
  console.log(`Existing dialogs: ${stats.existingDialogs}`);
  console.log(`Errors: ${stats.errors}`);

  // Final counts
  const [mc] = await conn.query("SELECT COUNT(*) as c FROM messages");
  const [dc] = await conn.query("SELECT COUNT(*) as c FROM dialogs");
  const [cc] = await conn.query("SELECT COUNT(*) as c FROM contacts");
  console.log(`\nFinal DB counts:`);
  console.log(`  Messages: ${mc[0].c}`);
  console.log(`  Dialogs: ${dc[0].c}`);
  console.log(`  Contacts: ${cc[0].c}`);

  await conn.end();
}

async function insertBatch(conn, batchValues, stats) {
  // Use INSERT IGNORE to skip duplicates (dialogId + telegramMessageId)
  // TiDB doesn't have a unique constraint on (dialogId, telegramMessageId) so we check manually
  
  // For efficiency, check existing telegramMessageIds for this dialog in bulk
  const dialogId = batchValues[0][0];
  const tgMsgIds = batchValues.map((v) => v[1]);
  
  let existingIds = new Set();
  if (tgMsgIds.length > 0) {
    // Check in chunks of 500
    const [existing] = await conn.query(
      `SELECT telegramMessageId FROM messages WHERE dialogId = ? AND telegramMessageId IN (?)`,
      [dialogId, tgMsgIds]
    );
    existingIds = new Set(existing.map((r) => r.telegramMessageId));
  }

  // Filter out duplicates
  const newValues = batchValues.filter((v) => !existingIds.has(v[1]));
  stats.duplicateMessages += batchValues.length - newValues.length;

  if (newValues.length === 0) return;

  // Batch insert
  const placeholders = newValues
    .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .join(", ");
  const flatValues = newValues.flat();

  try {
    await conn.query(
      `INSERT INTO messages (dialogId, telegramMessageId, direction, senderId, text, mediaUrl, mediaType, senderName, isRead, createdAt) 
       VALUES ${placeholders}`,
      flatValues
    );
    stats.importedMessages += newValues.length;
  } catch (err) {
    console.error(`Batch insert error: ${err.message}`);
    // Fallback: insert one by one
    for (const values of newValues) {
      try {
        await conn.query(
          `INSERT INTO messages (dialogId, telegramMessageId, direction, senderId, text, mediaUrl, mediaType, senderName, isRead, createdAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values
        );
        stats.importedMessages++;
      } catch (err2) {
        stats.errors++;
        if (stats.errors <= 10) {
          console.error(`Single insert error: ${err2.message} (tgMsgId=${values[1]})`);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
