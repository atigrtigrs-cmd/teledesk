import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users (managers/admins) ──────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "agent"]).default("user").notNull(),
  avatarUrl: text("avatarUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Telegram Accounts ────────────────────────────────────────────────────────
export const telegramAccounts = mysqlTable("telegram_accounts", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").references(() => users.id),
  phone: varchar("phone", { length: 32 }),
  username: varchar("username", { length: 128 }),
  firstName: varchar("firstName", { length: 255 }),
  lastName: varchar("lastName", { length: 255 }),
  telegramId: varchar("telegramId", { length: 64 }),
  sessionString: text("sessionString"),
  status: mysqlEnum("status", ["pending", "active", "disconnected", "banned"]).default("pending").notNull(),
  avatarUrl: text("avatarUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TelegramAccount = typeof telegramAccounts.$inferSelect;
export type InsertTelegramAccount = typeof telegramAccounts.$inferInsert;

// ─── Contacts (Telegram users who write to us) ───────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  telegramId: varchar("telegramId", { length: 64 }).notNull(),
  username: varchar("username", { length: 128 }),
  firstName: varchar("firstName", { length: 255 }),
  lastName: varchar("lastName", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  avatarUrl: text("avatarUrl"),
  bitrixContactId: varchar("bitrixContactId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Tags ─────────────────────────────────────────────────────────────────────
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

// ─── Dialogs ──────────────────────────────────────────────────────────────────
export const dialogs = mysqlTable("dialogs", {
  id: int("id").autoincrement().primaryKey(),
  telegramAccountId: int("telegramAccountId").references(() => telegramAccounts.id),
  contactId: int("contactId").references(() => contacts.id),
  assigneeId: int("assigneeId").references(() => users.id),
  status: mysqlEnum("status", ["open", "in_progress", "waiting", "resolved", "closed"]).default("open").notNull(),
  lastMessageAt: timestamp("lastMessageAt"),
  lastMessageText: text("lastMessageText"),
  unreadCount: int("unreadCount").default(0).notNull(),
  bitrixDealId: varchar("bitrixDealId", { length: 64 }),
  aiSummary: text("aiSummary"),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  tagIds: json("tagIds").$type<number[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Dialog = typeof dialogs.$inferSelect;
export type InsertDialog = typeof dialogs.$inferInsert;

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  dialogId: int("dialogId").notNull().references(() => dialogs.id),
  telegramMessageId: varchar("telegramMessageId", { length: 64 }),
  direction: mysqlEnum("direction", ["incoming", "outgoing"]).notNull(),
  senderId: int("senderId").references(() => users.id),
  text: text("text"),
  mediaUrl: text("mediaUrl"),
  mediaType: mysqlEnum("mediaType", ["photo", "video", "audio", "document", "voice", "sticker"]),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── Quick Replies ────────────────────────────────────────────────────────────
export const quickReplies = mysqlTable("quick_replies", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 128 }).notNull(),
  text: text("text").notNull(),
  shortcut: varchar("shortcut", { length: 32 }),
  createdById: int("createdById").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuickReply = typeof quickReplies.$inferSelect;
export type InsertQuickReply = typeof quickReplies.$inferInsert;

// ─── Auto Replies ─────────────────────────────────────────────────────────────
export const autoReplies = mysqlTable("auto_replies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  trigger: mysqlEnum("trigger", ["first_message", "outside_hours", "keyword"]).notNull(),
  keyword: varchar("keyword", { length: 128 }),
  text: text("text").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  telegramAccountId: int("telegramAccountId").references(() => telegramAccounts.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutoReply = typeof autoReplies.$inferSelect;
export type InsertAutoReply = typeof autoReplies.$inferInsert;

// ─── Bitrix24 Settings ────────────────────────────────────────────────────────
export const bitrixSettings = mysqlTable("bitrix_settings", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull(),
  webhookUrl: text("webhookUrl").notNull(),
  pipelineId: varchar("pipelineId", { length: 64 }),
  pipelineName: varchar("pipelineName", { length: 255 }),
  stageId: varchar("stageId", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BitrixSettings = typeof bitrixSettings.$inferSelect;
export type InsertBitrixSettings = typeof bitrixSettings.$inferInsert;

// ─── Working Hours ────────────────────────────────────────────────────────────
export const workingHours = mysqlTable("working_hours", {
  id: int("id").autoincrement().primaryKey(),
  dayOfWeek: int("dayOfWeek").notNull(), // 0=Sun, 1=Mon ... 6=Sat
  isActive: boolean("isActive").default(true).notNull(),
  startTime: varchar("startTime", { length: 5 }).notNull().default("09:00"),
  endTime: varchar("endTime", { length: 5 }).notNull().default("18:00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkingHours = typeof workingHours.$inferSelect;
export type InsertWorkingHours = typeof workingHours.$inferInsert;
