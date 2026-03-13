import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Send,
  MoreVertical,
  Zap,
  Bot,
  CheckCheck,
  Loader2,
  StickyNote,
  Phone,
  AtSign,
  MessageSquare,
  Clock,
  UserCheck,
  X,
  ChevronDown,
  Sparkles,
  Wifi,
  WifiOff,
  Tag,
  Plus,
  ExternalLink,
  Filter,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────
type StatusFilter = "all" | "open" | "in_progress" | "waiting" | "needs_reply" | "resolved" | "closed" | "archived";
type InputMode = "message" | "note";

// ─── Status config ──────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  open: { label: "Открыт", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400" },
  in_progress: { label: "В работе", color: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" },
  waiting: { label: "Ожидает", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
  resolved: { label: "Решён", color: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-400" },
  closed: { label: "Закрыт", color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  needs_reply: { label: "Ответить", color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
  archived: { label: "Архив", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-500" },
};

const statusFilters: { label: string; value: StatusFilter }[] = [
  { label: "Все", value: "all" },
  { label: "Ответить", value: "needs_reply" },
  { label: "Открытые", value: "open" },
  { label: "В работе", value: "in_progress" },
  { label: "Ожидают", value: "waiting" },
  { label: "Решённые", value: "resolved" },
  { label: "Архив", value: "archived" },
];

const statusOptions = [
  { value: "open", label: "Открыт" },
  { value: "in_progress", label: "В работе" },
  { value: "waiting", label: "Ожидает" },
  { value: "needs_reply", label: "Ответить" },
  { value: "resolved", label: "Решён" },
  { value: "closed", label: "Закрыт" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-pink-500", "bg-primary",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getContactName(contact: { firstName?: string | null; lastName?: string | null; username?: string | null } | null) {
  if (!contact) return "Неизвестный";
  return `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный";
}

function formatTime(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "сейчас";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diff < 86400 * 365) return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

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

// ─── Avatar Component ──────────────────────────────────────────────────────
function ContactAvatar({ contact, name, size = "sm" }: {
  contact: { avatarUrl?: string | null; firstName?: string | null; lastName?: string | null; username?: string | null } | null | undefined;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const avatarUrl = contact?.avatarUrl;
  const avatarColor = getAvatarColor(name);
  const sizeClasses = size === "lg" ? "h-14 w-14 text-xl" : size === "md" ? "h-9 w-9 text-sm" : "h-8 w-8 text-sm";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses} rounded-full object-cover shrink-0`}
        onError={(e) => {
          // Fallback to initials on load error
          const target = e.currentTarget;
          target.style.display = "none";
          target.nextElementSibling?.classList.remove("hidden");
        }}
      />
    );
  }

  return (
    <div className={`${sizeClasses} rounded-full ${avatarColor} flex items-center justify-center text-white font-bold shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// Wrapper that shows img with hidden fallback div
function AvatarWithFallback({ contact, name, size = "sm", className = "" }: {
  contact: { avatarUrl?: string | null; firstName?: string | null; lastName?: string | null; username?: string | null } | null | undefined;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const avatarUrl = contact?.avatarUrl;
  const avatarColor = getAvatarColor(name);
  const sizeClasses = size === "lg" ? "h-14 w-14 text-xl" : size === "md" ? "h-9 w-9 text-sm" : "h-8 w-8 text-sm";

  return (
    <div className={`relative shrink-0 ${className}`}>
      {avatarUrl ? (
        <>
          <img
            src={avatarUrl}
            alt={name}
            className={`${sizeClasses} rounded-full object-cover`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const fb = e.currentTarget.nextElementSibling as HTMLElement;
              if (fb) fb.style.display = "flex";
            }}
          />
          <div className={`${sizeClasses} rounded-full ${avatarColor} items-center justify-center text-white font-bold`} style={{ display: "none" }}>
            {name.charAt(0).toUpperCase()}
          </div>
        </>
      ) : (
        <div className={`${sizeClasses} rounded-full ${avatarColor} flex items-center justify-center text-white font-bold`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Messages() {
  const { user } = useAuth();
  const [selectedDialogId, setSelectedDialogId] = useState<number | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // SSE real-time
  const { connectionState } = useRealtimeInbox(selectedDialogId ?? undefined);

  // Data queries
  const { data: allAccounts } = trpc.accounts.list.useQuery();
  const { data: dialogsData, isLoading: dialogsLoading } = trpc.dialogs.list.useQuery(
    {
      status: statusFilter,
      search: search || undefined,
      telegramAccountId: selectedAccountId,
    },
    { refetchInterval: 30_000 }
  );

  // Sync
  const syncAll = trpc.accounts.syncAll.useMutation({
    onSuccess: (res) => toast.info(res.message, { duration: 5000 }),
    onError: (err) => toast.error(`Ошибка: ${err.message}`),
  });

  return (
    <div className="flex h-full">
      {/* ── Column 1: Dialog List ── */}
      <DialogList
        dialogs={dialogsData ?? []}
        loading={dialogsLoading}
        selectedId={selectedDialogId}
        onSelect={(id) => { setSelectedDialogId(id); setShowContactPanel(false); }}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        selectedAccountId={selectedAccountId}
        onAccountChange={setSelectedAccountId}
        accounts={allAccounts ?? []}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(v => !v)}
        connectionState={connectionState}
        onSync={() => syncAll.mutate()}
        isSyncing={syncAll.isPending}
      />

      {/* ── Column 2: Chat View ── */}
      {selectedDialogId ? (
        <ChatView
          dialogId={selectedDialogId}
          connectionState={connectionState}
          onToggleContact={() => setShowContactPanel(v => !v)}
          showContactPanel={showContactPanel}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Выберите диалог</p>
          </div>
        </div>
      )}

      {/* ── Column 3: Contact Info Panel ── */}
      {selectedDialogId && showContactPanel && (
        <ContactPanel
          dialogId={selectedDialogId}
          onClose={() => setShowContactPanel(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dialog List (Column 1)
// ═══════════════════════════════════════════════════════════════════════════════
function DialogList({
  dialogs,
  loading,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  selectedAccountId,
  onAccountChange,
  accounts,
  showFilters,
  onToggleFilters,
  connectionState,
  onSync,
  isSyncing,
}: {
  dialogs: any[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  selectedAccountId: number | undefined;
  onAccountChange: (v: number | undefined) => void;
  accounts: any[];
  showFilters: boolean;
  onToggleFilters: () => void;
  connectionState: string;
  onSync: () => void;
  isSyncing: boolean;
}) {
  return (
    <div className="w-[320px] shrink-0 border-r border-border flex flex-col bg-[oklch(0.11_0.006_240)]">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold">Сообщения</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Синхронизировать"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onToggleFilters}
              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
                showFilters ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title="Фильтры"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
            {/* Connection dot */}
            <div
              className={`h-2 w-2 rounded-full ${connectionState === "connected" ? "bg-green-400" : "bg-muted-foreground animate-pulse"}`}
              title={connectionState === "connected" ? "Подключено" : "Переподключение..."}
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Поиск..."
            className="h-8 pl-8 text-sm bg-muted/30 border-0 focus-visible:ring-primary/30"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mt-2 overflow-x-auto pb-1 scrollbar-none">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => onStatusFilterChange(f.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Extended filters */}
        {showFilters && (
          <div className="mt-2 space-y-2">
            <Select
              value={selectedAccountId?.toString() ?? "all"}
              onValueChange={(v) => onAccountChange(v === "all" ? undefined : parseInt(v))}
            >
              <SelectTrigger className="h-8 text-xs bg-muted/30 border-0">
                <SelectValue placeholder="Все аккаунты" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все аккаунты</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id.toString()}>
                    @{acc.username ?? acc.phone ?? `#${acc.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Dialog list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dialogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">Нет диалогов</p>
          </div>
        ) : (
          dialogs.map(({ dialog, contact, account }) => {
            const name = getContactName(contact);
            const isSelected = dialog.id === selectedId;
            const avatarColor = getAvatarColor(name);
            const status = statusConfig[dialog.status];
            const hasUnread = (dialog.unreadCount ?? 0) > 0;

            return (
              <button
                key={dialog.id}
                onClick={() => onSelect(dialog.id)}
                className={`w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover:bg-muted/20 border-l-2 border-transparent"
                }`}
              >
                {/* Avatar */}
                <AvatarWithFallback contact={contact} name={name} size="md" className="mt-0.5" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm truncate ${hasUnread ? "font-bold" : "font-medium"}`}>
                      {name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatTime(dialog.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className={`text-xs truncate ${hasUnread ? "text-foreground/80" : "text-muted-foreground"}`}>
                      {dialog.lastMessageText ?? "—"}
                    </p>
                    {hasUnread && (
                      <span className="h-4.5 min-w-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                        {dialog.unreadCount > 99 ? "99+" : dialog.unreadCount}
                      </span>
                    )}
                  </div>
                  {/* Account + status */}
                  <div className="flex items-center gap-1.5 mt-1">
                    {account?.username && (
                      <span className="text-[10px] text-muted-foreground/60 truncate">
                        @{account.username}
                      </span>
                    )}
                    {status && (
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium border ${status.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chat View (Column 2)
// ═══════════════════════════════════════════════════════════════════════════════
function ChatView({
  dialogId,
  connectionState,
  onToggleContact,
  showContactPanel,
}: {
  dialogId: number;
  connectionState: string;
  onToggleContact: () => void;
  showContactPanel: boolean;
}) {
  const [text, setText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("message");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  const { data: dialogData, refetch: refetchDialog } = trpc.dialogs.get.useQuery({ id: dialogId });
  const { data: msgs, refetch: refetchMsgs } = trpc.messages.list.useQuery({ dialogId });
  const { data: quickReplies } = trpc.quickReplies.list.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery();

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => { setText(""); refetchMsgs(); refetchDialog(); },
    onError: () => toast.error("Не удалось отправить"),
  });

  const addNoteMutation = trpc.messages.addNote.useMutation({
    onSuccess: () => { setNoteText(""); refetchMsgs(); toast.success("Заметка добавлена"); },
    onError: () => toast.error("Ошибка"),
  });

  const updateStatusMutation = trpc.dialogs.updateStatus.useMutation({
    onSuccess: () => { toast.success("Статус обновлён"); refetchDialog(); },
  });

  const assignMutation = trpc.dialogs.assign.useMutation({
    onSuccess: () => { toast.success("Назначен"); refetchDialog(); },
  });

  const summarizeMutation = trpc.dialogs.generateSummary.useMutation({
    onSuccess: () => { toast.success("ИИ-анализ готов"); refetchDialog(); },
    onError: () => toast.error("Ошибка анализа"),
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (!msgs) return;
    if (msgs.length > prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = msgs.length;
  }, [msgs]);

  // Reset on dialog change
  useEffect(() => {
    setText("");
    setNoteText("");
    setInputMode("message");
    setShowQuickReplies(false);
    prevMsgCountRef.current = 0;
  }, [dialogId]);

  const dialog = dialogData?.dialog;
  const contact = dialogData?.contact;
  const account = dialogData?.account;
  const assignedUser = allUsers?.find(u => u.id === dialog?.assigneeId);

  const contactName = contact
    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный"
    : "Неизвестный";

  const avatarColor = getAvatarColor(contactName);

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

  if (!dialog) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusCfg = statusConfig[dialog.status];

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
        {/* Contact info clickable */}
        <button
          onClick={onToggleContact}
          className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
        >
          <AvatarWithFallback contact={contact} name={contactName} size="sm" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{contactName}</p>
            <div className="flex items-center gap-1.5">
              {contact?.username && <span className="text-xs text-muted-foreground">@{contact.username}</span>}
              {account?.username && <span className="text-[10px] text-muted-foreground/50">via @{account.username}</span>}
            </div>
          </div>
        </button>

        {/* Assignee */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0">
              <UserCheck className="h-3.5 w-3.5" />
              <span className="hidden lg:inline max-w-16 truncate">
                {assignedUser ? (assignedUser.name ?? "—") : "Назначить"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
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
                {u.name ?? u.email}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium shrink-0 ${statusCfg?.color ?? ""}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg?.dot ?? ""}`} />
              {statusCfg?.label ?? dialog.status}
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
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => summarizeMutation.mutate({ dialogId })} disabled={summarizeMutation.isPending}>
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
              {summarizeMutation.isPending ? "Анализирую..." : "ИИ-анализ"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Connection */}
        <div title={connectionState === "connected" ? "Подключено" : "Переподключение..."}>
          {connectionState === "connected"
            ? <Wifi className="h-3.5 w-3.5 text-green-400 shrink-0" />
            : <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-pulse" />
          }
        </div>
      </div>

      {/* AI Summary */}
      {dialog.aiSummary && (
        <div className="flex items-start gap-2.5 px-4 py-2 bg-primary/5 border-b border-primary/10 shrink-0">
          <Bot className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary mb-0.5">ИИ-резюме</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{dialog.aiSummary}</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
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
                  {showDateSep && <DateSeparator date={msg.createdAt} />}
                  <div className="flex justify-center my-1">
                    <div className="max-w-[80%] px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                      <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="font-semibold text-amber-400 text-[10px]">Заметка</p>
                        <p className="leading-relaxed">{msg.text}</p>
                        <p className="mt-0.5 opacity-60 text-[10px]">{new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const senderLabel = isOutgoing ? null : (msg as any).senderName || contactName;

            return (
              <div key={msg.id}>
                {showDateSep && <DateSeparator date={msg.createdAt} />}
                <div className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}>
                  {!isOutgoing && senderLabel && (
                    <span className="text-[10px] text-muted-foreground font-medium mb-0.5 px-1">{senderLabel}</span>
                  )}
                  <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isOutgoing
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm"
                  }`}>
                    {msg.text ?? <span className="italic text-xs opacity-60">[медиафайл]</span>}
                    <div className={`flex items-center gap-1 mt-0.5 ${isOutgoing ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] opacity-50">
                        {new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isOutgoing && <CheckCheck className="h-2.5 w-2.5 opacity-50" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && inputMode === "message" && quickReplies?.length && (
        <div className="border-t border-border bg-card px-4 py-2.5 max-h-36 overflow-y-auto shrink-0">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Быстрые ответы</p>
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map(qr => (
              <button
                key={qr.id}
                onClick={() => { setText(qr.text); setShowQuickReplies(false); }}
                className="px-2.5 py-1 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground text-xs transition-all border border-border hover:border-primary/30"
              >
                <span className="font-bold">{qr.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border bg-card/30 shrink-0">
        <div className="flex gap-1 px-4 pt-2">
          <button
            onClick={() => setInputMode("message")}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "message" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Сообщение
          </button>
          <button
            onClick={() => setInputMode("note")}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all ${
              inputMode === "note" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <StickyNote className="h-3 w-3" />
            Заметка
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3 pt-1.5">
          {inputMode === "message" && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 ${showQuickReplies ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
              onClick={() => setShowQuickReplies(!showQuickReplies)}
              title="Быстрые ответы"
            >
              <Zap className="h-4 w-4" />
            </Button>
          )}
          {inputMode === "message" ? (
            <Input
              placeholder="Написать сообщение..."
              className="flex-1 h-9 bg-muted/30 border-0 text-sm focus-visible:ring-primary/30"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <Input
              placeholder="Внутренняя заметка..."
              className="flex-1 h-9 bg-amber-500/5 border border-amber-500/20 text-sm focus-visible:ring-amber-500/30"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
          <Button
            size="icon"
            className={`h-9 w-9 shrink-0 ${inputMode === "note" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
            onClick={handleSend}
            disabled={inputMode === "message" ? (!text.trim() || sendMutation.isPending) : (!noteText.trim() || addNoteMutation.isPending)}
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
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Contact Panel (Column 3)
// ═══════════════════════════════════════════════════════════════════════════════
function ContactPanel({ dialogId, onClose }: { dialogId: number; onClose: () => void }) {
  const { data: dialogData } = trpc.dialogs.get.useQuery({ id: dialogId });
  const { data: allTags } = trpc.tags.list.useQuery();
  const { data: dialogTagsData, refetch: refetchDialogTags } = trpc.tags.forDialog.useQuery({ dialogId });
  const { data: allUsers } = trpc.users.list.useQuery();

  const assignTagMutation = trpc.tags.assign.useMutation({ onSuccess: () => refetchDialogTags() });
  const removeTagMutation = trpc.tags.remove.useMutation({ onSuccess: () => refetchDialogTags() });
  const assignedTagIds = new Set((dialogTagsData ?? []).map(dt => dt.tag.id));

  const dialog = dialogData?.dialog;
  const contact = dialogData?.contact;
  const account = dialogData?.account;
  const assignedUser = allUsers?.find(u => u.id === dialog?.assigneeId);

  const contactName = contact
    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный"
    : "Неизвестный";

  const avatarColor = getAvatarColor(contactName);

  return (
    <div className="w-[280px] shrink-0 border-l border-border bg-[oklch(0.11_0.006_240)] flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <p className="font-semibold text-sm">Контакт</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center py-5 px-4 border-b border-border">
        <AvatarWithFallback contact={contact} name={contactName} size="lg" className="mb-2" />
        <p className="font-bold text-sm text-center">{contactName}</p>
        {contact?.username && <p className="text-xs text-muted-foreground mt-0.5">@{contact.username}</p>}
      </div>

      {/* Contact details */}
      <div className="px-4 py-3 space-y-2.5 border-b border-border">
        {contact?.phone && (
          <div className="flex items-center gap-2 text-xs">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{contact.phone}</span>
          </div>
        )}
        {contact?.username && (
          <div className="flex items-center gap-2 text-xs">
            <AtSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>@{contact.username}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            {contact?.createdAt ? new Date(contact.createdAt).toLocaleDateString("ru-RU") : "—"}
          </span>
        </div>
      </div>

      {/* Dialog info */}
      <div className="px-4 py-3 space-y-2 border-b border-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Диалог</p>
        {account && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Аккаунт</span>
            <span className="font-medium">@{account.username ?? account.phone}</span>
          </div>
        )}
        {assignedUser && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Менеджер</span>
            <span className="font-medium">{assignedUser.name ?? assignedUser.email}</span>
          </div>
        )}
        {dialog?.bitrixDealId && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Bitrix</span>
            <a href={`https://bitrix24.ru/crm/deal/details/${dialog.bitrixDealId}/`} target="_blank" rel="noopener noreferrer"
              className="text-primary flex items-center gap-1 hover:underline">
              #{dialog.bitrixDealId} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Теги</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {(dialogTagsData ?? []).map(({ tag }) => (
            <button
              key={tag.id}
              onClick={() => removeTagMutation.mutate({ dialogId, tagId: tag.id })}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white group hover:opacity-80"
              style={{ backgroundColor: tag.color }}
              title="Удалить тег"
            >
              {tag.name}
              <X className="h-2 w-2 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
          {(!dialogTagsData || dialogTagsData.length === 0) && (
            <p className="text-xs text-muted-foreground">Нет тегов</p>
          )}
        </div>
        {allTags && allTags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px]">
                <Plus className="h-3 w-3" />
                Добавить
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {allTags.map(tag => (
                <DropdownMenuItem
                  key={tag.id}
                  onClick={() => assignTagMutation.mutate({ dialogId, tagId: tag.id })}
                  className={assignedTagIds.has(tag.id) ? "opacity-40 pointer-events-none" : ""}
                >
                  <div className="h-2.5 w-2.5 rounded-full mr-2 shrink-0" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Date Separator
// ═══════════════════════════════════════════════════════════════════════════════
function DateSeparator({ date }: { date: Date | string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground px-2 shrink-0">{formatDateSeparator(date)}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
