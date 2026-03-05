import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
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
        await db.delete(telegramAccounts).where(eq(telegramAccounts.id, input.id));
        return { success: true };
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
});

export type AppRouter = typeof appRouter;
