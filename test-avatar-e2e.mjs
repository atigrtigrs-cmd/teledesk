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
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json();
  return { key: relKey, url: json.url };
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get a contact we know has a photo
  const [rows] = await conn.execute("SELECT id, telegramId, firstName, avatarUrl FROM contacts WHERE telegramId = '7480546401'");
  if (rows.length === 0) { console.log('Test contact not found'); return; }
  console.log('Before:', rows[0]);
  
  // Download via Bot API
  const photosRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=7480546401&limit=1`);
  const photosData = await photosRes.json();
  
  if (!photosData.ok || !photosData.result?.total_count) {
    console.log('No photos found');
    return;
  }
  
  const photoSizes = photosData.result.photos[0];
  const targetPhoto = photoSizes.length >= 2 ? photoSizes[1] : photoSizes[photoSizes.length - 1];
  
  const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${targetPhoto.file_id}`);
  const fileData = await fileRes.json();
  
  const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
  const downloadRes = await fetch(downloadUrl);
  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  console.log('Downloaded', buffer.length, 'bytes');
  
  // Upload to S3
  const { url } = await storagePut('avatars/7480546401.jpg', buffer, 'image/jpeg');
  console.log('S3 URL:', url);
  
  // Update DB
  await conn.execute('UPDATE contacts SET avatarUrl = ? WHERE telegramId = ?', [url, '7480546401']);
  
  // Verify
  const [after] = await conn.execute("SELECT id, telegramId, firstName, avatarUrl FROM contacts WHERE telegramId = '7480546401'");
  console.log('After:', after[0]);
  console.log('\n✅ End-to-end avatar pipeline works!');
  
  await conn.end();
}

main().catch(console.error);
