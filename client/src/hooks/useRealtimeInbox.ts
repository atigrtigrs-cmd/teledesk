/**
 * useRealtimeInbox
 *
 * Connects to the server's SSE endpoint (/api/events) and invalidates
 * the relevant tRPC queries whenever a new message or dialog arrives.
 * This gives Telegram-like instant updates without polling.
 */

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export function useRealtimeInbox(dialogId?: number) {
  const utils = trpc.useUtils();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      setConnectionState("connecting");

      const es = new EventSource("/api/events");
      esRef.current = es;

      es.onopen = () => {
        if (!destroyed) setConnectionState("connected");
      };

      es.onmessage = (event) => {
        if (destroyed) return;
        try {
          const data = JSON.parse(event.data) as {
            type: string;
            dialogId?: number;
            accountId?: number;
          };

          if (data.type === "ping") return;

          if (data.type === "new_dialog") {
            // New chat appeared — refresh the full dialog list
            utils.dialogs.list.invalidate();
          } else if (data.type === "new_message") {
            // Existing chat got a new message — refresh list preview
            utils.dialogs.list.invalidate();

            // If we're currently viewing this dialog, also refresh messages
            if (dialogId !== undefined && data.dialogId === dialogId) {
              utils.messages.list.invalidate({ dialogId });
              utils.dialogs.get.invalidate({ id: dialogId });
            }
          }
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        if (destroyed) return;
        setConnectionState("disconnected");
        es.close();
        esRef.current = null;
        // Reconnect after 3 s
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [dialogId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connectionState };
}
