import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("No DATABASE_URL"); process.exit(1); }

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);

const [rows1] = await connection.execute("SELECT COUNT(*) as cnt FROM contacts");
const [rows2] = await connection.execute("SELECT COUNT(*) as cnt FROM contacts WHERE avatarUrl IS NOT NULL AND avatarUrl != ''");
const [rows3] = await connection.execute("SELECT COUNT(*) as cnt FROM contacts WHERE avatarUrl IS NULL OR avatarUrl = ''");
const [rows4] = await connection.execute("SELECT avatarUrl FROM contacts WHERE avatarUrl IS NOT NULL AND avatarUrl != '' LIMIT 3");

console.log("Total contacts:", rows1[0].cnt);
console.log("With avatar:", rows2[0].cnt);
console.log("Without avatar:", rows3[0].cnt);
console.log("Sample avatars:", rows4);

// Check telegram accounts status
const [rows5] = await connection.execute("SELECT id, username, firstName, status, syncStatus FROM telegram_accounts");
console.log("\nTelegram accounts:", rows5);

await connection.end();
