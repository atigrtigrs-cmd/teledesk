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
  dialogTags,
  users,
} from "../drizzle/schema";
import { eq, desc, and, sql, gte, count, countDistinct, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { startQRLogin, disconnectAccount, sendTelegramMessage, getActiveAccountIds, startPhoneLogin, verifyPhoneCode, verifyTwoFAPassword, connectAccount, syncAccountHistory, restoreAllSessions, forceSyncAll } from "./telegram";
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
        // Delete messages for all dialogs belonging to this account (FK constraint)
        const accountDialogs = await db.select({ id: dialogs.id }).from(dialogs)
          .where(eq(dialogs.telegramAccountId, input.id));
        if (accountDialogs.length > 0) {
          const dialogIds = accountDialogs.map(d => d.id);
          await db.delete(messages).where(inArray(messages.dialogId, dialogIds));
          await db.delete(dialogTags).where(inArray(dialogTags.dialogId, dialogIds));
          await db.delete(dialogs).where(eq(dialogs.telegramAccountId, input.id));
        }
        await db.delete(autoReplies).where(eq(autoReplies.telegramAccountId, input.id));
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

    syncHistory: protectedProcedure
      .input(z.object({ accountId: z.number() }))
      .mutation(async ({ input }) => {
        // Run sync in background, return immediately
        syncAccountHistory(input.accountId).catch(err =>
          console.error(`[Sync] Manual sync failed for account #${input.accountId}:`, err)
        );
        return { success: true, message: "Синхронизация запущена" };
      }),

    reconnectAll: protectedProcedure
      .mutation(async () => {
        // Trigger restoreAllSessions in background — reconnects all accounts with a session string
        restoreAllSessions().catch(err =>
          console.error("[reconnectAll] Failed:", err)
        );
        return { success: true, message: "Переподключение запущено" };
      }),

    syncAll: protectedProcedure
      .mutation(async () => {
        // Force sync ALL accounts: connect if needed, then sync all dialogs
        // This runs synchronously and returns the result
        try {
          const result = await forceSyncAll();
          const accountSummary = result.accounts
            .map(a => `@${a.username ?? a.id}: ${a.dialogs} диалогов${a.error ? ` (ошибка)` : ""}`)
            .join(", ");
          return {
            success: true,
            message: `Синхронизировано ${result.synced} диалогов по ${result.accounts.length} аккаунтам`,
            details: accountSummary,
            synced: result.synced,
            errors: result.errors,
          };
        } catch (err: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
        }
      }),

    assignManager: protectedProcedure
      .input(z.object({ id: z.number(), managerId: z.number().nullable() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(telegramAccounts)
          .set({ managerId: input.managerId })
          .where(eq(telegramAccounts.id, input.id));
        const [acc] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, input.id)).limit(1);
        return acc;
      }),

    connectSessionString: protectedProcedure
      .input(z.object({
        sessionString: z.string().min(10),
        phone: z.string().optional(),
        firstName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        try {
          // Create account record with session string
          await db.insert(telegramAccounts).values({
            phone: input.phone ?? "",
            firstName: input.firstName ?? null,
            status: "pending",
            sessionString: input.sessionString,
            ownerId: ctx.user.id,
          });
          const [acc] = await db.select().from(telegramAccounts).orderBy(desc(telegramAccounts.id)).limit(1);
          // Connect using the session string
          await connectAccount(acc.id, input.sessionString);
          return { success: true, accountId: acc.id };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Invalid session string" });
        }
      }),
  }),

  // ─── Dialogs ────────────────────────────────────────────────────────────────
  dialogs: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["open", "in_progress", "waiting", "needs_reply", "resolved", "closed", "archived", "all"]).optional().default("all"),
        assigneeId: z.number().optional(),
        search: z.string().optional(),
        tagId: z.number().optional(),
        telegramAccountId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users } = await import("../drizzle/schema");
        // If filtering by tag, get dialog IDs that have this tag
        let tagDialogIds: Set<number> | null = null;
        if (input.tagId) {
          const tagRows = await db.select({ dialogId: dialogTags.dialogId })
            .from(dialogTags)
            .where(eq(dialogTags.tagId, input.tagId));
          tagDialogIds = new Set(tagRows.map(r => r.dialogId));
        }
        const rows = await db
          .select({
            dialog: dialogs,
            contact: contacts,
            account: telegramAccounts,
            assignee: { id: users.id, name: users.name },
          })
          .from(dialogs)
          .leftJoin(contacts, eq(dialogs.contactId, contacts.id))
          .leftJoin(telegramAccounts, eq(dialogs.telegramAccountId, telegramAccounts.id))
          .leftJoin(users, eq(dialogs.assigneeId, users.id))
          .orderBy(desc(dialogs.lastMessageAt));
        return rows.filter(r => {
          if (input.status !== "all" && r.dialog.status !== input.status) return false;
          if (input.assigneeId && r.dialog.assigneeId !== input.assigneeId) return false;
          if (input.telegramAccountId && r.dialog.telegramAccountId !== input.telegramAccountId) return false;
          if (tagDialogIds !== null && !tagDialogIds.has(r.dialog.id)) return false;
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
      .input(z.object({ id: z.number(), status: z.enum(["open", "in_progress", "waiting", "needs_reply", "resolved", "closed", "archived"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs).set({ status: input.status }).where(eq(dialogs.id, input.id));
        return { success: true };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
        status: z.enum(["open", "in_progress", "waiting", "needs_reply", "resolved", "closed", "archived"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs).set({ status: input.status }).where(inArray(dialogs.id, input.ids));
        return { success: true, updated: input.ids.length };
      }),

    bulkAssign: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
        assigneeId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs).set({ assigneeId: input.assigneeId }).where(inArray(dialogs.id, input.ids));
        return { success: true, updated: input.ids.length };
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

        // Try to send via Telegram MTProto — throw if delivery fails
        if (dialogRow?.dialog.telegramAccountId && dialogRow?.contact?.telegramId) {
          await sendTelegramMessage(
            dialogRow.dialog.telegramAccountId,
            dialogRow.contact.telegramId,
            input.text
          ).catch((err: any) => {
            const msg = err?.message ?? String(err);
            console.error("[Send] Telegram send failed:", msg);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Сообщение не доставлено: ${msg}`,
            });
          });
        }

        await db.insert(messages).values({
          dialogId: input.dialogId,
          direction: "outgoing",
          senderId: ctx.user.id,
          text: input.text,
          isRead: true,
        });
        // Auto-assign dialog to sender if unassigned
        const [currentDialog] = await db.select({ assigneeId: dialogs.assigneeId }).from(dialogs).where(eq(dialogs.id, input.dialogId)).limit(1);
        await db.update(dialogs).set({
          lastMessageText: input.text,
          lastMessageAt: new Date(),
          status: "in_progress",
          ...(currentDialog?.assigneeId ? {} : { assigneeId: ctx.user.id }),
        }).where(eq(dialogs.id, input.dialogId));
        // Track firstResponseAt: if no prior outgoing message, record now
        const [existingOutgoing] = await db.select({ id: messages.id }).from(messages)
          .where(and(eq(messages.dialogId, input.dialogId), eq(messages.direction, "outgoing")))
          .orderBy(messages.createdAt).limit(1);
        if (!existingOutgoing) {
          await db.update(dialogs).set({ firstResponseAt: new Date() }).where(eq(dialogs.id, input.dialogId));
        }
        const [msg] = await db.select().from(messages).orderBy(desc(messages.id)).limit(1);
        return msg;
      }),

    addNote: protectedProcedure
      .input(z.object({ dialogId: z.number(), text: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(messages).values({
          dialogId: input.dialogId,
          direction: "note",
          senderId: ctx.user.id,
          text: input.text,
          isRead: true,
        });
        return { success: true };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        status: z.enum(["open", "in_progress", "waiting", "needs_reply", "resolved", "closed", "archived"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs)
          .set({ status: input.status })
          .where(inArray(dialogs.id, input.ids));
        return { updated: input.ids.length };
      }),

    bulkAssign: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        assigneeId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(dialogs)
          .set({ assigneeId: input.assigneeId })
          .where(inArray(dialogs.id, input.ids));
        return { updated: input.ids.length };
      }),
  }),

  // ─── Users ────────────────────────────────────────────────────────────────────
  users: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { users } = await import("../drizzle/schema");
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl }).from(users);
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
    // Assign a tag to a dialog
    assign: protectedProcedure
      .input(z.object({ dialogId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        try {
          await db.insert(dialogTags).values({ dialogId: input.dialogId, tagId: input.tagId });
        } catch (_) { /* already assigned - ignore duplicate */ }
        return { success: true };
      }),
    // Remove a tag from a dialog
    remove: protectedProcedure
      .input(z.object({ dialogId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(dialogTags).where(
          and(eq(dialogTags.dialogId, input.dialogId), eq(dialogTags.tagId, input.tagId))
        );
        return { success: true };
      }),
    // Get tags for a specific dialog
    forDialog: protectedProcedure
      .input(z.object({ dialogId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return db.select({ tag: tags })
          .from(dialogTags)
          .innerJoin(tags, eq(dialogTags.tagId, tags.id))
          .where(eq(dialogTags.dialogId, input.dialogId));
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

        const allUsers = await db.select().from(users);
        const accounts = await db.select().from(telegramAccounts);

        // Group accounts by managerId
        const managerMap = new Map<number | null, typeof accounts>();
        for (const acc of accounts) {
          const key = acc.managerId ?? null;
          if (!managerMap.has(key)) managerMap.set(key, []);
          managerMap.get(key)!.push(acc);
        }

        const stats = await Promise.all(Array.from(managerMap.entries()).map(async ([managerId, managerAccounts]) => {
          const accountIds = managerAccounts.map(a => a.id);
          const manager = managerId ? allUsers.find(u => u.id === managerId) : null;
          const name = manager
            ? (manager.name ?? manager.email ?? `Менеджер #${managerId}`)
            : (managerAccounts.length === 1
              ? (managerAccounts[0].firstName ? `${managerAccounts[0].firstName}${managerAccounts[0].lastName ? " " + managerAccounts[0].lastName : ""}` : (managerAccounts[0].phone ?? `Аккаунт #${managerAccounts[0].id}`))
              : `Без менеджера`);

          const inIds = sql`IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`;

          const dialogFilter = since
            ? sql`telegramAccountId ${inIds} AND createdAt >= ${since}`
            : sql`telegramAccountId ${inIds}`;

          const [dialogCount] = await db.execute(
            since
              ? sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}) AND createdAt >= ${since}`
              : sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`
          ) as any;

          const [dealsCount] = await db.execute(
            since
              ? sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}) AND bitrixDealId IS NOT NULL AND createdAt >= ${since}`
              : sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}) AND bitrixDealId IS NOT NULL`
          ) as any;

          const [msgCount] = await db.execute(
            since
              ? sql`SELECT COUNT(*) as cnt FROM messages m INNER JOIN dialogs d ON m.dialogId = d.id WHERE d.telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}) AND m.createdAt >= ${since}`
              : sql`SELECT COUNT(*) as cnt FROM messages m INNER JOIN dialogs d ON m.dialogId = d.id WHERE d.telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`
          ) as any;

          const [unreadCount] = await db.execute(
            sql`SELECT COALESCE(SUM(unreadCount), 0) as total FROM dialogs WHERE telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`
          ) as any;

          const [openCount] = await db.execute(
            sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}) AND status = 'open'`
          ) as any;

          const dlg = Number((dialogCount as any[])[0]?.cnt ?? 0);
          const deals = Number((dealsCount as any[])[0]?.cnt ?? 0);

          return {
            accountId: managerId ?? managerAccounts[0].id,
            managerId,
            name,
            phone: managerAccounts.map(a => a.phone).filter(Boolean).join(", "),
            username: managerAccounts.map(a => a.username ? `@${a.username}` : "").filter(Boolean).join(", "),
            status: managerAccounts.some(a => a.status === "active") ? "active" : managerAccounts[0].status,
            bitrixResponsibleName: managerAccounts[0].bitrixResponsibleName ?? "",
            accountCount: managerAccounts.length,
            dialogs: dlg,
            deals,
            messages: Number((msgCount as any[])[0]?.cnt ?? 0),
            unread: Number((unreadCount as any[])[0]?.total ?? 0),
            openDialogs: Number((openCount as any[])[0]?.cnt ?? 0),
            conversionRate: dlg > 0 ? Math.round((deals / dlg) * 100) : 0,
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

    // Per-user (manager) stats: assigned dialogs, response time, closed
    managerUserStats: protectedProcedure
      .input(z.object({
        period: z.enum(["today", "week", "month", "all"]).default("week"),
        managerId: z.number().optional(),
        tagId: z.number().optional(),
        accountId: z.number().optional(),
        status: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const { users } = await import("../drizzle/schema");

        const now = new Date();
        let since: Date | null = null;
        if (input.period === "today") since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        else if (input.period === "week") since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        else if (input.period === "month") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users);
        const filteredUsers = input.managerId ? allUsers.filter(u => u.id === input.managerId) : allUsers;

        const stats = await Promise.all(filteredUsers.map(async (u) => {
          // Build conditions array with all active filters
          const conds: any[] = [eq(dialogs.assigneeId, u.id)];
          if (since) conds.push(gte(dialogs.createdAt, since));
          if (input.accountId) conds.push(eq(dialogs.telegramAccountId, input.accountId));
          if (input.status) conds.push(sql`${dialogs.status} = ${input.status}`);
          if (input.tagId) conds.push(sql`${dialogs.id} IN (SELECT dialog_id FROM dialog_tags WHERE tag_id = ${input.tagId})`);
          const baseFilter = and(...conds);

          const [assigned] = await db.select({ count: count() }).from(dialogs).where(baseFilter);

          const closedConds = [...conds, sql`${dialogs.status} IN ('resolved','closed')`];
          const [closed] = await db.select({ count: count() }).from(dialogs).where(and(...closedConds));

          const openConds = [...conds, sql`${dialogs.status} NOT IN ('resolved','closed')`];
          const [open] = await db.select({ count: count() }).from(dialogs).where(and(...openConds));

          // Avg first response time in minutes
          const respConds = [...conds, sql`${dialogs.firstResponseAt} IS NOT NULL`];
          const [avgResp] = await db.select({
            avg: sql<number>`AVG(TIMESTAMPDIFF(MINUTE, ${dialogs.createdAt}, ${dialogs.firstResponseAt}))`
          }).from(dialogs).where(and(...respConds));

          const msgConds: any[] = [eq(messages.senderId, u.id), eq(messages.direction, "outgoing")];
          if (since) msgConds.push(gte(messages.createdAt, since));
          const [sentMsgs] = await db.select({ count: count() }).from(messages).where(and(...msgConds));

          return {
            userId: u.id,
            name: u.name ?? u.email ?? `User #${u.id}`,
            role: u.role,
            assigned: Number(assigned?.count ?? 0),
            closed: Number(closed?.count ?? 0),
            open: Number(open?.count ?? 0),
            sentMessages: Number(sentMsgs?.count ?? 0),
            avgResponseMinutes: avgResp?.avg != null ? Math.round(Number(avgResp.avg)) : null,
          };
        }));

        return stats.sort((a, b) => b.assigned - a.assigned);
      }),

    // Summary with period + extra filters
    summaryByPeriod: protectedProcedure
      .input(z.object({
        period: z.enum(["today", "week", "month", "all"]).default("week"),
        managerId: z.number().optional(),
        tagId: z.number().optional(),
        accountId: z.number().optional(),
        status: z.string().optional(),
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

        const dConds: any[] = [];
        if (since) dConds.push(gte(dialogs.createdAt, since));
        if (input.managerId) dConds.push(eq(dialogs.assigneeId, input.managerId));
        if (input.accountId) dConds.push(eq(dialogs.telegramAccountId, input.accountId));
        if (input.status) dConds.push(sql`${dialogs.status} = ${input.status}`);
        if (input.tagId) dConds.push(sql`${dialogs.id} IN (SELECT dialog_id FROM dialog_tags WHERE tag_id = ${input.tagId})`);
        const dialogWhere = dConds.length > 0 ? and(...dConds) : undefined;
        const msgWhere = since ? gte(messages.createdAt, since) : undefined;

        const [totalDialogs] = await db.select({ count: count() }).from(dialogs).where(dialogWhere);
        const dealConds = [...dConds, sql`${dialogs.bitrixDealId} IS NOT NULL`];
        const [totalDeals] = await db.select({ count: count() }).from(dialogs).where(and(...dealConds));
        const [totalMessages] = await db.select({ count: count() }).from(messages).where(msgWhere);
        const [activeAccounts] = await db.select({ count: countDistinct(dialogs.telegramAccountId) }).from(dialogs).where(dialogWhere);

        return {
          totalDialogs: totalDialogs?.count ?? 0,
          totalDeals: totalDeals?.count ?? 0,
          totalMessages: totalMessages?.count ?? 0,
          activeAccounts: activeAccounts?.count ?? 0,
        };
      }),

    // Per-account message activity stats
    accountStats: protectedProcedure
      .input(z.object({
        period: z.enum(["today", "week", "month", "all"]).default("week"),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { stats: [], period: input.period };
        const now = Date.now();
        let fromTs: number | null = null;
        if (input.period === "today") fromTs = new Date().setHours(0, 0, 0, 0);
        else if (input.period === "week") fromTs = now - 7 * 24 * 60 * 60 * 1000;
        else if (input.period === "month") fromTs = now - 30 * 24 * 60 * 60 * 1000;

        const allUsers = await db.select().from(users);
        const accounts = await db.select({
          id: telegramAccounts.id,
          username: telegramAccounts.username,
          firstName: telegramAccounts.firstName,
          lastName: telegramAccounts.lastName,
          status: telegramAccounts.status,
          managerId: telegramAccounts.managerId,
        }).from(telegramAccounts);

        const stats = await Promise.all(accounts.map(async (acc) => {
          const [sentRow] = await db.execute(
            fromTs
              ? sql`SELECT COUNT(*) as cnt FROM messages m WHERE m.dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) AND m.direction = 'outgoing' AND m.createdAt >= ${fromTs}`
              : sql`SELECT COUNT(*) as cnt FROM messages m WHERE m.dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) AND m.direction = 'outgoing'`
          ) as any;
          const [recvRow] = await db.execute(
            fromTs
              ? sql`SELECT COUNT(*) as cnt FROM messages m WHERE m.dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) AND m.direction = 'incoming' AND m.createdAt >= ${fromTs}`
              : sql`SELECT COUNT(*) as cnt FROM messages m WHERE m.dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) AND m.direction = 'incoming'`
          ) as any;
          const [activeRow] = await db.execute(
            fromTs
              ? sql`SELECT COUNT(DISTINCT dialogId) as cnt FROM messages WHERE dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) AND createdAt >= ${fromTs}`
              : sql`SELECT COUNT(DISTINCT dialogId) as cnt FROM messages WHERE dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id})`
          ) as any;
          const [newRow] = await db.execute(
            fromTs
              ? sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId = ${acc.id} AND createdAt >= ${fromTs}`
              : sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId = ${acc.id}`
          ) as any;
          const [needsRow] = await db.execute(
            sql`SELECT COUNT(*) as cnt FROM dialogs WHERE telegramAccountId = ${acc.id} AND status = 'needs_reply'`
          ) as any;
          const [avgRow] = await db.execute(
            fromTs
              ? sql`SELECT AVG(diff) as avg_ms FROM (SELECT MIN(m2.createdAt) - m1.createdAt as diff FROM messages m1 JOIN messages m2 ON m2.dialogId = m1.dialogId AND m2.direction = 'outgoing' AND m2.createdAt > m1.createdAt WHERE m1.direction = 'incoming' AND m1.dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) AND m1.createdAt >= ${fromTs} GROUP BY m1.id) t WHERE diff > 0 AND diff < 86400000`
              : sql`SELECT AVG(diff) as avg_ms FROM (SELECT MIN(m2.createdAt) - m1.createdAt as diff FROM messages m1 JOIN messages m2 ON m2.dialogId = m1.dialogId AND m2.direction = 'outgoing' AND m2.createdAt > m1.createdAt WHERE m1.direction = 'incoming' AND m1.dialogId IN (SELECT id FROM dialogs WHERE telegramAccountId = ${acc.id}) GROUP BY m1.id) t WHERE diff > 0 AND diff < 86400000`
          ) as any;

          const manager = acc.managerId ? allUsers.find(u => u.id === acc.managerId) : null;
          return {
            accountId: acc.id,
            username: acc.username,
            firstName: acc.firstName,
            lastName: acc.lastName,
            status: acc.status,
            managerId: acc.managerId ?? null,
            managerName: manager ? (manager.name ?? manager.email ?? null) : null,
            sent: Number((sentRow as any[])[0]?.cnt ?? 0),
            received: Number((recvRow as any[])[0]?.cnt ?? 0),
            activeDialogs: Number((activeRow as any[])[0]?.cnt ?? 0),
            newDialogs: Number((newRow as any[])[0]?.cnt ?? 0),
            needsReply: Number((needsRow as any[])[0]?.cnt ?? 0),
            avgResponseMs: Number((avgRow as any[])[0]?.avg_ms ?? 0),
          };
        }));

        return { stats, period: input.period };
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
