import 'dotenv/config';
import mysql from 'mysql2/promise';

const BOT_TOKEN = process.env.LEADCASH_BOT_TOKEN;
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

async function storagePut(relKey, data, contentType) {
  const baseUrl = FORGE_URL.replace(/\/+$/, '') + '/';
  const url = new URL('v1/storage/upload', baseUrl);
  url.searchParams.set('path', relKey);
  const blob = new Blob([data], { type: contentType });
  const form = new FormData();
  form.append('file', blob, relKey.split('/').pop());
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FORGE_KEY}` },
    body: form,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.url;
}

async function downloadAvatar(telegramId) {
  try {
    if (telegramId.startsWith('group_') || telegramId.startsWith('channel_')) return null;
    
    const photosRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${telegramId}&limit=1`);
    const photosData = await photosRes.json();
    if (!photosData.ok || !photosData.result?.total_count) return null;
    
    const photoSizes = photosData.result.photos[0];
    if (!photoSizes?.length) return null;
    const targetPhoto = photoSizes.length >= 2 ? photoSizes[1] : photoSizes[photoSizes.length - 1];
    
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetPhoto.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;
    
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) return null;
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    if (buffer.length < 100) return null;
    
    const url = await storagePut(`avatars/${telegramId}.jpg`, buffer, 'image/jpeg');
    return url;
  } catch {
    return null;
  }
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [rows] = await conn.execute(
    "SELECT id, telegramId, firstName FROM contacts WHERE (avatarUrl IS NULL OR avatarUrl = '') AND telegramId NOT LIKE 'group_%' AND telegramId NOT LIKE 'channel_%' LIMIT 200"
  );
  
  console.log(`Processing ${rows.length} contacts...`);
  let updated = 0, skipped = 0, errors = 0;
  const start = Date.now();
  
  // Process in batches of 5
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (row) => {
      const url = await downloadAvatar(row.telegramId);
      if (url) {
        await conn.execute('UPDATE contacts SET avatarUrl = ? WHERE id = ?', [url, row.id]);
        return 'updated';
      }
      return 'skipped';
    }));
    
    results.forEach(r => r === 'updated' ? updated++ : skipped++);
    
    if ((i + 5) % 50 === 0) {
      console.log(`Progress: ${Math.min(i + 5, rows.length)}/${rows.length} (updated: ${updated}, skipped: ${skipped})`);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s: ${updated} updated, ${skipped} skipped, ${errors} errors`);
  console.log(`Success rate: ${((updated / rows.length) * 100).toFixed(1)}%`);
  
  // Check total avatar count
  const [total] = await conn.execute("SELECT COUNT(*) as cnt FROM contacts WHERE avatarUrl IS NOT NULL AND avatarUrl != ''");
  console.log(`Total contacts with avatars: ${total[0].cnt}`);
  
  await conn.end();
}

main().catch(console.error);
