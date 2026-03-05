import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Users,
  Clock,
  Activity,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BotGroup {
  title: string;
  category: string;
  lang: string;
  added_at?: string;
}

interface LogEntry {
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  advertisers: { label: "Рекламодатели", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  brokers_ru: { label: "Брокеры РФ", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  brokers_en: { label: "Брокеры EN", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  pending: { label: "На модерации", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  test: { label: "Тест", color: "bg-muted text-muted-foreground border-border" },
};

const LOG_TYPE_LABELS: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  new_group: { label: "Новая группа", icon: AlertCircle, color: "text-yellow-400" },
  group_added: { label: "Группа добавлена", icon: CheckCircle2, color: "text-green-400" },
  group_category_set: { label: "Категория установлена", icon: Activity, color: "text-blue-400" },
  admin_added: { label: "Добавлен админ", icon: Users, color: "text-primary" },
  category_added: { label: "Категория создана", icon: Activity, color: "text-purple-400" },
};

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString("ru-RU", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LeadCashBot() {
  const [tab, setTab] = useState<"groups" | "pending" | "logs">("groups");

  const { data: groupsData, isLoading: groupsLoading, refetch: refetchGroups } =
    trpc.leadcashBot.groups.useQuery();
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } =
    trpc.leadcashBot.logs.useQuery();

  // ── Derived data ──────────────────────────────────────────────────────────
  const allGroups: Array<{ id: string } & BotGroup> = [];
  const pendingGroups: Array<{ id: string } & BotGroup> = [];

  if (groupsData && typeof groupsData === "object") {
    const data = groupsData as Record<string, any>;
    for (const cat of ["advertisers", "brokers_ru", "brokers_en", "test", "pending"]) {
      const section = data[cat];
      if (section?.groups) {
        for (const [id, g] of Object.entries(section.groups as Record<string, BotGroup>)) {
          const entry = { id, ...g };
          allGroups.push(entry);
          if (cat === "pending") pendingGroups.push(entry);
        }
      }
    }
  }

  const logs: LogEntry[] = [];
  if (logsData && typeof logsData === "object") {
    const d = logsData as any;
    const rawLogs = Array.isArray(d) ? d : (d.logs ?? []);
    logs.push(...[...rawLogs].reverse().slice(0, 50));
  }

  const totalGroups = (groupsData as any)?.total_groups ?? allGroups.length;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = [
    { label: "Всего групп", value: totalGroups, icon: Users },
    { label: "На модерации", value: pendingGroups.length, icon: Clock },
    { label: "Событий", value: logs.length, icon: Activity },
  ];

  const handleRefresh = () => {
    refetchGroups();
    refetchLogs();
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Интеграция</p>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight">LeadCash Bot</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Активен
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">@leadcash_support_bot · Telegram-бот для партнёрских групп</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {stats.map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-black">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/40 rounded-lg mb-6 w-fit">
          {([
            { id: "groups", label: "Все группы", count: allGroups.length },
            { id: "pending", label: "На модерации", count: pendingGroups.length },
            { id: "logs", label: "Лог событий", count: logs.length },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${
                tab === t.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${
                  tab === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Groups Tab */}
        {tab === "groups" && (
          <div>
            {groupsLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Загрузка групп...</span>
              </div>
            ) : allGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Нет данных о группах</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allGroups.map(g => {
                  const catInfo = CATEGORY_LABELS[g.category] ?? CATEGORY_LABELS.test;
                  return (
                    <div key={g.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{g.title}</p>
                          <p className="text-xs text-muted-foreground font-mono">{g.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${
                          g.lang === "ru"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                        }`}>
                          <Globe className="h-3 w-3" />
                          {g.lang?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pending Tab */}
        {tab === "pending" && (
          <div>
            {groupsLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Загрузка...</span>
              </div>
            ) : pendingGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400/40 mb-3" />
                <p className="font-semibold text-sm mb-1">Нет групп на модерации</p>
                <p className="text-xs text-muted-foreground">Все группы обработаны</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingGroups.map(g => (
                  <div key={g.id} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className="h-4 w-4 text-orange-400" />
                          <p className="font-bold text-sm">{g.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mb-2">{g.id}</p>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium bg-orange-500/10 text-orange-400 border-orange-500/20">
                            ⏳ На модерации
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${
                            g.lang === "ru"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                          }`}>
                            <Globe className="h-3 w-3" />
                            {g.lang?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                      </div>
                      {g.added_at && (
                        <p className="text-xs text-muted-foreground shrink-0">{formatDate(g.added_at)}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Для одобрения используйте Admin Panel бота
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {tab === "logs" && (
          <div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Загрузка логов...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Нет событий</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {logs.map((log, i) => {
                  const typeInfo = LOG_TYPE_LABELS[log.type] ?? { label: log.type, icon: Activity, color: "text-muted-foreground" };
                  const Icon = typeInfo.icon;
                  return (
                    <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-3">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${typeInfo.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-sm font-semibold">{typeInfo.label}</p>
                          <p className="text-xs text-muted-foreground shrink-0">{formatDate(log.timestamp)}</p>
                        </div>
                        {log.data?.title && (
                          <p className="text-xs text-muted-foreground truncate">{log.data.title}</p>
                        )}
                        {log.data?.category && (
                          <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                            CATEGORY_LABELS[log.data.category]?.color ?? "bg-muted text-muted-foreground"
                          }`}>
                            {CATEGORY_LABELS[log.data.category]?.label ?? log.data.category}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
