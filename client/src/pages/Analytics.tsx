import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  MessageSquare, TrendingUp, Users, Briefcase, Trophy, Activity,
  MailOpen, ChevronUp, ChevronDown, Minus, Bot, Filter, X, Tag,
  Clock, CheckCircle, AlertCircle, UserPlus,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Period = "today" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Сегодня",
  week: "7 дней",
  month: "30 дней",
  all: "Всё время",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Открытые",
  in_progress: "В работе",
  waiting: "Ожидание",
  resolved: "Решённые",
  closed: "Закрытые",
};

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316"];
const SENTIMENT_COLORS = ["#f59e0b", "#6b7280", "#ef4444"];
const MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

function formatMinutes(mins: number | null): string {
  if (mins === null || mins === undefined) return "—";
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

export default function Analytics() {
  const [period, setPeriod] = useState<Period>("week");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("week");

  // Filter state
  const [filterManagerId, setFilterManagerId] = useState<number | undefined>();
  const [filterTagId, setFilterTagId] = useState<number | undefined>();
  const [filterAccountId, setFilterAccountId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const filterParams = useMemo(() => ({
    period,
    managerId: filterManagerId,
    tagId: filterTagId,
    accountId: filterAccountId,
    status: filterStatus,
  }), [period, filterManagerId, filterTagId, filterAccountId, filterStatus]);

  const hasActiveFilters = !!(filterManagerId || filterTagId || filterAccountId || filterStatus);

  const clearFilters = () => {
    setFilterManagerId(undefined);
    setFilterTagId(undefined);
    setFilterAccountId(undefined);
    setFilterStatus(undefined);
  };

  // Data queries
  const { data: summary } = trpc.analytics.summary.useQuery();
  const { data: summaryByPeriod } = trpc.analytics.summaryByPeriod.useQuery(filterParams);
  const { data: managers } = trpc.analytics.managerStats.useQuery({ period });
  const { data: userStats, isLoading: userStatsLoading } = trpc.analytics.managerUserStats.useQuery(filterParams);
  const { data: accountStatsData } = trpc.analytics.accountStats.useQuery({ period });
  const { data: daily } = trpc.analytics.dailyActivity.useQuery({ period: chartPeriod, accountId: filterAccountId });
  const { data: recent } = trpc.analytics.recentDialogs.useQuery();
  const { data: allTags } = trpc.tags.list.useQuery();
  const { data: allAccounts } = trpc.accounts.list.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery();

  // Build daily chart data
  const dailyChartData = useMemo(() => {
    const map: Record<string, number> = {};
    (daily ?? []).forEach(row => {
      const d = String(row.date);
      map[d] = (map[d] ?? 0) + Number(row.count);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cnt]) => ({ date: date.slice(5), count: cnt }));
  }, [daily]);

  // Pie chart: dialogs per manager (from managerStats, not filtered)
  const pieData = useMemo(() =>
    (managers ?? [])
      .filter(m => m.dialogs > 0)
      .map((m, i) => ({ name: m.name, value: m.dialogs, color: COLORS[i % COLORS.length] })),
    [managers]
  );

  // Sentiment data
  const sentimentData = summary ? [
    { name: "Позитивные", value: summary.positiveDialogs },
    { name: "Нейтральные", value: summary.totalDialogs - summary.positiveDialogs - summary.negativeDialogs },
    { name: "Негативные", value: summary.negativeDialogs },
  ].filter(d => d.value > 0) : [];

  // Active filter count
  const activeFilterCount = [filterManagerId, filterTagId, filterAccountId, filterStatus].filter(Boolean).length;

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Статистика</p>
          <h1 className="text-2xl font-black tracking-tight">Аналитика</h1>
        </div>
        {/* Period selector */}
        <div className="flex gap-1.5 bg-muted/50 rounded-lg p-1">
          {(["today", "week", "month", "all"] as Period[]).map(p => (
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
      </div>

      {/* ─── Filter Bar ─────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
              <Filter className="h-3.5 w-3.5" />
              Фильтры
              {activeFilterCount > 0 && (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs px-1.5 py-0 h-4">
                  {activeFilterCount}
                </Badge>
              )}
            </div>

            {/* Manager filter */}
            <Select
              value={filterManagerId ? String(filterManagerId) : "all"}
              onValueChange={v => setFilterManagerId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className={`h-7 text-xs w-40 ${filterManagerId ? "border-primary/50 bg-primary/5" : ""}`}>
                <Users className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Все менеджеры" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все менеджеры</SelectItem>
                {(allUsers ?? []).map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name ?? u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tag filter */}
            <Select
              value={filterTagId ? String(filterTagId) : "all"}
              onValueChange={v => setFilterTagId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className={`h-7 text-xs w-36 ${filterTagId ? "border-primary/50 bg-primary/5" : ""}`}>
                <Tag className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Все теги" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все теги</SelectItem>
                {(allTags ?? []).map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: t.color }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Account filter */}
            <Select
              value={filterAccountId ? String(filterAccountId) : "all"}
              onValueChange={v => setFilterAccountId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className={`h-7 text-xs w-44 ${filterAccountId ? "border-primary/50 bg-primary/5" : ""}`}>
                <MessageSquare className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Все аккаунты" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все аккаунты</SelectItem>
                {(allAccounts ?? []).map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.firstName ?? a.username ?? a.phone ?? `#${a.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={filterStatus ?? "all"}
              onValueChange={v => setFilterStatus(v === "all" ? undefined : v)}
            >
              <SelectTrigger className={`h-7 text-xs w-36 ${filterStatus ? "border-primary/50 bg-primary/5" : ""}`}>
                <CheckCircle className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Сбросить
              </Button>
            )}

            {/* Active filter badges */}
            <div className="flex flex-wrap gap-1 ml-1">
              {filterManagerId && allUsers && (
                <Badge
                  variant="outline"
                  className="text-xs h-6 gap-1 border-primary/40 text-primary cursor-pointer hover:bg-primary/10"
                  onClick={() => setFilterManagerId(undefined)}
                >
                  {allUsers.find(u => u.id === filterManagerId)?.name ?? "Менеджер"}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
              {filterTagId && allTags && (
                <Badge
                  variant="outline"
                  className="text-xs h-6 gap-1 cursor-pointer hover:bg-muted"
                  style={{ borderColor: allTags.find(t => t.id === filterTagId)?.color + "60" }}
                  onClick={() => setFilterTagId(undefined)}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: allTags.find(t => t.id === filterTagId)?.color }} />
                  {allTags.find(t => t.id === filterTagId)?.name}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
              {filterAccountId && allAccounts && (
                <Badge
                  variant="outline"
                  className="text-xs h-6 gap-1 cursor-pointer hover:bg-muted"
                  onClick={() => setFilterAccountId(undefined)}
                >
                  {allAccounts.find(a => a.id === filterAccountId)?.firstName ?? `Аккаунт #${filterAccountId}`}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
              {filterStatus && (
                <Badge
                  variant="outline"
                  className="text-xs h-6 gap-1 cursor-pointer hover:bg-muted"
                  onClick={() => setFilterStatus(undefined)}
                >
                  {STATUS_LABELS[filterStatus] ?? filterStatus}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Диалогов", value: summaryByPeriod?.totalDialogs, icon: MessageSquare, color: "text-blue-400" },
          { label: "Сделок в Битрикс24", value: summaryByPeriod?.totalDeals, icon: Briefcase, color: "text-amber-400" },
          { label: "Сообщений", value: summaryByPeriod?.totalMessages, icon: MailOpen, color: "text-green-400" },
          { label: "Активных аккаунтов", value: summaryByPeriod?.activeAccounts, icon: Users, color: "text-purple-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-black">{(value ?? 0).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Activity Line Chart */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Активность по дням
              {filterAccountId && allAccounts && (
                <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                  {allAccounts.find(a => a.id === filterAccountId)?.firstName ?? `Аккаунт #${filterAccountId}`}
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-1 bg-muted/50 rounded p-0.5">
              {(["week", "month"] as const).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={chartPeriod === p ? "default" : "ghost"}
                  className="h-6 text-xs px-2"
                  onClick={() => setChartPeriod(p)}
                >
                  {p === "week" ? "7д" : "30д"}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {dailyChartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Нет данных за период</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Line type="monotone" dataKey="count" name="Диалоги" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart: dialogs per manager */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Доля диалогов
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={55} dataKey="value" paddingAngle={2}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-1">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="truncate text-muted-foreground">{d.name}</span>
                      <span className="ml-auto font-bold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart: deals per manager */}
      {(managers ?? []).some(m => m.deals > 0) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Сделки vs Диалоги по менеджерам
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={(managers ?? []).filter(m => m.deals > 0 || m.dialogs > 0).map(m => ({
                name: m.name.split(" ")[0],
                deals: m.deals,
                dialogs: m.dialogs,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="dialogs" name="Диалоги" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="deals" name="Сделки" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Sentiment + Recent row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sentiment */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Тональность диалогов (ИИ)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={110} height={110}>
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={28} outerRadius={50} dataKey="value" strokeWidth={0}>
                      {sentimentData.map((_, i) => <Cell key={i} fill={SENTIMENT_COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2.5 flex-1">
                  {sentimentData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: SENTIMENT_COLORS[i] }} />
                      <span className="text-muted-foreground flex-1">{d.name}</span>
                      <span className="font-bold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-28 gap-2">
                <Bot className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Нет данных для анализа</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Dialogs */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Последние диалоги
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!recent?.length ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Нет диалогов</div>
            ) : (
              <div className="divide-y divide-border/50">
                {recent.slice(0, 5).map(({ dialog, contact }) => {
                  const name = contact
                    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный"
                    : "Неизвестный";
                  return (
                    <div key={dialog.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{dialog.lastMessageText ?? "—"}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${
                        dialog.sentiment === "positive" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        dialog.sentiment === "negative" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-muted text-muted-foreground border-border"
                      }`}>
                        {dialog.sentiment === "positive" ? "😊" : dialog.sentiment === "negative" ? "😟" : "😐"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Manager Efficiency Table (filtered) ─────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Эффективность аффилейт-менеджеров
            {hasActiveFilters && (
              <Badge variant="outline" className="text-xs border-primary/40 text-primary gap-1">
                <Filter className="h-2.5 w-2.5" />
                Фильтр активен
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="text-green-400 font-medium">≤5мин</span>
            <span className="text-amber-400 font-medium">≤30мин</span>
            <span className="text-red-400 font-medium">&gt;30мин</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {userStatsLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Загрузка...</div>
          ) : !userStats?.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {hasActiveFilters ? "Нет данных по выбранным фильтрам" : "Нет данных за выбранный период"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium w-8">#</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Менеджер</th>
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Назначено</th>
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Открытых</th>
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Закрытых</th>
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Отправлено</th>
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Ср. ответ</th>
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">% закрытия</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.map((u, i) => {
                    const closeRate = u.assigned > 0 ? Math.round((u.closed / u.assigned) * 100) : 0;
                    return (
                      <tr
                        key={u.userId}
                        className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${
                          filterManagerId === u.userId ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-lg">{MEDAL[i] ?? <span className="text-xs text-muted-foreground">{i + 1}</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 cursor-pointer hover:bg-primary/30"
                              onClick={() => setFilterManagerId(filterManagerId === u.userId ? undefined : u.userId)}
                              title="Фильтровать по этому менеджеру"
                            >
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold">{u.name}</div>
                              <div className="text-xs text-muted-foreground capitalize">{u.role}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">{u.assigned}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={u.open > 0 ? "text-blue-400" : "text-muted-foreground"}>{u.open}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={u.closed > 0 ? "text-green-400 font-bold" : "text-muted-foreground"}>{u.closed}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{u.sentMessages}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={
                            u.avgResponseMinutes === null ? "text-muted-foreground" :
                            u.avgResponseMinutes <= 5 ? "text-green-400 font-bold" :
                            u.avgResponseMinutes <= 30 ? "text-amber-400" :
                            "text-red-400"
                          }>
                            {formatMinutes(u.avgResponseMinutes)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-muted/50 rounded-full h-1.5 hidden sm:block">
                              <div
                                className={`h-1.5 rounded-full ${closeRate >= 70 ? "bg-green-400" : closeRate >= 30 ? "bg-amber-400" : "bg-muted-foreground/40"}`}
                                style={{ width: `${Math.min(closeRate, 100)}%` }}
                              />
                            </div>
                            <span className={
                              closeRate >= 70 ? "text-green-400 font-bold" :
                              closeRate >= 30 ? "text-amber-400 font-bold" :
                              "text-muted-foreground"
                            }>
                              {u.assigned > 0 ? `${closeRate}%` : "—"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Account Activity Stats ──────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Активность Telegram-аккаунтов
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!accountStatsData || accountStatsData.stats.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Нет данных</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground text-xs">
                    <th className="text-left px-4 py-3 font-medium">Аккаунт</th>
                    <th className="text-left px-4 py-3 font-medium">Менеджер</th>
                    <th className="text-right px-4 py-3 font-medium">Отправлено</th>
                    <th className="text-right px-4 py-3 font-medium">Получено</th>
                    <th className="text-right px-4 py-3 font-medium">Активных диалогов</th>
                    <th className="text-right px-4 py-3 font-medium">Новых диалогов</th>
                    <th className="text-right px-4 py-3 font-medium">Требуют ответа</th>
                    <th className="text-right px-4 py-3 font-medium">Ср. время ответа</th>
                    <th className="text-right px-4 py-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {accountStatsData.stats.map((acc) => {
                    const name = acc.username ? `@${acc.username}` : [acc.firstName, acc.lastName].filter(Boolean).join(" ") || `Аккаунт #${acc.accountId}`;
                    const avgMs = acc.avgResponseMs;
                    let avgStr = "—";
                    if (avgMs > 0) {
                      const totalSec = Math.round(avgMs / 1000);
                      if (totalSec < 60) avgStr = `${totalSec} сек`;
                      else if (totalSec < 3600) avgStr = `${Math.round(totalSec / 60)} мин`;
                      else avgStr = `${Math.floor(totalSec / 3600)} ч ${Math.round((totalSec % 3600) / 60)} мин`;
                    }
                    return (
                      <tr key={acc.accountId} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{name}</div>
                          {acc.username && (acc.firstName || acc.lastName) && (
                            <div className="text-xs text-muted-foreground">{[acc.firstName, acc.lastName].filter(Boolean).join(" ")}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(acc as any).managerName ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                                {String((acc as any).managerName).charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium truncate max-w-[100px]">{(acc as any).managerName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-400">{acc.sent.toLocaleString("ru")}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-400">{acc.received.toLocaleString("ru")}</td>
                        <td className="px-4 py-3 text-right">{acc.activeDialogs.toLocaleString("ru")}</td>
                        <td className="px-4 py-3 text-right">{acc.newDialogs.toLocaleString("ru")}</td>
                        <td className="px-4 py-3 text-right">
                          {acc.needsReply > 0
                            ? <span className="text-red-400 font-semibold">{acc.needsReply}</span>
                            : <span className="text-muted-foreground">0</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={avgMs > 0 && avgMs < 300000 ? "text-green-400" : avgMs > 0 && avgMs < 3600000 ? "text-amber-400" : avgMs > 0 ? "text-red-400" : "text-muted-foreground"}>
                            {avgStr}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            acc.status === "active" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                          }`}>
                            {acc.status === "active" ? "Активен" : acc.status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
    </DashboardLayout>
  );
}
