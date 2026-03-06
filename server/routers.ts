import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { registerUser, loginUser, createToken, AUTH_COOKIE_NAME } from "./authService";
import { getDb } from "./db";
import {
  telegramAccounts,
  contacts,
  dialogs,
  messages,
  quickReplies,
  autoReplies,
  bitrixSettings,
  workingHours,
  tags,
} from "../drizzle/schema";
import { eq, desc, and, sql, gte, count, countDistinct } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { startQRLogin, disconnectAccount, sendTelegramMessage, getActiveAccountIds, startPhoneLogin, verifyPhoneCode, verifyTwoFAPassword } from "./telegram";
import { ENV } from "./_core/env";

const BOT_BASE = "https://telegram-bitrix-bot-b4kx.onrender.com";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await registerUser(input.name, input.email, input.password);
          const token = await createToken(user.id, user.role);
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
          return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
      }),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const user = await loginUser(input.email, input.password);
          const token = await createToken(user.id, user.role);
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
          return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
        } catch (err: any) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
        }
      }),
  }),

  // ─── Telegram Accounts ──────────────────────────────────────────────────────
  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(telegramAccounts).orderBy(desc(telegramAccounts.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({
        phone: z.string().optional(),
        username: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        telegramId: z.string().optional(),
        status: z.enum(["pending", "active", "disconnected", "banned"]).default("active"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(telegramAccounts).values({ ...input, ownerId: ctx.user.id });
        const [acc] = await db.select().from(telegramAccounts).orderBy(desc(telegramAccounts.id)).limit(1);
        return acc;
      }),

    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pending", "active", "disconnected", "banned"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(telegramAccounts).set({ status: input.status }).where(eq(telegramAccounts.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await disconnectAccount(input.id).catch(() => {});
        await db.delete(telegramAccounts).where(eq(telegramAccounts.id, input.id));
        return { success: true };
      }),

    startQRLogin: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ input }) => {
        try {
          const qr = await startQRLogin(input.accountId);
          return { success: true, token: qr.token, expires: qr.expires };
        } catch (err: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err?.message ?? "QR login failed" });
        }
      }),

    disconnect: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await disconnectAccount(input.id).catch(() => {});
        await db.update(telegramAccounts).set({ status: "disconnected" }).where(eq(telegramAccounts.id, input.id));
        return { success: true };
      }),

    activeIds: protectedProcedure.query(() => {
      return getActiveAccountIds();
    }),

    updateBitrixSettings: protectedProcedure
      .input(z.object({
        id: z.number(),
        bitrixPipelineId: z.string().nullable().optional(),
        bitrixPipelineName: z.string().nullable().optional(),
        bitrixStageId: z.string().nullable().optional(),
        bitrixResponsibleId: z.string().nullable().optional(),
        bitrixResponsibleName: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...fields } = input;
        await db.update(telegramAccounts).set(fields).where(eq(telegramAccounts.id, id));
        const [acc] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, id)).limit(1);
        return acc;
      }),

    sendPhoneCode: protectedProcedure
      .input(z.object({ accountId: z.number(), phone: z.string().min(7) }))
      .mutation(async ({ input }) => {
        try {
          await startPhoneLogin(input.accountId, input.phone);
          return { success: true };
        } catch (err: any) {
          const msg = err?.message ?? "Failed to send code";
          // Surface FloodWait in a friendly way
          const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/);
          if (floodMatch) {
            const secs = parseInt(floodMatch[1]);
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Слишком много попыток. Подождите ${secs} секунд и попробуйте снова.` });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),

    verifyPhoneCode: protectedProcedure
      .input(z.object({ accountId: z.number(), phone: z.string(), code: z.string().min(4) }))
      .mutation(async ({ input }) => {
        try {
          const result = await verifyPhoneCode(input.accountId, input.phone, input.code);
          return result;
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Invalid code" });
        }
      }),

    verifyTwoFA: protectedProcedure
      .input(z.object({ accountId: z.number(), password: z.string().min(1) }))
      .mutation(async ({ input }) => {
        try {
          await verifyTwoFAPassword(input.accountId, input.password);
          return { success: true };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Invalid 2FA password" });
        }
      }),
  }),

  // ─── Dialogs ────────────────────────────────────────────────────────────────
  dialogs: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["open", "in_progress", "waiting", "resolved", "closed", "all"]).optional().default("all"),
        assigneeId: z.number().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const rows = await db
          .select({
            dialog: dialogs,
            contact: contacts,
            account: telegramAccounts,
          })
          .from(dialogs)
          .leftJoin(contacts, eq(dialogs.contactId, contacts.id))
          .leftJoin(telegramAccounts, eq(dialogs.telegramAccountId, telegramAccounts.id))
          .orderBy(desc(dialogs.lastMessageAt));
        return rows.filter(r => {
          if (input.status !== "all" && r.dialog.status !== input.status) return false;
          if (input.assigneeId && r.dialog.assigneeId !== input.assigneeId) return false;
          if (input.search) {
            const q = input.search.toLowerCase();
            const name = `${r.contact?.firstName ?? ""} ${r.contact?.lastName ?? ""}`.toLowerCase();
            const username = (r.contact?.username ?? "").toLowerCase();
            if (!name.includes(q) && !username.includes(q)) return false;
          }
          return true;
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [row] = await db
          .select({ dialog: dialogs, contact: contacts, account: telegramAccounts })
          .from(dialogs)
          .leftJoin(contacts, eq(dialogs.contactId, contacts.id))
          .leftJoin(telegramAccounts, eq(dialogs.telegramAccountId, telegramAccounts.id))
          .where(eq(dialogs.id, input.id))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return row;
      }),

    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs).set({ status: input.status }).where(eq(dialogs.id, input.id));
        return { success: true };
      }),

    assign: protectedProcedure
      .input(z.object({ id: z.number(), assigneeId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs).set({ assigneeId: input.assigneeId }).where(eq(dialogs.id, input.id));
        return { success: true };
      }),

    addTag: protectedProcedure
      .input(z.object({ dialogId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [d] = await db.select().from(dialogs).where(eq(dialogs.id, input.dialogId)).limit(1);
        if (!d) throw new TRPCError({ code: "NOT_FOUND" });
        const current = (d.tagIds as number[]) ?? [];
        if (!current.includes(input.tagId)) {
          await db.update(dialogs).set({ tagIds: [...current, input.tagId] }).where(eq(dialogs.id, input.dialogId));
        }
        return { success: true };
      }),

    generateSummary: protectedProcedure
      .input(z.object({ dialogId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const msgs = await db.select().from(messages).where(eq(messages.dialogId, input.dialogId)).orderBy(messages.createdAt);
        if (!msgs.length) return { summary: "Нет сообщений для анализа", sentiment: "neutral" as const };

        const transcript = msgs.map(m => `${m.direction === "incoming" ? "Клиент" : "Менеджер"}: ${m.text ?? "[медиа]"}`).join("\n");

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Ты помощник для анализа переписок. Отвечай только на русском языке." },
            { role: "user", content: `Проанализируй переписку и верни JSON с полями: summary (краткое резюме 2-3 предложения), sentiment (positive/neutral/negative), tags (массив из 1-3 тегов на русском).\n\nПереписка:\n${transcript}` },
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
                  sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["summary", "sentiment", "tags"],
                additionalProperties: false,
              },
            },
          },
        });

        let result = { summary: "", sentiment: "neutral" as "positive" | "neutral" | "negative", tags: [] as string[] };
        try {
          const content = response.choices?.[0]?.message?.content;
          result = typeof content === "string" ? JSON.parse(content) : content;
        } catch {}

        await db.update(dialogs).set({
          aiSummary: result.summary,
          sentiment: result.sentiment,
        }).where(eq(dialogs.id, input.dialogId));

        return result;
      }),
  }),

  // ─── Messages ───────────────────────────────────────────────────────────────
  messages: router({
    list: protectedProcedure
      .input(z.object({ dialogId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return db.select().from(messages).where(eq(messages.dialogId, input.dialogId)).orderBy(messages.createdAt);
      }),

    send: protectedProcedure
      .input(z.object({ dialogId: z.number(), text: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Get dialog to find account and contact for Telegram send
        const [dialogRow] = await db
          .select({ dialog: dialogs, contact: contacts })
          .from(dialogs)
          .leftJoin(contacts, eq(dialogs.contactId, contacts.id))
          .where(eq(dialogs.id, input.dialogId))
          .limit(1);

        // Try to send via Telegram MTProto
        if (dialogRow?.dialog.telegramAccountId && dialogRow?.contact?.telegramId) {
          try {
            await sendTelegramMessage(
              dialogRow.dialog.telegramAccountId,
              dialogRow.contact.telegramId,
              input.text
            );
          } catch (err) {
            console.error("[Send] Telegram send failed:", err);
          }
        }

        await db.insert(messages).values({
          dialogId: input.dialogId,
          direction: "outgoing",
          senderId: ctx.user.id,
          text: input.text,
          isRead: true,
        });
        await db.update(dialogs).set({
          lastMessageText: input.text,
          lastMessageAt: new Date(),
          status: "in_progress",
        }).where(eq(dialogs.id, input.dialogId));
        const [msg] = await db.select().from(messages).orderBy(desc(messages.id)).limit(1);
        return msg;
      }),
  }),

  // ─── Quick Replies ───────────────────────────────────────────────────────────
  quickReplies: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(quickReplies).orderBy(quickReplies.title);
    }),

    create: protectedProcedure
      .input(z.object({ title: z.string().min(1), text: z.string().min(1), shortcut: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(quickReplies).values({ ...input, createdById: ctx.user.id });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string().min(1), text: z.string().min(1), shortcut: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...data } = input;
        await db.update(quickReplies).set(data).where(eq(quickReplies.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(quickReplies).where(eq(quickReplies.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Auto Replies ────────────────────────────────────────────────────────────
  autoReplies: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(autoReplies).orderBy(autoReplies.name);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        trigger: z.enum(["first_message", "outside_hours", "keyword"]),
        keyword: z.string().optional(),
        text: z.string().min(1),
        isActive: z.boolean().default(true),
        telegramAccountId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(autoReplies).values(input);
        return { success: true };
      }),

    toggleActive: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(autoReplies).set({ isActive: input.isActive }).where(eq(autoReplies.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(autoReplies).where(eq(autoReplies.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Tags ────────────────────────────────────────────────────────────────────
  tags: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(tags).orderBy(tags.name);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().default("#6366f1") }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(tags).values(input);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(tags).where(eq(tags.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Analytics ───────────────────────────────────────────────────────────────
  analytics: router({
    summary: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [totalDialogs] = await db.select({ count: sql<number>`count(*)` }).from(dialogs);
      const [openDialogs] = await db.select({ count: sql<number>`count(*)` }).from(dialogs).where(eq(dialogs.status, "open"));
      const [resolvedDialogs] = await db.select({ count: sql<number>`count(*)` }).from(dialogs).where(eq(dialogs.status, "resolved"));
      const [totalMessages] = await db.select({ count: sql<number>`count(*)` }).from(messages);
      const [activeAccounts] = await db.select({ count: sql<number>`count(*)` }).from(telegramAccounts).where(eq(telegramAccounts.status, "active"));
      const [positiveDialogs] = await db.select({ count: sql<number>`count(*)` }).from(dialogs).where(eq(dialogs.sentiment, "positive"));
      const [negativeDialogs] = await db.select({ count: sql<number>`count(*)` }).from(dialogs).where(eq(dialogs.sentiment, "negative"));

      return {
        totalDialogs: Number(totalDialogs?.count ?? 0),
        openDialogs: Number(openDialogs?.count ?? 0),
        resolvedDialogs: Number(resolvedDialogs?.count ?? 0),
        totalMessages: Number(totalMessages?.count ?? 0),
        activeAccounts: Number(activeAccounts?.count ?? 0),
        positiveDialogs: Number(positiveDialogs?.count ?? 0),
        negativeDialogs: Number(negativeDialogs?.count ?? 0),
      };
    }),

    recentDialogs: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select({ dialog: dialogs, contact: contacts })
        .from(dialogs)
        .leftJoin(contacts, eq(dialogs.contactId, contacts.id))
        .orderBy(desc(dialogs.lastMessageAt))
        .limit(10);
    }),

    // Per-manager stats: dialogs, messages, deals, unread
    managerStats: protectedProcedure
      .input(z.object({
        period: z.enum(["today", "week", "month", "all"]).default("week"),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const now = new Date();
        let since: Date | null = null;
        if (input.period === "today") {
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (input.period === "week") {
          since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (input.period === "month") {
          since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const accounts = await db.select().from(telegramAccounts);

        const stats = await Promise.all(accounts.map(async (acc) => {
          const dialogFilter = since
            ? and(eq(dialogs.telegramAccountId, acc.id), gte(dialogs.createdAt, since))
            : eq(dialogs.telegramAccountId, acc.id);

          const [dialogCount] = await db.select({ count: count() }).from(dialogs).where(dialogFilter);

          const [dealsCount] = await db.select({ count: count() }).from(dialogs)
            .where(since
              ? and(eq(dialogs.telegramAccountId, acc.id), sql`${dialogs.bitrixDealId} IS NOT NULL`, gte(dialogs.createdAt, since))
              : and(eq(dialogs.telegramAccountId, acc.id), sql`${dialogs.bitrixDealId} IS NOT NULL`));

          const [msgCount] = await db.select({ count: count() }).from(messages)
            .innerJoin(dialogs, eq(messages.dialogId, dialogs.id))
            .where(since
              ? and(eq(dialogs.telegramAccountId, acc.id), gte(messages.createdAt, since))
              : eq(dialogs.telegramAccountId, acc.id));

          const [unreadCount] = await db
            .select({ total: sql<number>`COALESCE(SUM(${dialogs.unreadCount}), 0)` })
            .from(dialogs).where(eq(dialogs.telegramAccountId, acc.id));

          const [openCount] = await db.select({ count: count() }).from(dialogs)
            .where(and(eq(dialogs.telegramAccountId, acc.id), eq(dialogs.status, "open")));

          return {
            accountId: acc.id,
            name: acc.firstName ? `${acc.firstName}${acc.lastName ? " " + acc.lastName : ""}` : (acc.phone ?? `Аккаунт #${acc.id}`),
            phone: acc.phone ?? "",
            username: acc.username ?? "",
            status: acc.status,
            bitrixResponsibleName: acc.bitrixResponsibleName ?? "",
            dialogs: dialogCount?.count ?? 0,
            deals: dealsCount?.count ?? 0,
            messages: msgCount?.count ?? 0,
            unread: Number(unreadCount?.total ?? 0),
            openDialogs: openCount?.count ?? 0,
            conversionRate: dialogCount?.count > 0
              ? Math.round((dealsCount?.count / dialogCount?.count) * 100)
              : 0,
          };
        }));

        return stats.sort((a, b) => b.dialogs - a.dialogs);
      }),

    // Daily activity chart
    dailyActivity: protectedProcedure
      .input(z.object({
        period: z.enum(["week", "month"]).default("week"),
        accountId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const days = input.period === "week" ? 7 : 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const whereClause = input.accountId
          ? and(gte(dialogs.createdAt, since), eq(dialogs.telegramAccountId, input.accountId))
          : gte(dialogs.createdAt, since);

        const rows = await db
          .select({
            date: sql<string>`DATE(${dialogs.createdAt})`,
            accountId: dialogs.telegramAccountId,
            count: count(),
          })
          .from(dialogs)
          .where(whereClause)
          .groupBy(sql`DATE(${dialogs.createdAt})`, dialogs.telegramAccountId);

        return rows;
      }),

    // Summary with period filter
    summaryByPeriod: protectedProcedure
      .input(z.object({
        period: z.enum(["today", "week", "month", "all"]).default("week"),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { totalDialogs: 0, totalDeals: 0, totalMessages: 0, activeAccounts: 0 };

        const now = new Date();
        let since: Date | null = null;
        if (input.period === "today") {
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (input.period === "week") {
          since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (input.period === "month") {
          since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const dialogWhere = since ? gte(dialogs.createdAt, since) : undefined;
        const msgWhere = since ? gte(messages.createdAt, since) : undefined;

        const [totalDialogs] = await db.select({ count: count() }).from(dialogs).where(dialogWhere);
        const [totalDeals] = await db.select({ count: count() }).from(dialogs)
          .where(since
            ? and(sql`${dialogs.bitrixDealId} IS NOT NULL`, gte(dialogs.createdAt, since))
            : sql`${dialogs.bitrixDealId} IS NOT NULL`);
        const [totalMessages] = await db.select({ count: count() }).from(messages).where(msgWhere);
        const [activeAccounts] = await db.select({ count: countDistinct(dialogs.telegramAccountId) }).from(dialogs).where(dialogWhere);

        return {
          totalDialogs: totalDialogs?.count ?? 0,
          totalDeals: totalDeals?.count ?? 0,
          totalMessages: totalMessages?.count ?? 0,
          activeAccounts: activeAccounts?.count ?? 0,
        };
      }),
  }),

  // ─── Bitrix Settings ─────────────────────────────────────────────────────────
  bitrix: router({
    get: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [settings] = await db.select().from(bitrixSettings).limit(1);
      return settings ?? null;
    }),

    save: protectedProcedure
      .input(z.object({
        domain: z.string().min(1),
        webhookUrl: z.string().url(),
        pipelineId: z.string().optional(),
        pipelineName: z.string().optional(),
        stageId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [existing] = await db.select().from(bitrixSettings).limit(1);
        if (existing) {
          await db.update(bitrixSettings).set(input).where(eq(bitrixSettings.id, existing.id));
        } else {
          await db.insert(bitrixSettings).values(input);
        }
        return { success: true };
      }),

    testConnection: protectedProcedure
      .input(z.object({ webhookUrl: z.string().url() }))
      .mutation(async ({ input }) => {
        try {
          const url = `${input.webhookUrl.replace(/\/$/, "")}/crm.deal.fields`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.result) return { success: true, message: "Подключение успешно!" };
          return { success: false, message: "Ошибка подключения к Битрикс24" };
        } catch {
          return { success: false, message: "Не удалось подключиться к Битрикс24" };
        }
      }),

    // Fetch all pipelines (воронки) from Bitrix24
    getPipelines: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [settings] = await db.select().from(bitrixSettings).limit(1);
      if (!settings?.webhookUrl) return [];
      try {
        const base = settings.webhookUrl.replace(/\/$/, "");
        const resp = await fetch(`${base}/crm.category.list?entityTypeId=2`);
        const data = await resp.json();
        if (data.result?.categories) {
          return data.result.categories.map((c: any) => ({ id: String(c.id), name: c.name }));
        }
        // fallback: try crm.dealcategory.list
        const resp2 = await fetch(`${base}/crm.dealcategory.list`);
        const data2 = await resp2.json();
        if (data2.result) {
          const list = Array.isArray(data2.result) ? data2.result : Object.values(data2.result);
          return list.map((c: any) => ({ id: String(c.ID), name: c.NAME }));
        }
        return [];
      } catch {
        return [];
      }
    }),

    // Fetch stages for a given pipeline
    getPipelineStages: protectedProcedure
      .input(z.object({ pipelineId: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [settings] = await db.select().from(bitrixSettings).limit(1);
        if (!settings?.webhookUrl) return [];
        try {
          const base = settings.webhookUrl.replace(/\/$/, "");
          const resp = await fetch(`${base}/crm.dealcategory.stages?id=${input.pipelineId}`);
          const data = await resp.json();
          if (data.result) {
            const list = Array.isArray(data.result) ? data.result : Object.values(data.result);
            return list.map((s: any) => ({ id: String(s.STATUS_ID), name: s.NAME }));
          }
          return [];
        } catch {
          return [];
        }
      }),

    // Fetch users (responsible persons) from Bitrix24
    getUsers: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [settings] = await db.select().from(bitrixSettings).limit(1);
      if (!settings?.webhookUrl) return [];
      try {
        const base = settings.webhookUrl.replace(/\/$/, "");
        const resp = await fetch(`${base}/user.get?ACTIVE=Y&start=0`);
        const data = await resp.json();
        if (data.result) {
          return data.result.map((u: any) => ({
            id: String(u.ID),
            name: [u.NAME, u.LAST_NAME].filter(Boolean).join(" ") || u.EMAIL || `User ${u.ID}`,
          }));
        }
        return [];
      } catch {
        return [];
      }
    }),
  }),

  // ─── Working Hours ────────────────────────────────────────────────────────────
  workingHours: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(workingHours).orderBy(workingHours.dayOfWeek);
    }),

    upsert: protectedProcedure
      .input(z.array(z.object({
        dayOfWeek: z.number().min(0).max(6),
        isActive: z.boolean(),
        startTime: z.string(),
        endTime: z.string(),
      })))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        for (const day of input) {
          const [existing] = await db.select().from(workingHours).where(eq(workingHours.dayOfWeek, day.dayOfWeek)).limit(1);
          if (existing) {
            await db.update(workingHours).set(day).where(eq(workingHours.id, existing.id));
          } else {
            await db.insert(workingHours).values(day);
          }
        }
        return { success: true };
      }),
  }),

  // ─── LeadCash Bot Integration ────────────────────────────────────────────────
  leadcashBot: router({

    groups: protectedProcedure.query(async () => {
      const res = await fetch(`${BOT_BASE}/api/groups`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bot API unavailable" });
      return res.json() as Promise<Record<string, any>>;
    }),
    categories: protectedProcedure.query(async () => {
      const res = await fetch(`${BOT_BASE}/api/categories`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bot API unavailable" });
      return res.json() as Promise<Record<string, any>>;
    }),
    logs: protectedProcedure.query(async () => {
      const res = await fetch(`${BOT_BASE}/api/logs`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bot API unavailable" });
      return res.json() as Promise<Record<string, any>>;
    }),
    admins: protectedProcedure.query(async () => {
      const res = await fetch(`${BOT_BASE}/api/admins`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bot API unavailable" });
      return res.json() as Promise<Record<string, any>>;
    }),
    templates: protectedProcedure.query(async () => {
      const res = await fetch(`${BOT_BASE}/api/templates`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bot API unavailable" });
      return res.json() as Promise<Record<string, any>>;
    }),
    // Approve a pending group — set its category
    approveGroup: protectedProcedure
      .input(z.object({
        chatId: z.string(),
        category: z.string(),
        lang: z.string().default("ru"),
      }))
      .mutation(async ({ input }) => {
        const res = await fetch(`${BOT_BASE}/api/groups/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: input.chatId, category: input.category, lang: input.lang }),
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, data };
      }),
    // Remove a group from bot
    removeGroup: protectedProcedure
      .input(z.object({ chatId: z.string() }))
      .mutation(async ({ input }) => {
        const res = await fetch(`${BOT_BASE}/api/groups/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: input.chatId }),
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, data };
      }),
    // Update a group's category and language
    updateGroup: protectedProcedure
      .input(z.object({
        chatId: z.string(),
        title: z.string().optional(),
        category: z.string(),
        lang: z.string(),
      }))
      .mutation(async ({ input }) => {
        const res = await fetch(`${BOT_BASE}/api/groups/${encodeURIComponent(input.chatId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: input.title, category: input.category, lang: input.lang }),
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, data };
      }),
    // Update a category
    updateCategory: protectedProcedure
      .input(z.object({
        key: z.string(),
        name: z.string(),
        name_en: z.string(),
        line_id: z.string(),
      }))
      .mutation(async ({ input }) => {
        const res = await fetch(`${BOT_BASE}/api/categories/${encodeURIComponent(input.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: input.name, name_en: input.name_en, line_id: input.line_id }),
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, data };
      }),
    // Add a new admin
    addAdmin: protectedProcedure
      .input(z.object({
        telegram_id: z.string(),
        name: z.string(),
      }))
      .mutation(async ({ input }) => {
        const res = await fetch(`${BOT_BASE}/api/admins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegram_id: input.telegram_id, name: input.name }),
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, data };
      }),
    // Remove an admin
    removeAdmin: protectedProcedure
      .input(z.object({ telegram_id: z.string() }))
      .mutation(async ({ input }) => {
        const res = await fetch(`${BOT_BASE}/api/admins/${encodeURIComponent(input.telegram_id)}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        return { success: res.ok, data };
      }),
    // Update a template (correct endpoint)
    updateTemplate: protectedProcedure
      .input(z.object({
        key: z.string(),
        ru: z.string(),
        en: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Try both RU and EN via the per-lang endpoint
        const [resRu, resEn] = await Promise.all([
          fetch(`${BOT_BASE}/api/templates/${encodeURIComponent(input.key)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: "ru", text: input.ru }),
          }),
          fetch(`${BOT_BASE}/api/templates/${encodeURIComponent(input.key)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: "en", text: input.en }),
          }),
        ]);
        return { success: resRu.ok && resEn.ok };
      }),
    broadcast: protectedProcedure
      .input(z.object({
        category: z.string(), // category key or "all"
        text: z.string().min(1),
        langFilter: z.enum(["ru", "en", "all"]).default("all"),
      }))
      .mutation(async ({ input }) => {
        // Fetch groups from bot API
        const groupsRes = await fetch(`${BOT_BASE}/api/groups`);
        if (!groupsRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch groups" });
        const groupsData = await groupsRes.json() as Record<string, any>;
        // Groups are nested under category keys: { advertisers: { count, groups: {chatId: {title, category, lang}} }, ... }
        const allGroups: Array<{ id: string; title: string; category: string; lang: string }> = [];
        const CATEGORY_KEYS = ["advertisers", "brokers_ru", "brokers_en", "pending", "test"];
        for (const catKey of CATEGORY_KEYS) {
          const catData = groupsData[catKey];
          if (catData && typeof catData === "object" && catData.groups && typeof catData.groups === "object") {
            for (const [chatId, info] of Object.entries(catData.groups as Record<string, any>)) {
              allGroups.push({ id: chatId, title: info.title ?? chatId, category: info.category ?? catKey, lang: info.lang ?? "ru" });
            }
          }
        }

        // Filter by category and lang
        let targets = allGroups.filter(g => g.category !== "pending");
        if (input.category !== "all") targets = targets.filter(g => g.category === input.category);
        if (input.langFilter !== "all") targets = targets.filter(g => g.lang === input.langFilter);

        const botToken = ENV.leadcashBotToken;
        if (!botToken) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bot token not configured" });

        // Send messages in parallel with rate limiting
        const results: Array<{ id: string; title: string; ok: boolean; error?: string }> = [];
        for (const group of targets) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: group.id, text: input.text, parse_mode: "HTML" }),
            });
            const data = await res.json() as { ok: boolean; description?: string };
            results.push({ id: group.id, title: group.title, ok: data.ok, error: data.description });
          } catch (e) {
            results.push({ id: group.id, title: group.title, ok: false, error: String(e) });
          }
          // Small delay to avoid Telegram rate limits
          await new Promise(r => setTimeout(r, 50));
        }

        const successCount = results.filter(r => r.ok).length;
        const failCount = results.filter(r => !r.ok).length;
        return { successCount, failCount, total: targets.length, results };
      }),
  }),

});

export type AppRouter = typeof appRouter;
