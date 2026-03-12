/**
 * TeleDesk — Server-Sent Events bus
 *
 * Any server code can call `emitInboxEvent(payload)` to instantly push
 * a notification to all connected browser clients.
 *
 * Browser clients connect to GET /api/events and receive a stream of
 * JSON-encoded events.
 */

import type { Request, Response } from "express";
import { verifyToken, AUTH_COOKIE_NAME } from "./authService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxEvent =
  | { type: "new_message"; dialogId: number; accountId: number }
  | { type: "new_dialog"; dialogId: number; accountId: number }
  | { type: "sync_progress"; accountId: number; username: string | null; status: "connecting" | "syncing" | "done" | "error"; dialogs?: number; error?: string }
  | { type: "sync_complete"; totalSynced: number; totalErrors: number; accounts: { id: number; username: string | null; dialogs: number; error?: string }[] }
  | { type: "ping" };

// ─── Connected clients registry ───────────────────────────────────────────────

const clients = new Set<Response>();

// ─── Emit to all connected clients ───────────────────────────────────────────

export function emitInboxEvent(event: InboxEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of Array.from(clients)) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
}

// ─── SSE HTTP handler (register as GET /api/events) ──────────────────────────

export async function sseHandler(req: Request, res: Response): Promise<void> {
  // BUG-10 FIX: require valid session cookie before allowing SSE subscription
  // Previously: any unauthenticated user could subscribe and receive all inbox events
  const token = (req as any).cookies?.[AUTH_COOKIE_NAME];
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send an initial ping so the browser knows the connection is live
  res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

  clients.add(res);

  // Keep-alive ping every 25 s (prevents proxy timeouts)
  const keepAlive = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    } catch {
      clearInterval(keepAlive);
      clients.delete(res);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}
