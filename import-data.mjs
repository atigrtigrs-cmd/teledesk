import fs from 'fs';
import mysql from 'mysql2/promise';

// Map export files to account phones
const EXPORTS = [
  {
    path: '/home/ubuntu/data-exports/export_0313/DataExport_2026-03-13/result.json',
    phone: '79059365077', // Менеджер LeadCash
    label: 'Менеджер LeadCash (+79059365077)',
  },
  {
    path: '/home/ubuntu/data-exports/export_0310/DataExport_2026-03-10/result.json',
    phone: '79059374229', // Irina Koripenko
    label: 'Irina Koripenko (+79059374229)',
  },
  {
    path: '/home/ubuntu/data-exports/export_0310b/DataExport_2026-03-10 (1)/result.json',
    phone: '79231776601', // Ulyana LeadCash
    label: 'Ulyana LeadCash (+79231776601)',
  },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Build a map of existing contacts by telegramId
  const [existingContacts] = await conn.query('SELECT id, telegramId FROM contacts');
  const contactMap = new Map();
  for (const c of existingContacts) {
    contactMap.set(String(c.telegramId), c.id);
  }
  console.log(`Loaded ${contactMap.size} existing contacts`);
  
  // Get existing accounts
  const [existingAccounts] = await conn.query('SELECT id, phone FROM telegram_accounts');
  const accountMap = new Map();
  for (const a of existingAccounts) {
    accountMap.set(a.phone, a.id);
  }
  console.log(`Loaded ${accountMap.size} existing accounts`);
  
  let totalContactsCreated = 0;
  let totalDialogsCreated = 0;
  let totalMessagesImported = 0;
  let totalSkipped = 0;
  
  for (const exp of EXPORTS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${exp.label}`);
    console.log(`${'='.repeat(60)}`);
    
    const data = JSON.parse(fs.readFileSync(exp.path, 'utf-8'));
    const accountPhone = exp.phone;
    
    // Get or create account
    let accountId = accountMap.get(accountPhone);
    if (!accountId) {
      // Create account for Irina (not yet connected)
      const pi = data.personal_information || {};
      const [result] = await conn.query(
        `INSERT INTO telegram_accounts (phone, firstName, lastName, status, createdAt) VALUES (?, ?, ?, 'disconnected', NOW())`,
        [accountPhone, pi.first_name || '', pi.last_name || '']
      );
      accountId = result.insertId;
      accountMap.set(accountPhone, accountId);
      console.log(`  Created account ID ${accountId} for ${accountPhone} (disconnected)`);
    } else {
      console.log(`  Using existing account ID ${accountId}`);
    }
    
    // Get the account's own telegramId from the export
    const ownUserId = data.personal_information?.user_id ? String(data.personal_information.user_id) : null;
    console.log(`  Own user ID: ${ownUserId}`);
    
    // Get existing dialogs for this account
    const [existingDialogs] = await conn.query(
      'SELECT id, contactId FROM dialogs WHERE telegramAccountId = ?',
      [accountId]
    );
    const dialogByContact = new Map();
    for (const d of existingDialogs) {
      dialogByContact.set(d.contactId, d.id);
    }
    
    // Get existing message telegramMessageIds for dedup
    const existingMsgIds = new Set();
    if (existingDialogs.length > 0) {
      const dialogIds = existingDialogs.map(d => d.id);
      const [existingMsgs] = await conn.query(
        `SELECT telegramMessageId, dialogId FROM messages WHERE dialogId IN (${dialogIds.map(() => '?').join(',')})`,
        dialogIds
      );
      for (const m of existingMsgs) {
        existingMsgIds.add(`${m.dialogId}:${m.telegramMessageId}`);
      }
    }
    console.log(`  Existing dialogs: ${existingDialogs.length}, existing messages: ${existingMsgIds.size}`);
    
    // Process only personal chats
    const chats = (data.chats?.list || []).filter(c => c.type === 'personal_chat');
    console.log(`  Personal chats to process: ${chats.length}`);
    
    let expContactsCreated = 0;
    let expDialogsCreated = 0;
    let expMessagesImported = 0;
    let expSkipped = 0;
    
    for (const chat of chats) {
      const chatTelegramId = String(chat.id);
      const messages = chat.messages || [];
      
      if (messages.length === 0) continue;
      
      // Skip self-chats
      if (chatTelegramId === ownUserId) continue;
      
      // Get or create contact
      let contactId = contactMap.get(chatTelegramId);
      if (!contactId) {
        const chatName = chat.name || '';
        const nameParts = chatName.split(' ');
        const firstName = nameParts[0] || '(unknown)';
        const lastName = nameParts.slice(1).join(' ') || null;
        
        const [result] = await conn.query(
          `INSERT INTO contacts (telegramId, firstName, lastName, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())`,
          [chatTelegramId, firstName, lastName]
        );
        contactId = result.insertId;
        contactMap.set(chatTelegramId, contactId);
        expContactsCreated++;
      }
      
      // Get or create dialog
      let dialogId = dialogByContact.get(contactId);
      if (!dialogId) {
        // Find the last message to set lastMessageAt
        const lastMsg = messages[messages.length - 1];
        const lastMsgAt = lastMsg?.date_unixtime 
          ? new Date(parseInt(lastMsg.date_unixtime) * 1000) 
          : new Date();
        
        // Extract last message text
        let lastText = null;
        if (lastMsg) {
          lastText = extractText(lastMsg.text);
        }
        
        const [result] = await conn.query(
          `INSERT INTO dialogs (telegramAccountId, contactId, status, lastMessageAt, lastMessageText, unreadCount, createdAt, updatedAt) 
           VALUES (?, ?, 'open', ?, ?, 0, NOW(), NOW())`,
          [accountId, contactId, lastMsgAt, lastText?.substring(0, 500) || null]
        );
        dialogId = result.insertId;
        dialogByContact.set(contactId, dialogId);
        expDialogsCreated++;
      }
      
      // Import messages in batches
      const BATCH_SIZE = 200;
      const newMessages = [];
      
      for (const msg of messages) {
        if (msg.type !== 'message') continue;
        
        const telegramMsgId = String(msg.id);
        const dedupKey = `${dialogId}:${telegramMsgId}`;
        
        if (existingMsgIds.has(dedupKey)) {
          expSkipped++;
          continue;
        }
        
        // Determine direction
        const fromId = msg.from_id ? msg.from_id.replace('user', '') : '';
        const direction = (fromId === ownUserId) ? 'outgoing' : 'incoming';
        
        // Extract text
        const text = extractText(msg.text);
        
        // Determine media
        let mediaType = null;
        let mediaUrl = null;
        if (msg.photo) {
          mediaType = 'photo';
        } else if (msg.file) {
          if (msg.mime_type?.startsWith('video')) mediaType = 'video';
          else if (msg.mime_type?.startsWith('audio')) mediaType = 'audio';
          else if (msg.media_type === 'voice_message') mediaType = 'voice';
          else if (msg.media_type === 'video_message') mediaType = 'video_note';
          else if (msg.media_type === 'sticker') mediaType = 'sticker';
          else mediaType = 'document';
        } else if (msg.media_type === 'sticker') {
          mediaType = 'sticker';
        }
        
        // Parse date
        const createdAt = msg.date_unixtime 
          ? new Date(parseInt(msg.date_unixtime) * 1000) 
          : new Date(msg.date);
        
        const senderName = msg.from || null;
        
        newMessages.push([
          dialogId,
          telegramMsgId,
          direction,
          fromId || null,
          text || (mediaType ? `[${mediaType}]` : ''),
          mediaUrl,
          mediaType,
          1, // isRead
          createdAt,
          senderName,
        ]);
        
        existingMsgIds.add(dedupKey);
      }
      
      // Batch insert
      for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
        const batch = newMessages.slice(i, i + BATCH_SIZE);
        if (batch.length === 0) continue;
        
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = batch.flat();
        
        await conn.query(
          `INSERT INTO messages (dialogId, telegramMessageId, direction, senderId, text, mediaUrl, mediaType, isRead, createdAt, senderName) 
           VALUES ${placeholders}`,
          values
        );
      }
      
      expMessagesImported += newMessages.length;
      
      // Update dialog lastMessageAt and lastMessageText if we imported messages
      if (newMessages.length > 0) {
        const lastImported = newMessages[newMessages.length - 1];
        await conn.query(
          `UPDATE dialogs SET lastMessageAt = GREATEST(COALESCE(lastMessageAt, '1970-01-01'), ?), 
           lastMessageText = COALESCE(lastMessageText, ?) 
           WHERE id = ?`,
          [lastImported[8], lastImported[4]?.substring(0, 500), dialogId]
        );
      }
    }
    
    console.log(`  Results: +${expContactsCreated} contacts, +${expDialogsCreated} dialogs, +${expMessagesImported} messages, ${expSkipped} skipped (dupes)`);
    totalContactsCreated += expContactsCreated;
    totalDialogsCreated += expDialogsCreated;
    totalMessagesImported += expMessagesImported;
    totalSkipped += expSkipped;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`IMPORT COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`New contacts: ${totalContactsCreated}`);
  console.log(`New dialogs: ${totalDialogsCreated}`);
  console.log(`Messages imported: ${totalMessagesImported}`);
  console.log(`Messages skipped (duplicates): ${totalSkipped}`);
  
  // Final counts
  const [finalCounts] = await conn.query(`
    SELECT 'contacts' as t, COUNT(*) as c FROM contacts
    UNION ALL SELECT 'dialogs', COUNT(*) FROM dialogs
    UNION ALL SELECT 'messages', COUNT(*) FROM messages
  `);
  console.log(`\nFinal DB state:`, JSON.stringify(finalCounts));
  
  await conn.end();
}

function extractText(text) {
  if (!text) return '';
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) {
    return text.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') return part.text || '';
      return '';
    }).join('');
  }
  return '';
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
