/**
 * Re-import Telegram JSON exports with senderName field.
 * Usage: DATABASE_URL=... OWNER_TG_ID=... ACCOUNT_ID=... EXPORT_PATH=... node import_with_names.mjs
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DB_URL = process.env.DATABASE_URL;
const OWNER_TG_ID = process.env.OWNER_TG_ID; // e.g. "7966871800"
const ACCOUNT_ID = parseInt(process.env.ACCOUNT_ID, 10);
const EXPORT_PATH = process.env.EXPORT_PATH;

if (!DB_URL || !OWNER_TG_ID || !ACCOUNT_ID || !EXPORT_PATH) {
  console.error('Missing env vars: DATABASE_URL, OWNER_TG_ID, ACCOUNT_ID, EXPORT_PATH');
  process.exit(1);
}

const url = new URL(DB_URL.replace('mysql://', 'http://'));
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1).split('?')[0],
  ssl: { rejectUnauthorized: true },
});

const data = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));
const chats = data.chats?.list || [];

// Filter: personal_chat and group only (no supergroups/channels)
const allowed = ['personal_chat', 'private_group', 'private_supergroup'];
const filtered = chats.filter(c => {
  if (c.type === 'personal_chat') return true;
  if (c.type === 'private_group') return true;
  // skip saved_messages, bot_chat, channel, public_supergroup
  return false;
});

console.log(`Processing ${filtered.length} chats (of ${chats.length} total)...`);

let totalMessages = 0;
let totalDialogs = 0;
let skipped = 0;

for (const chat of filtered) {
  const isGroup = chat.type === 'private_group';
  const chatName = chat.name || 'Unknown';
  const chatTgId = String(chat.id || '');
  const messages = (chat.messages || []).filter(m => m.type === 'message');
  if (!messages.length) continue;

  // Upsert contact
  const [existingContact] = await conn.execute(
    'SELECT id FROM contacts WHERE telegramId = ? LIMIT 1',
    [chatTgId]
  );
  let contactId;
  if (existingContact.length > 0) {
    contactId = existingContact[0].id;
    // Update name if needed
    if (isGroup) {
      await conn.execute('UPDATE contacts SET firstName = ? WHERE id = ?', [chatName, contactId]);
    }
  } else {
    let firstName = chatName, lastName = null, username = null;
    if (!isGroup && chat.name) {
      const parts = chat.name.split(' ');
      firstName = parts[0] || chatName;
      lastName = parts.slice(1).join(' ') || null;
    }
    const [res] = await conn.execute(
      'INSERT INTO contacts (telegramId, firstName, lastName, username, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [chatTgId, firstName, lastName, username]
    );
    contactId = res.insertId;
  }

  // Upsert dialog
  const [existingDialog] = await conn.execute(
    'SELECT id FROM dialogs WHERE telegramAccountId = ? AND contactId = ? LIMIT 1',
    [ACCOUNT_ID, contactId]
  );
  let dialogId;
  if (existingDialog.length > 0) {
    dialogId = existingDialog[0].id;
  } else {
    const [res] = await conn.execute(
      'INSERT INTO dialogs (telegramAccountId, contactId, status, unreadCount, createdAt, updatedAt) VALUES (?, ?, "open", 0, NOW(), NOW())',
      [ACCOUNT_ID, contactId]
    );
    dialogId = res.insertId;
    totalDialogs++;
  }

  // Insert messages
  let msgCount = 0;
  for (const msg of messages) {
    if (!msg.id) continue;
    const tgMsgId = String(msg.id);

    // Check duplicate
    const [dup] = await conn.execute(
      'SELECT id FROM messages WHERE dialogId = ? AND telegramMessageId = ? LIMIT 1',
      [dialogId, tgMsgId]
    );
    if (dup.length > 0) { skipped++; continue; }

    // Determine direction
    const fromId = msg.from_id || '';
    const isOutgoing = fromId === `user${OWNER_TG_ID}`;
    const direction = isOutgoing ? 'outgoing' : 'incoming';

    // Sender name
    let senderName = null;
    if (!isOutgoing) {
      senderName = msg.from || chatName;
    } else {
      senderName = data.personal_information?.first_name || null;
    }

    // Text
    let text = null;
    if (typeof msg.text === 'string') {
      text = msg.text;
    } else if (Array.isArray(msg.text)) {
      text = msg.text.map(t => (typeof t === 'string' ? t : t.text || '')).join('');
    }

    const createdAt = msg.date ? new Date(msg.date) : new Date();

    await conn.execute(
      'INSERT INTO messages (dialogId, telegramMessageId, direction, senderName, text, isRead, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [dialogId, tgMsgId, direction, senderName, text, createdAt]
    );
    msgCount++;
    totalMessages++;
  }

  // Update dialog lastMessageAt
  if (msgCount > 0) {
    const lastMsg = messages[messages.length - 1];
    const lastDate = lastMsg.date ? new Date(lastMsg.date) : new Date();
    const lastText = typeof lastMsg.text === 'string' ? lastMsg.text :
      (Array.isArray(lastMsg.text) ? lastMsg.text.map(t => typeof t === 'string' ? t : t.text || '').join('') : null);
    await conn.execute(
      'UPDATE dialogs SET lastMessageAt = ?, lastMessageText = ? WHERE id = ?',
      [lastDate, lastText?.slice(0, 500) || null, dialogId]
    );
  }
}

await conn.end();
console.log(`Done! Dialogs: ${totalDialogs}, Messages: ${totalMessages}, Skipped duplicates: ${skipped}`);
