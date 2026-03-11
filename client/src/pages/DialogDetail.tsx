import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
  StickyNote,
  Phone,
  AtSign,
  MessageSquare,
  Clock,
  UserCheck,
  X,
  ChevronRight,
  Tag,
  Plus,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

function formatDateSeparator(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return "Сегодня";
  if (msgDay.getTime() === yesterday.getTime()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function getAvatarColor(name: string): string {
  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-pink-500"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

type InputMode = "message" | "note";

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
  const [location, setLocation] = useLocation();
  // Preserve account filter when going back: /inbox/123?account=5 → /inbox?account=5
  const searchParams = new URLSearchParams(location.split("?")[1] ?? "");
  const backAccountId = searchParams.get("account");
  const backUrl = backAccountId ? `/inbox?account=${backAccountId}` : "/inbox";
  const [text, setText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("message");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  // SSE real-time
  const { connectionState } = useRealtimeInbox(dialogId);

  const { data: dialogData, refetch: refetchDialog } = trpc.dialogs.get.useQuery({ id: dialogId });
  const { data: msgs, refetch: refetchMsgs } = trpc.messages.list.useQuery({ dialogId });
  const { data: quickReplies } = trpc.quickReplies.list.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery();

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => { setText(""); refetchMsgs(); refetchDialog(); },
    onError: () => toast.error("Не удалось отправить сообщение"),
  });

  const addNoteMutation = trpc.messages.addNote.useMutation({
    onSuccess: () => { setNoteText(""); refetchMsgs(); toast.success("Заметка добавлена"); },
    onError: () => toast.error("Не удалось добавить заметку"),
  });

  const updateStatusMutation = trpc.dialogs.updateStatus.useMutation({
    onSuccess: () => { toast.success("Статус обновлён"); refetchDialog(); },
  });

  const assignMutation = trpc.dialogs.assign.useMutation({
    onSuccess: () => { toast.success("Менеджер назначен"); refetchDialog(); },
    onError: () => toast.error("Ошибка назначения"),
  });

  const summarizeMutation = trpc.dialogs.generateSummary.useMutation({
    onSuccess: () => { toast.success("ИИ-анализ завершён"); refetchDialog(); },
    onError: () => toast.error("Ошибка при анализе"),
  });

  // Tags
  const { data: allTags } = trpc.tags.list.useQuery();
  const { data: dialogTagsData, refetch: refetchDialogTags } = trpc.tags.forDialog.useQuery({ dialogId });
  const assignTagMutation = trpc.tags.assign.useMutation({ onSuccess: () => refetchDialogTags() });
  const removeTagMutation = trpc.tags.remove.useMutation({ onSuccess: () => refetchDialogTags() });
  const assignedTagIds = new Set((dialogTagsData ?? []).map(dt => dt.tag.id));

  // Auto-scroll only when new messages arrive
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
  const assignedUser = allUsers?.find(u => u.id === dialog?.assigneeId);

  const contactName = contact
    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный"
    : "Неизвестный";

  const handleSend = () => {
    if (inputMode === "message") {
      if (!text.trim()) return;
      sendMutation.mutate({ dialogId, text: text.trim() });
    } else {
      if (!noteText.trim()) return;
      addNoteMutation.mutate({ dialogId, text: noteText.trim() });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const avatarColor = getAvatarColor(contactName);

  if (!dialog) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full overflow-hidden">
        {/* ── Main Chat Panel ── */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setLocation(backUrl)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>

            {/* Avatar + name (clickable to open contact panel) */}
            <button
              className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
              onClick={() => setShowContactPanel(v => !v)}
            >
              <div className={`h-8 w-8 rounded-full ${avatarColor} flex items-center justify-center text-white font-black text-sm shrink-0`}>
                {contactName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{contactName}</p>
                {contact?.username && <p className="text-xs text-muted-foreground truncate">@{contact.username}</p>}
              </div>
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${showContactPanel ? "rotate-90" : ""}`} />
            </button>

            {/* Assignee picker */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs shrink-0">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline max-w-20 truncate">
                    {assignedUser ? (assignedUser.name ?? assignedUser.email) : "Назначить"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => assignMutation.mutate({ id: dialogId, assigneeId: null })}>
                  <span className="text-muted-foreground">— Никто</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {allUsers?.map(u => (
                  <DropdownMenuItem
                    key={u.id}
                    onClick={() => assignMutation.mutate({ id: dialogId, assigneeId: u.id })}
                    className={dialog.assigneeId === u.id ? "bg-primary/10 text-primary" : ""}
                  >
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold mr-2">
                      {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{u.name ?? u.email}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border font-medium transition-opacity hover:opacity-80 shrink-0 ${statusColors[dialog.status]}`}>
                  {statusOptions.find(s => s.value === dialog.status)?.label}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {statusOptions.map(opt => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => updateStatusMutation.mutate({ id: dialogId, status: opt.value as any })}
                    className={dialog.status === opt.value ? "bg-primary/10 text-primary" : ""}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => summarizeMutation.mutate({ dialogId })} disabled={summarizeMutation.isPending}>
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  {summarizeMutation.isPending ? "Анализирую..." : "ИИ-анализ"}
                </DropdownMenuItem>
                {dialog.bitrixDealId && (
                  <DropdownMenuItem onClick={() => window.open(`https://bitrix24.ru/crm/deal/details/${dialog.bitrixDealId}/`, "_blank")}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Открыть в Битриксе
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Connection indicator */}
            <div title={connectionState === "connected" ? "Подключено" : "Переподключение..."}>
              {connectionState === "connected"
                ? <Wifi className="h-3.5 w-3.5 text-green-400 shrink-0" />
                : <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-pulse" />
              }
            </div>
          </div>

          {/* AI Summary bar */}
          {dialog.aiSummary && (
            <div className="flex items-start gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/10 shrink-0">
              <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-0.5">
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
              msgs.map((msg, idx) => {
                const isOutgoing = msg.direction === "outgoing";
                const isNote = msg.direction === "note";
                const prevMsg = idx > 0 ? msgs[idx - 1] : null;
                const showDateSep = !prevMsg || !isSameDay(msg.createdAt, prevMsg.createdAt);

                if (isNote) {
                  return (
                    <div key={msg.id}>
                      {showDateSep && (
                        <div className="flex items-center gap-3 my-3">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground px-2 shrink-0">{formatDateSeparator(msg.createdAt)}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <div className="flex justify-center">
                        <div className="max-w-[80%] px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                          <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                          <div>
                            <p className="font-semibold text-amber-400 mb-0.5">Внутренняя заметка</p>
                            <p className="leading-relaxed">{msg.text}</p>
                            <p className="mt-1 opacity-60">{new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const senderLabel = isOutgoing
                  ? null
                  : (msg as any).senderName || contactName;

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 my-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground px-2 shrink-0">{formatDateSeparator(msg.createdAt)}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}>
                      {!isOutgoing && senderLabel && (
                        <span className="text-xs text-muted-foreground font-medium mb-0.5 px-1">{senderLabel}</span>
                      )}
                      <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isOutgoing
                          ? "bg-primary text-primary-foreground rounded-br-sm shadow shadow-primary/20"
                          : "bg-card border border-border rounded-bl-sm"
                      }`}>
                        {msg.text ?? <span className="italic text-xs opacity-60">[медиафайл]</span>}
                        <div className={`flex items-center gap-1 mt-1 ${isOutgoing ? "justify-end" : "justify-start"}`}>
                          <span className="text-xs opacity-50">
                            {new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isOutgoing && <CheckCheck className="h-3 w-3 opacity-50" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies Panel */}
          {showQuickReplies && inputMode === "message" && quickReplies?.length && (
            <div className="border-t border-border bg-card px-4 py-3 max-h-44 overflow-y-auto shrink-0">
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

          {/* Input mode tabs + input */}
          <div className="border-t border-border bg-card/50 shrink-0">
            <div className="flex gap-1 px-4 pt-2">
              <button
                onClick={() => setInputMode("message")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  inputMode === "message"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <MessageSquare className="h-3 w-3" />
                Сообщение
              </button>
              <button
                onClick={() => setInputMode("note")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  inputMode === "note"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <StickyNote className="h-3 w-3" />
                Заметка
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 pb-3 pt-2">
              {inputMode === "message" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 shrink-0 transition-colors ${showQuickReplies ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  title="Быстрые ответы"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              )}
              {inputMode === "message" ? (
                <Input
                  placeholder="Написать сообщение..."
                  className="flex-1 bg-muted border-0 text-sm focus-visible:ring-primary/30"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              ) : (
                <Input
                  placeholder="Внутренняя заметка (видна только менеджерам)..."
                  className="flex-1 bg-amber-500/5 border border-amber-500/20 text-sm focus-visible:ring-amber-500/30 placeholder:text-amber-500/40"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              )}
              <Button
                size="icon"
                className={`h-9 w-9 shrink-0 shadow ${
                  inputMode === "note" ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25" : "shadow-primary/25"
                }`}
                onClick={handleSend}
                disabled={inputMode === "message"
                  ? (!text.trim() || sendMutation.isPending)
                  : (!noteText.trim() || addNoteMutation.isPending)
                }
              >
                {(sendMutation.isPending || addNoteMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : inputMode === "note" ? (
                  <StickyNote className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Contact Info Panel ── */}
        {showContactPanel && (
          <div className="w-72 shrink-0 border-l border-border bg-card/60 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="font-bold text-sm">Контакт</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowContactPanel(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Avatar */}
            <div className="flex flex-col items-center py-6 px-4 border-b border-border">
              <div className={`h-16 w-16 rounded-full ${avatarColor} flex items-center justify-center text-white font-black text-2xl mb-3 shadow-lg`}>
                {contactName.charAt(0).toUpperCase()}
              </div>
              <p className="font-bold text-base text-center">{contactName}</p>
              {contact?.username && <p className="text-sm text-muted-foreground mt-0.5">@{contact.username}</p>}
            </div>

            {/* Contact details */}
            <div className="px-4 py-4 space-y-3 border-b border-border">
              {contact?.phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact?.username && (
                <div className="flex items-center gap-2.5 text-sm">
                  <AtSign className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>@{contact.username}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Первый контакт: {contact?.createdAt ? new Date(contact.createdAt).toLocaleDateString("ru-RU") : "—"}</span>
              </div>
            </div>

            {/* Dialog info */}
            <div className="px-4 py-4 space-y-3 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Диалог</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Статус</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColors[dialog.status]}`}>
                  {statusOptions.find(s => s.value === dialog.status)?.label}
                </span>
              </div>
              {account && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Аккаунт</span>
                  <span className="font-medium truncate max-w-32">@{account.username ?? account.phone}</span>
                </div>
              )}
              {dialog.firstResponseAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Первый ответ</span>
                  <span className="font-medium">{timeAgo(dialog.firstResponseAt)}</span>
                </div>
              )}
              {dialog.bitrixDealId && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Сделка Bitrix</span>
                  <a href={`https://bitrix24.ru/crm/deal/details/${dialog.bitrixDealId}/`} target="_blank" rel="noopener noreferrer"
                    className="text-primary flex items-center gap-1 hover:underline">
                    #{dialog.bitrixDealId} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Assignee */}
            <div className="px-4 py-4 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Ответственный</p>
              {assignedUser ? (
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {(assignedUser.name ?? assignedUser.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{assignedUser.name ?? assignedUser.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{assignedUser.role}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Не назначен</p>
              )}
            </div>

            {/* Tags */}
            <div className="px-4 py-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Теги</p>
              {/* Assigned tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(dialogTagsData ?? []).map(({ tag }) => (
                  <button
                    key={tag.id}
                    onClick={() => removeTagMutation.mutate({ dialogId, tagId: tag.id })}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white group hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: tag.color }}
                    title="Нажмите чтобы удалить"
                  >
                    {tag.name}
                    <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
                {(!dialogTagsData || dialogTagsData.length === 0) && (
                  <p className="text-xs text-muted-foreground">Нет тегов</p>
                )}
              </div>
              {/* Add tag dropdown */}
              {allTags && allTags.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <Plus className="h-3 w-3" />
                      Добавить тег
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {allTags.length === 0 && (
                      <DropdownMenuItem disabled>Нет тегов. Создайте в Настройках.</DropdownMenuItem>
                    )}
                    {allTags.map(tag => (
                      <DropdownMenuItem
                        key={tag.id}
                        onClick={() => assignTagMutation.mutate({ dialogId, tagId: tag.id })}
                        className={assignedTagIds.has(tag.id) ? "opacity-40 pointer-events-none" : ""}
                      >
                        <div className="h-3 w-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: tag.color }} />
                        <span className="flex-1">{tag.name}</span>
                        {assignedTagIds.has(tag.id) && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {(!allTags || allTags.length === 0) && (
                <p className="text-xs text-muted-foreground">Создайте теги в Настройках → Теги</p>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
