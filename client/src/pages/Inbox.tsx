import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import {
  MessageSquare,
  Search,
  Loader2,
  Wifi,
  WifiOff,
  Tag,
  Bot,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  UserCheck,
  UserX,
  RefreshCw,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type StatusFilter = "all" | "open" | "in_progress" | "waiting" | "needs_reply" | "resolved" | "closed" | "archived";
type DialogStatus = "open" | "in_progress" | "waiting" | "needs_reply" | "resolved" | "closed" | "archived";

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  open: { label: "Открыт", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400" },
  in_progress: { label: "В работе", color: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" },
  waiting: { label: "Ожидает", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
  resolved: { label: "Решён", color: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-400" },
  closed: { label: "Закрыт", color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  needs_reply: { label: "Требует ответа", color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
  archived: { label: "Архив", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-500" },
};

const bulkStatusOptions: { label: string; value: DialogStatus; dot: string }[] = [
  { label: "Открыт", value: "open", dot: "bg-blue-400" },
  { label: "В работе", value: "in_progress", dot: "bg-primary" },
  { label: "Ожидает", value: "waiting", dot: "bg-orange-400" },
  { label: "Решён", value: "resolved", dot: "bg-green-400" },
  { label: "Закрыт", value: "closed", dot: "bg-muted-foreground" },
  { label: "Требует ответа", value: "needs_reply", dot: "bg-red-400" },
  { label: "Архив", value: "archived", dot: "bg-zinc-500" },
];

const sentimentConfig: Record<string, { emoji: string; color: string }> = {
  positive: { emoji: "😊", color: "text-green-400" },
  neutral: { emoji: "😐", color: "text-muted-foreground" },
  negative: { emoji: "😟", color: "text-red-400" },
};

const filters: { label: string; value: StatusFilter }[] = [
  { label: "Все", value: "all" },
  { label: "Требует ответа", value: "needs_reply" },
  { label: "Открытые", value: "open" },
  { label: "В работе", value: "in_progress" },
  { label: "Ожидают", value: "waiting" },
  { label: "Решённые", value: "resolved" },
  { label: "Архив", value: "archived" },
];

function formatDate(date: Date | null | undefined): { short: string; full: string } {
  if (!date) return { short: "—", full: "—" };
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  const full = d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  let short: string;
  if (diff < 60) {
    short = "только что";
  } else if (diff < 3600) {
    short = `${Math.floor(diff / 60)} мин`;
  } else if (diff < 86400) {
    // today — show time
    short = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } else if (diff < 86400 * 365) {
    // this year — show day.month time
    short = d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } else {
    // older — show full date
    short = d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return { short, full };
}

const AVATAR_COLORS = [
  "bg-primary", "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-pink-500",
];

function getAvatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function Inbox() {
  const [location, setLocation] = useLocation();
  // Restore account filter from URL query param (e.g. /inbox?account=5)
  const urlSearchParams = new URLSearchParams(location.split("?")[1] ?? "");
  const urlAccountId = urlSearchParams.get("account") ? parseInt(urlSearchParams.get("account")!) : undefined;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [selectedTagId, setSelectedTagId] = useState<number | undefined>(undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(urlAccountId);
  const { user } = useAuth();

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // SSE real-time connection — no polling needed
  const { connectionState } = useRealtimeInbox();
  const { data: allTags } = trpc.tags.list.useQuery();
  const { data: allAccounts } = trpc.accounts.list.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery();

  const utils = trpc.useUtils();

  const assigneeId = assigneeFilter === "mine" ? user?.id : undefined;
  const { data, isLoading } = trpc.dialogs.list.useQuery({
    status: statusFilter,
    search: search || undefined,
    assigneeId,
    tagId: selectedTagId,
    telegramAccountId: selectedAccountId,
  });

  // Sync all accounts mutation
  const syncAll = trpc.accounts.syncAll.useMutation({
    onSuccess: (res) => {
      if (res.errors > 0 && res.synced === 0) {
        // All accounts failed — show as error with details
        toast.error(res.message, {
          description: res.details || undefined,
          duration: 10000,
        });
      } else if (res.errors > 0) {
        // Partial success
        toast.warning(res.message, {
          description: res.details || undefined,
          duration: 8000,
        });
      } else {
        toast.success(res.message, {
          description: res.details || undefined,
          duration: 6000,
        });
      }
      utils.dialogs.list.invalidate();
      utils.accounts.list.invalidate();
    },
    onError: (err) => toast.error(`Ошибка синхронизации: ${err.message}`),
  });

  // Bulk mutations
  const bulkUpdateStatus = trpc.dialogs.bulkUpdateStatus.useMutation({
    onSuccess: (res) => {
      toast.success(`Статус изменён для ${res.updated} диалогов`);
      utils.dialogs.list.invalidate();
      clearSelection();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkAssign = trpc.dialogs.bulkAssign.useMutation({
    onSuccess: (res) => {
      toast.success(`Назначено для ${res.updated} диалогов`);
      utils.dialogs.list.invalidate();
      clearSelection();
    },
    onError: (err) => toast.error(err.message),
  });

  // Filter unassigned client-side
  const filteredData = assigneeFilter === "unassigned"
    ? (data ?? []).filter(r => !r.dialog.assigneeId)
    : (data ?? []);

  const allIds = filteredData.map(r => r.dialog.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }, [allSelected, allIds]);

  const toggleSelect = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  // Build account display name
  function accountName(acc: { firstName?: string | null; lastName?: string | null; username?: string | null; phone?: string | null; id: number }) {
    if (acc.firstName || acc.lastName) {
      return `${acc.firstName ?? ""} ${acc.lastName ?? ""}`.trim();
    }
    if (acc.username) return `@${acc.username}`;
    if (acc.phone) return acc.phone;
    return `Аккаунт #${acc.id}`;
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full relative">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Сообщения</p>
              <h1 className="text-2xl font-black tracking-tight">Входящие</h1>
            </div>
            <div className="flex items-center gap-2">
              {connectionState === "connected" ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                  <Wifi className="h-3 w-3" />
                  Live
                </span>
              ) : connectionState === "connecting" ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Подключение...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                  <WifiOff className="h-3 w-3" />
                  Оффлайн
                </span>
              )}
              <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1.5 rounded-full border border-border">
                {filteredData?.length ?? 0} диалогов
              </span>
              {/* Refresh all incoming messages button */}
              <button
                onClick={() => syncAll.mutate()}
                disabled={syncAll.isPending}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                  syncAll.isPending
                    ? "bg-primary/20 text-primary border-primary/30 cursor-wait"
                    : "bg-muted text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                }`}
                title="Подгрузить все диалоги всех Telegram-аккаунтов"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncAll.isPending ? 'animate-spin' : ''}`} />
                {syncAll.isPending ? "Синхронизация..." : "Обновить"}
              </button>
              {/* Bulk mode toggle */}
              <button
                onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                  bulkMode
                    ? "bg-primary text-primary-foreground border-primary shadow shadow-primary/30"
                    : "bg-muted text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                }`}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Выбрать
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или @username..."
              className="pl-9 h-9 text-sm bg-muted border-0 focus-visible:ring-primary/30"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Status filters + assignee filter + account filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Select all checkbox (shown in bulk mode) */}
            {bulkMode && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {allSelected
                  ? <CheckSquare className="h-4 w-4 text-primary" />
                  : <Square className="h-4 w-4" />
                }
                Все
              </button>
            )}
            <div className="flex gap-1.5 flex-wrap flex-1">
              {filters.map(f => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground shadow shadow-primary/30"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Select value={assigneeFilter} onValueChange={(v) => setAssigneeFilter(v as typeof assigneeFilter)}>
              <SelectTrigger className="h-7 w-36 text-xs border-border bg-muted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все менеджеры</SelectItem>
                <SelectItem value="mine">Мои диалоги</SelectItem>
                <SelectItem value="unassigned">Без менеджера</SelectItem>
              </SelectContent>
            </Select>
            {/* Telegram account filter */}
            {allAccounts && allAccounts.length > 0 && (
              <Select
                value={selectedAccountId !== undefined ? String(selectedAccountId) : "all"}
                onValueChange={(v) => setSelectedAccountId(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="h-7 w-44 text-xs border-border bg-muted">
                  <Bot className="h-3 w-3 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Все аккаунты" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все аккаунты</SelectItem>
                  {allAccounts.map(acc => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {accountName(acc)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tag filters */}
          {allTags && allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
              <button
                onClick={() => setSelectedTagId(undefined)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all ${
                  selectedTagId === undefined
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                Все
              </button>
              {allTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTagId(selectedTagId === tag.id ? undefined : tag.id)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all ${
                    selectedTagId === tag.id ? "text-white" : "bg-muted text-muted-foreground hover:opacity-80"
                  }`}
                  style={selectedTagId === tag.id ? { backgroundColor: tag.color } : {}}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dialog List */}
        <div className="flex-1 overflow-y-auto pb-24">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredData?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="h-14 w-14 rounded-2xl bg-primary/8 border border-primary/20 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <p className="font-bold text-sm mb-1">Нет диалогов</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {search ? "Ничего не найдено по запросу" : "Подключите Telegram аккаунт для получения сообщений"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredData.map(({ dialog, contact, account, assignee }) => {
                const status = statusConfig[dialog.status] ?? statusConfig.open;
                const sentiment = dialog.sentiment ? sentimentConfig[dialog.sentiment] : null;
                const contactName = contact
                  ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || contact.phone || "Неизвестный"
                  : "Неизвестный";
                const avatarColor = getAvatarColor(contactName);
                const isSelected = selectedIds.has(dialog.id);

                return (
                  <div
                    key={dialog.id}
                    className={`w-full px-6 py-4 transition-colors text-left flex items-start gap-3 group cursor-pointer ${
                      isSelected
                        ? "bg-primary/8 border-l-2 border-primary"
                        : "hover:bg-accent/20 border-l-2 border-transparent"
                    }`}
                    onClick={() => {
                      if (bulkMode) {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(dialog.id)) next.delete(dialog.id);
                          else next.add(dialog.id);
                          return next;
                        });
                      } else {
                        setLocation(`/inbox/${dialog.id}${selectedAccountId ? `?account=${selectedAccountId}` : ""}`);
                      }
                    }}
                  >
                    {/* Checkbox (bulk mode) or Avatar */}
                    {bulkMode ? (
                      <div className="h-10 w-10 flex items-center justify-center shrink-0 mt-0.5">
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-primary" />
                          : <Square className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        }
                      </div>
                    ) : (
                      <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-black text-sm shrink-0 mt-0.5 shadow`}>
                        {contactName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sm truncate">{contactName}</span>
                          {sentiment && (
                            <span className={`text-xs ${sentiment.color}`}>{sentiment.emoji}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {dialog.unreadCount > 0 && (
                            <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-black shadow shadow-primary/30">
                              {dialog.unreadCount}
                            </span>
                          )}
                          <span
                            className="text-xs text-muted-foreground cursor-default"
                            title={formatDate(dialog.lastMessageAt).full}
                          >
                            {formatDate(dialog.lastMessageAt).short}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mb-2">
                        {dialog.lastMessageText ?? "Нет сообщений"}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          <span className="text-xs font-medium">{status.label}</span>
                        </div>
                        {assignee?.name && (
                          <span className="text-xs text-muted-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                            {assignee.name.split(" ")[0]}
                          </span>
                        )}
                        {!assignee && (
                          <span className="text-xs text-muted-foreground/50">— без менеджера</span>
                        )}
                        {account && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            · <Bot className="h-2.5 w-2.5" /> {account.username ? `@${account.username}` : (account.firstName ?? account.phone ?? `#${account.id}`)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Bulk Action Toolbar */}
        {someSelected && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border border-border rounded-2xl shadow-2xl px-4 py-3 animate-in slide-in-from-bottom-4 duration-200">
            <span className="text-sm font-bold text-foreground mr-1">
              {selectedIds.size} выбрано
            </span>

            {/* Change status dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-bold gap-1.5 bg-muted border-border"
                  disabled={bulkUpdateStatus.isPending}
                >
                  {bulkUpdateStatus.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      Статус
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-44">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Изменить статус</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {bulkStatusOptions.map(opt => (
                  <DropdownMenuItem
                    key={opt.value}
                    className="text-xs gap-2 cursor-pointer"
                    onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selectedIds), status: opt.value })}
                  >
                    <div className={`h-2 w-2 rounded-full ${opt.dot} shrink-0`} />
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Assign manager dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-bold gap-1.5 bg-muted border-border"
                  disabled={bulkAssign.isPending}
                >
                  {bulkAssign.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      Менеджер
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Назначить менеджера</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allUsers?.map(u => (
                  <DropdownMenuItem
                    key={u.id}
                    className="text-xs gap-2 cursor-pointer"
                    onClick={() => bulkAssign.mutate({ ids: Array.from(selectedIds), assigneeId: u.id })}
                  >
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {(u.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    {u.name ?? u.email}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer text-muted-foreground"
                  onClick={() => bulkAssign.mutate({ ids: Array.from(selectedIds), assigneeId: null })}
                >
                  <UserX className="h-3.5 w-3.5" />
                  Снять назначение
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear selection */}
            <button
              onClick={clearSelection}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
