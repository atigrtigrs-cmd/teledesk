import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import {
  ArrowLeft,
  Send,
  MoreVertical,
  Zap,
  Bot,
  CheckCheck,
  Loader2,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

const statusOptions = [
  { value: "open", label: "Открыт" },
  { value: "in_progress", label: "В работе" },
  { value: "waiting", label: "Ожидает" },
  { value: "resolved", label: "Решён" },
  { value: "closed", label: "Закрыт" },
];

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  waiting: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  resolved: "bg-green-500/10 text-green-400 border-green-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

export default function DialogDetail() {
  const params = useParams<{ id: string }>();
  const dialogId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const [text, setText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const prevMsgCountRef = useRef(0);

  // SSE real-time — no polling, instant updates
  const { connectionState } = useRealtimeInbox(dialogId);

  const { data: dialogData, refetch: refetchDialog } = trpc.dialogs.get.useQuery({ id: dialogId });
  const { data: msgs, refetch: refetchMsgs } = trpc.messages.list.useQuery({ dialogId });
  const { data: quickReplies } = trpc.quickReplies.list.useQuery();

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => { setText(""); refetchMsgs(); refetchDialog(); },
    onError: () => toast.error("Не удалось отправить сообщение"),
  });

  const updateStatusMutation = trpc.dialogs.updateStatus.useMutation({
    onSuccess: () => { toast.success("Статус обновлён"); refetchDialog(); },
  });

  const summarizeMutation = trpc.dialogs.generateSummary.useMutation({
    onSuccess: () => { toast.success("ИИ-анализ завершён"); refetchDialog(); },
    onError: () => toast.error("Ошибка при анализе"),
  });

  // Auto-scroll only when new messages arrive (count increases)
  useEffect(() => {
    if (!msgs) return;
    if (msgs.length > prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = msgs.length;
  }, [msgs]);

  const dialog = dialogData?.dialog;
  const contact = dialogData?.contact;
  const account = dialogData?.account;

  const contactName = contact
    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный"
    : "Неизвестный";

  const handleSend = () => {
    if (!text.trim()) return;
    sendMutation.mutate({ dialogId, text: text.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-0px)]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card/80 backdrop-blur-sm">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setLocation("/inbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-black text-sm shrink-0 shadow shadow-primary/25">
            {contactName.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{contactName}</p>
            <p className="text-xs text-muted-foreground">
              {contact?.username ? `@${contact.username}` : contact?.phone ?? "—"}
              {account && ` · @${account.username ?? account.phone}`}
            </p>
            {connectionState === "connected" ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                <Wifi className="h-2.5 w-2.5" /> Live
              </span>
            ) : connectionState === "disconnected" ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-orange-400">
                <WifiOff className="h-2.5 w-2.5" /> Оффлайн
              </span>
            ) : null}
          </div>

          {/* Status dropdown */}
          {dialog && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border font-medium transition-opacity hover:opacity-80 ${statusColors[dialog.status]}`}>
                  {statusOptions.find(s => s.value === dialog.status)?.label}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {statusOptions.map(opt => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => updateStatusMutation.mutate({ id: dialogId, status: opt.value as any })}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* More actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => summarizeMutation.mutate({ dialogId })}
                disabled={summarizeMutation.isPending}
              >
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                {summarizeMutation.isPending ? "Анализирую..." : "ИИ-анализ диалога"}
              </DropdownMenuItem>
              {dialog?.bitrixDealId && (
                <DropdownMenuItem>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Открыть сделку в Битриксе
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* AI Summary bar */}
        {dialog?.aiSummary && (
          <div className="px-4 py-3 bg-primary/6 border-b border-primary/15 flex items-start gap-2.5">
            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3 w-3 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary mb-0.5">ИИ-резюме</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{dialog.aiSummary}</p>
            </div>
            {dialog.sentiment && (
              <span className={`text-xs font-medium shrink-0 px-2 py-0.5 rounded-full border ${
                dialog.sentiment === "positive" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                dialog.sentiment === "negative" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                "bg-muted text-muted-foreground border-border"
              }`}>
                {dialog.sentiment === "positive" ? "😊 Позитив" :
                 dialog.sentiment === "negative" ? "😟 Негатив" : "😐 Нейтрально"}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {!msgs?.length ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Нет сообщений</p>
            </div>
          ) : (
            msgs.map(msg => {
              const isOutgoing = msg.direction === "outgoing";
              return (
                <div key={msg.id} className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isOutgoing
                      ? "bg-primary text-primary-foreground rounded-br-sm shadow shadow-primary/20"
                      : "bg-card border border-border rounded-bl-sm"
                  }`}>
                    {msg.text ?? (
                      <span className="italic text-xs opacity-60">[медиафайл]</span>
                    )}
                    <div className={`flex items-center gap-1 mt-1 ${isOutgoing ? "justify-end" : "justify-start"}`}>
                      <span className="text-xs opacity-50">
                        {new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isOutgoing && <CheckCheck className="h-3 w-3 opacity-50" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies Panel */}
        {showQuickReplies && quickReplies?.length && (
          <div className="border-t border-border bg-card px-4 py-3 max-h-44 overflow-y-auto">
            <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2.5">Быстрые ответы</p>
            <div className="flex flex-wrap gap-2">
              {quickReplies.map(qr => (
                <button
                  key={qr.id}
                  onClick={() => { setText(qr.text); setShowQuickReplies(false); }}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground text-xs text-left transition-all border border-border hover:border-primary/30 group"
                >
                  <span className="font-bold">{qr.title}</span>
                  <span className="text-muted-foreground group-hover:text-primary-foreground/70 ml-1 truncate">— {qr.text.substring(0, 35)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-border bg-card/50">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 shrink-0 transition-colors ${showQuickReplies ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
              onClick={() => setShowQuickReplies(!showQuickReplies)}
              title="Быстрые ответы"
            >
              <Zap className="h-4 w-4" />
            </Button>
            <Input
              placeholder="Написать сообщение..."
              className="flex-1 bg-muted border-0 text-sm focus-visible:ring-primary/30"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 shadow shadow-primary/25"
              onClick={handleSend}
              disabled={!text.trim() || sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
