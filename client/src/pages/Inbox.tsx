import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import {
  MessageSquare,
  Search,
  Loader2,
  Wifi,
  WifiOff,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StatusFilter = "all" | "open" | "in_progress" | "waiting" | "resolved" | "closed";

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  open: { label: "Открыт", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400" },
  in_progress: { label: "В работе", color: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" },
  waiting: { label: "Ожидает", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
  resolved: { label: "Решён", color: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-400" },
  closed: { label: "Закрыт", color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

const sentimentConfig: Record<string, { emoji: string; color: string }> = {
  positive: { emoji: "😊", color: "text-green-400" },
  neutral: { emoji: "😐", color: "text-muted-foreground" },
  negative: { emoji: "😟", color: "text-red-400" },
};

const filters: { label: string; value: StatusFilter }[] = [
  { label: "Все", value: "all" },
  { label: "Открытые", value: "open" },
  { label: "В работе", value: "in_progress" },
  { label: "Ожидают", value: "waiting" },
  { label: "Решённые", value: "resolved" },
];

function timeAgo(date: Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const AVATAR_COLORS = [
  "bg-primary", "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-pink-500",
];

function getAvatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function Inbox() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [selectedTagId, setSelectedTagId] = useState<number | undefined>(undefined);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // SSE real-time connection — no polling needed
  const { connectionState } = useRealtimeInbox();
  const { data: allTags } = trpc.tags.list.useQuery();

  const assigneeId = assigneeFilter === "mine" ? user?.id : undefined;
  const { data, isLoading } = trpc.dialogs.list.useQuery(
    { status: statusFilter, search: search || undefined, assigneeId, tagId: selectedTagId }
  );

  // Filter unassigned client-side
  const filteredData = assigneeFilter === "unassigned"
    ? (data ?? []).filter(r => !r.dialog.assigneeId)
    : (data ?? []);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
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
                {data?.length ?? 0} диалогов
              </span>
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

          {/* Status filters + assignee filter */}
          <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex-1 overflow-y-auto">
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

                return (
                  <button
                    key={dialog.id}
                    onClick={() => setLocation(`/inbox/${dialog.id}`)}
                    className="w-full px-6 py-4 hover:bg-accent/20 transition-colors text-left flex items-start gap-3 group"
                  >
                    {/* Avatar */}
                    <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-black text-sm shrink-0 mt-0.5 shadow`}>
                      {contactName.charAt(0).toUpperCase()}
                    </div>

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
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(dialog.lastMessageAt)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mb-2">
                        {dialog.lastMessageText ?? "Нет сообщений"}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          <span className={`text-xs font-medium`}>{status.label}</span>
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
                          <span className="text-xs text-muted-foreground">
                            · @{account.username ?? account.phone ?? "аккаунт"}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
