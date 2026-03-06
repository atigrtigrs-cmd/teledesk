import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Briefcase, Users, MailOpen, TrendingUp,
  ArrowRight, Zap, Trophy, Activity, Clock, CheckCircle2,
  AlertCircle, Bot,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type Period = "today" | "week" | "month";
const PERIOD_LABELS: Record<Period, string> = { today: "Сегодня", week: "7 дней", month: "30 дней" };

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("today");

  // Real-time updates
  useRealtimeInbox();

  const { data: summary } = trpc.analytics.summary.useQuery();
  const { data: summaryByPeriod } = trpc.analytics.summaryByPeriod.useQuery({ period });
  const { data: managers } = trpc.analytics.managerStats.useQuery({ period });
  const { data: recent } = trpc.analytics.recentDialogs.useQuery();
  const { data: daily } = trpc.analytics.dailyActivity.useQuery({ period: period === "today" ? "week" : period });

  // Unread dialogs (open + unread > 0)
  const unreadDialogs = (recent ?? []).filter(({ dialog }) => (dialog.unreadCount ?? 0) > 0);
  const openDialogs = (recent ?? []).filter(({ dialog }) => dialog.status === "open");

  // Daily chart
  const dailyMap: Record<string, number> = {};
  (daily ?? []).forEach(row => {
    const d = String(row.date);
    dailyMap[d] = (dailyMap[d] ?? 0) + Number(row.count);
  });
  const dailyChartData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cnt]) => ({ date: date.slice(5), count: cnt }));

  // Top 3 managers by dialogs
  const topManagers = (managers ?? []).slice(0, 5);

  const getContactName = (contact: { firstName?: string | null; lastName?: string | null; username?: string | null } | null) => {
    if (!contact) return "Неизвестный";
    return `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный";
  };

  const timeAgo = (date: Date | null | undefined) => {
    if (!date) return "";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "только что";
    if (mins < 60) return `${mins} мин назад`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ч назад`;
    return `${Math.floor(hrs / 24)} д назад`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Главная</p>
          <h1 className="text-2xl font-black tracking-tight">
            Добро пожаловать{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
            {(["today", "week", "month"] as Period[]).map(p => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
          <Button size="sm" className="gap-1.5 font-bold" onClick={() => setLocation("/inbox")}>
            <MessageSquare className="h-3.5 w-3.5" />
            Входящие
            {(summary?.openDialogs ?? 0) > 0 && (
              <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 ml-0.5">{summary?.openDialogs}</Badge>
            )}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Диалогов",
            value: summaryByPeriod?.totalDialogs ?? 0,
            sub: `${summary?.openDialogs ?? 0} открытых`,
            icon: MessageSquare,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            alert: (summary?.openDialogs ?? 0) > 0,
          },
          {
            label: "Сделок в Битрикс24",
            value: summaryByPeriod?.totalDeals ?? 0,
            sub: "создано автоматически",
            icon: Briefcase,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            alert: false,
          },
          {
            label: "Сообщений",
            value: summaryByPeriod?.totalMessages ?? 0,
            sub: `${unreadDialogs.length} непрочитанных чатов`,
            icon: MailOpen,
            color: "text-green-400",
            bg: "bg-green-500/10",
            alert: unreadDialogs.length > 0,
          },
          {
            label: "Активных менеджеров",
            value: summaryByPeriod?.activeAccounts ?? 0,
            sub: `из ${managers?.length ?? 0} аккаунтов`,
            icon: Users,
            color: "text-purple-400",
            bg: "bg-purple-500/10",
            alert: false,
          },
        ].map(({ label, value, sub, icon: Icon, color, bg, alert }) => (
          <Card key={label} className="bg-card border-border hover:border-border/80 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {alert && <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
              </div>
              <p className="text-2xl font-black">{value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content: dialogs + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Unread / Active Dialogs */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              Требуют внимания
              {unreadDialogs.length > 0 && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{unreadDialogs.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/inbox")}>
              Все <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {unreadDialogs.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-400/50" />
                <p className="text-sm font-semibold text-green-400">Всё обработано</p>
                <p className="text-xs text-muted-foreground">Нет непрочитанных диалогов</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {unreadDialogs.slice(0, 6).map(({ dialog, contact }) => (
                  <button
                    key={dialog.id}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setLocation(`/dialog/${dialog.id}`)}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-black shrink-0">
                      {getContactName(contact).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{getContactName(contact)}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(dialog.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{dialog.lastMessageText ?? "—"}</p>
                    </div>
                    {(dialog.unreadCount ?? 0) > 0 && (
                      <Badge className="bg-red-500 text-white text-xs px-1.5 shrink-0">{dialog.unreadCount}</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Chart */}
        <Card className="lg:col-span-3 bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Активность диалогов
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChartData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-2">
                <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Нет данных за период</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyChartData} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                  />
                  <Bar dataKey="count" name="Диалоги" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Manager leaderboard + Recent open */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Manager Leaderboard */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              Рейтинг менеджеров
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/analytics")}>
              Подробнее <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {topManagers.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Нет данных</div>
            ) : (
              <div className="divide-y divide-border/40">
                {topManagers.map((m, i) => {
                  const medal = ["🥇", "🥈", "🥉"][i];
                  return (
                    <div key={m.accountId} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-lg w-6 shrink-0">{medal ?? <span className="text-xs text-muted-foreground">{i + 1}</span>}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold truncate">{m.name}</p>
                          <Badge
                            variant="outline"
                            className={`text-xs px-1.5 py-0 shrink-0 ${
                              m.status === "active" ? "border-green-500/40 text-green-400" : "border-muted text-muted-foreground"
                            }`}
                          >
                            {m.status === "active" ? "●" : "○"}
                          </Badge>
                        </div>
                        {m.bitrixResponsibleName && (
                          <p className="text-xs text-muted-foreground truncate">{m.bitrixResponsibleName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <div className="text-center">
                          <p className="font-bold">{m.dialogs}</p>
                          <p className="text-muted-foreground">диал.</p>
                        </div>
                        <div className="text-center">
                          <p className={`font-bold ${m.deals > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{m.deals}</p>
                          <p className="text-muted-foreground">сделок</p>
                        </div>
                        {m.unread > 0 && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{m.unread}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent open dialogs */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              Последние диалоги
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/inbox")}>
              Все <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {openDialogs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Нет открытых диалогов</div>
            ) : (
              <div className="divide-y divide-border/40">
                {openDialogs.slice(0, 6).map(({ dialog, contact }) => (
                  <button
                    key={dialog.id}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setLocation(`/dialog/${dialog.id}`)}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-black shrink-0">
                      {getContactName(contact).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{getContactName(contact)}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(dialog.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{dialog.lastMessageText ?? "—"}</p>
                    </div>
                    <span className={`text-xs shrink-0 ${
                      dialog.sentiment === "positive" ? "text-green-400" :
                      dialog.sentiment === "negative" ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {dialog.sentiment === "positive" ? "😊" : dialog.sentiment === "negative" ? "😟" : "😐"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Входящие", desc: "Все диалоги", icon: MessageSquare, path: "/inbox", color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Аккаунты", desc: "Telegram менеджеры", icon: Users, path: "/accounts", color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "Аналитика", desc: "Подробная статистика", icon: TrendingUp, path: "/analytics", color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Рассылка", desc: "Массовые сообщения", icon: Zap, path: "/broadcast", color: "text-green-400", bg: "bg-green-500/10" },
        ].map(({ label, desc, icon: Icon, path, color, bg }) => (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className="p-4 rounded-xl border border-border bg-card hover:bg-muted/30 hover:border-border/80 transition-all text-left group"
          >
            <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-sm font-bold">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
