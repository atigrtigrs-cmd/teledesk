#!/usr/bin/env python3
import argparse
import json
import os
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple
from urllib.parse import parse_qs, unquote, urlparse

import certifi
import pymysql


IMPORTABLE_TYPES = {
    "personal_chat",
    "private_supergroup",
    "public_supergroup",
    "private_group",
    "bot_chat",
    "private_channel",
    "saved_messages",
}


@dataclass(frozen=True)
class ExportSpec:
    zip_path: str
    phone: str
    username: str
    telegram_id: str
    label: str


EXPORTS: Sequence[ExportSpec] = (
    ExportSpec(
        zip_path="/Users/vedmak/Downloads/DataExport_2026-03-13.zip",
        phone="79059365077",
        username="affiliate_LeadCash",
        telegram_id="7480546401",
        label="manager_leadcash",
    ),
    ExportSpec(
        zip_path="/Users/vedmak/Downloads/DataExport_2026-03-10 (1).zip",
        phone="79231776601",
        username="LeadCash_Affiliate",
        telegram_id="5547473306",
        label="ulyana_leadcash",
    ),
    ExportSpec(
        zip_path="/Users/vedmak/Downloads/DataExport_2026-03-10.zip",
        phone="79059374229",
        username="LeadCash_manager",
        telegram_id="7966871800",
        label="irina_koripenko",
    ),
)


def normalize_phone(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return digits or None


def normalize_username(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    return value[1:] if value.startswith("@") else value


def extract_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: List[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text", "")))
        return "".join(parts)
    return str(value)


def extract_sender_id(from_id) -> Optional[str]:
    if not from_id:
        return None
    if isinstance(from_id, str) and from_id.startswith("user"):
        return from_id[4:]
    if isinstance(from_id, str) and from_id.startswith("channel"):
        return f"channel_{from_id[7:]}"
    return str(from_id)


def contact_telegram_id(chat_type: str, chat_id) -> str:
    chat_id = str(chat_id)
    if chat_type in {"personal_chat", "bot_chat", "saved_messages"}:
        return chat_id
    if chat_type in {"private_supergroup", "public_supergroup", "private_channel"}:
        return f"channel_{chat_id}"
    if chat_type == "private_group":
        return f"group_{chat_id}"
    return chat_id


def parse_message_time(raw_message: dict) -> datetime:
    unix_time = raw_message.get("date_unixtime")
    if unix_time:
        return datetime.fromtimestamp(int(unix_time), tz=timezone.utc).replace(tzinfo=None)
    raw_date = raw_message.get("date")
    if raw_date:
        try:
            return datetime.fromisoformat(str(raw_date).replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    return datetime.utcnow()


def load_export(spec: ExportSpec) -> dict:
    with zipfile.ZipFile(spec.zip_path) as archive:
        result_members = [name for name in archive.namelist() if name.endswith("/result.json")]
        if not result_members:
            raise RuntimeError(f"No result.json found in {spec.zip_path}")
        return json.loads(archive.read(result_members[0]))


def connect_db() -> pymysql.connections.Connection:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    parsed = urlparse(database_url)
    ssl_options = {"ca": certifi.where()}
    raw_ssl = parse_qs(parsed.query).get("ssl", [None])[0]
    if raw_ssl:
        decoded = json.loads(unquote(raw_ssl))
        if "rejectUnauthorized" in decoded:
            # PyMySQL validates against the provided CA bundle automatically.
            decoded.pop("rejectUnauthorized", None)
        ssl_options.update(decoded)
    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        database=(parsed.path or "/").lstrip("/"),
        ssl=ssl_options,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def resolve_account(conn, spec: ExportSpec, personal_info: dict, dry_run: bool) -> int:
    normalized_phone = normalize_phone(personal_info.get("phone_number")) or spec.phone
    normalized_username = normalize_username(personal_info.get("username")) or spec.username
    telegram_id = str(personal_info.get("user_id") or spec.telegram_id)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, phone, username, telegramId
            FROM telegram_accounts
            WHERE telegramId = %s OR phone = %s OR username = %s
            ORDER BY id ASC
            LIMIT 1
            """,
            (telegram_id, normalized_phone, normalized_username),
        )
        existing = cur.fetchone()
        if existing:
            if not dry_run:
                cur.execute(
                    """
                    UPDATE telegram_accounts
                    SET phone = %s,
                        username = %s,
                        firstName = %s,
                        lastName = %s,
                        telegramId = %s,
                        updatedAt = NOW()
                    WHERE id = %s
                    """,
                    (
                        normalized_phone,
                        normalized_username,
                        personal_info.get("first_name"),
                        personal_info.get("last_name"),
                        telegram_id,
                        existing["id"],
                    ),
                )
            return int(existing["id"])

        if dry_run:
            return -1

        cur.execute(
            """
            INSERT INTO telegram_accounts (
                phone, username, firstName, lastName, telegramId, status, syncStatus, createdAt, updatedAt
            ) VALUES (%s, %s, %s, %s, %s, 'disconnected', 'idle', NOW(), NOW())
            """,
            (
                normalized_phone,
                normalized_username,
                personal_info.get("first_name"),
                personal_info.get("last_name"),
                telegram_id,
            ),
        )
        return int(cur.lastrowid)


def get_or_create_contact(conn, tg_id: str, chat: dict, dry_run: bool) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM contacts WHERE telegramId = %s LIMIT 1", (tg_id,))
        existing = cur.fetchone()
        if existing:
            return int(existing["id"])

        if dry_run:
            return -1

        cur.execute(
            """
            INSERT INTO contacts (telegramId, username, firstName, lastName, createdAt, updatedAt)
            VALUES (%s, %s, %s, %s, NOW(), NOW())
            """,
            (
                tg_id,
                normalize_username(chat.get("username")),
                (chat.get("first_name") or chat.get("name") or "")[:255] or None,
                (chat.get("last_name") or None),
            ),
        )
        return int(cur.lastrowid)


def get_or_create_dialog(conn, account_id: int, contact_id: int, dry_run: bool) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM dialogs
            WHERE telegramAccountId = %s AND contactId = %s
            ORDER BY id ASC
            LIMIT 1
            """,
            (account_id, contact_id),
        )
        existing = cur.fetchone()
        if existing:
            return int(existing["id"])

        if dry_run:
            return -1

        cur.execute(
            """
            INSERT INTO dialogs (telegramAccountId, contactId, status, unreadCount, createdAt, updatedAt)
            VALUES (%s, %s, 'open', 0, NOW(), NOW())
            """,
            (account_id, contact_id),
        )
        return int(cur.lastrowid)


def load_existing_message_ids(conn, dialog_id: int) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT telegramMessageId FROM messages WHERE dialogId = %s AND telegramMessageId IS NOT NULL",
            (dialog_id,),
        )
        return {str(row["telegramMessageId"]) for row in cur.fetchall()}


def insert_messages(conn, rows: Sequence[Tuple], dry_run: bool) -> int:
    if dry_run or not rows:
        return len(rows)

    placeholders = ", ".join(["(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"] * len(rows))
    flat_values: List[object] = []
    for row in rows:
        flat_values.extend(row)

    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO messages (
                dialogId, telegramMessageId, direction, senderId, text, mediaUrl,
                mediaType, senderName, isRead, createdAt
            ) VALUES {placeholders}
            """,
            flat_values,
        )
    return len(rows)


def update_dialog_summary(conn, dialog_id: int, last_text: Optional[str], last_time: Optional[datetime], dry_run: bool) -> None:
    if dry_run or dialog_id < 0 or last_time is None:
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE dialogs
            SET lastMessageText = %s,
                lastMessageAt = %s,
                updatedAt = NOW()
            WHERE id = %s AND (lastMessageAt IS NULL OR lastMessageAt < %s)
            """,
            ((last_text or None), last_time, dialog_id, last_time),
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = connect_db()
    total_dialogs = 0
    total_messages = 0
    total_skipped = 0

    try:
        for spec in EXPORTS:
            export_data = load_export(spec)
            personal_info = export_data.get("personal_information", {})
            account_id = resolve_account(conn, spec, personal_info, args.dry_run)
            account_label = f"{spec.label} -> account {account_id if account_id > 0 else 'new'}"
            print(f"\n=== {account_label} ===")

            owner_telegram_id = str(personal_info.get("user_id") or spec.telegram_id)
            chats = export_data.get("chats", {}).get("list", [])
            imported_dialogs = 0
            imported_messages = 0
            skipped_messages = 0

            for chat in chats:
                chat_type = chat.get("type")
                if chat_type not in IMPORTABLE_TYPES:
                    continue

                raw_messages = [msg for msg in chat.get("messages", []) if msg.get("type") == "message"]
                if not raw_messages:
                    continue

                tg_contact_id = contact_telegram_id(chat_type, chat.get("id"))
                contact_id = get_or_create_contact(conn, tg_contact_id, chat, args.dry_run)
                dialog_id = get_or_create_dialog(conn, account_id, contact_id, args.dry_run)
                existing_ids = set() if dialog_id < 0 else load_existing_message_ids(conn, dialog_id)

                batch: List[Tuple] = []
                last_time: Optional[datetime] = None
                last_text: Optional[str] = None

                for msg in raw_messages:
                    tg_message_id = str(msg.get("id"))
                    if tg_message_id in existing_ids:
                        skipped_messages += 1
                        continue

                    text = extract_text(msg.get("text"))
                    media_type = None
                    if msg.get("photo"):
                        media_type = "photo"
                    elif msg.get("file"):
                        mime = str(msg.get("mime_type") or "")
                        if mime.startswith("video"):
                            media_type = "video"
                        elif mime.startswith("audio"):
                            media_type = "audio"
                        elif msg.get("media_type") == "voice_message":
                            media_type = "voice"
                        elif msg.get("media_type") == "sticker":
                            media_type = "sticker"
                        else:
                            media_type = "document"
                    elif msg.get("media_type") == "sticker":
                        media_type = "sticker"

                    if not text and not media_type:
                        continue

                    created_at = parse_message_time(msg)
                    sender_id = extract_sender_id(msg.get("from_id"))
                    is_outgoing = sender_id == owner_telegram_id or msg.get("from_id") == f"user{owner_telegram_id}"
                    row = (
                        dialog_id,
                        tg_message_id,
                        "outgoing" if is_outgoing else "incoming",
                        sender_id,
                        text or (f"[{media_type}]" if media_type else ""),
                        None,
                        media_type,
                        (msg.get("from") or None),
                        1,
                        created_at,
                    )
                    batch.append(row)
                    existing_ids.add(tg_message_id)
                    last_time = created_at
                    last_text = row[4]

                    if len(batch) >= 500:
                        imported_messages += insert_messages(conn, batch, args.dry_run)
                        batch.clear()

                if batch:
                    imported_messages += insert_messages(conn, batch, args.dry_run)

                if imported_messages > 0 or skipped_messages >= 0:
                    imported_dialogs += 1
                update_dialog_summary(conn, dialog_id, last_text, last_time, args.dry_run)

            print(
                f"dialogs touched: {imported_dialogs}, messages imported: {imported_messages}, duplicate messages skipped: {skipped_messages}"
            )
            total_dialogs += imported_dialogs
            total_messages += imported_messages
            total_skipped += skipped_messages

        if args.dry_run:
            conn.rollback()
            print("\nDry run complete. No data was written.")
        else:
            conn.commit()
            print("\nImport committed.")

        print(
            f"Summary: dialogs touched={total_dialogs}, messages imported={total_messages}, duplicates skipped={total_skipped}"
        )
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
