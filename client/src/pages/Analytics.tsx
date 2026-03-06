import { useState } from "react";
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
  MailOpen, ChevronUp, ChevronDown, Minus, Bot,
} from "lucide-react";

type Period = "today" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Сегодня",
  week: "7 дней",
  month: "30 дней",
  all: "Всё время",
};

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316"];
const SENTIMENT_COLORS = ["#f59e0b", "#6b7280", "#ef4444"];
const MEDAL: Record<number, string> = { 0: "🥇", 1: "🥈", 2: "🥉" };

type SortKey = "dialogs" | "deals" | "messages" | "conversionRate";

export default function Analytics() {
  const [period, setPeriod] = useState<Period>("week");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("week");
  const [sortBy, setSortBy] = useState<SortKey>("dialogs");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const { data: summary } = trpc.analytics.summary.useQuery();
  const { data: summaryByPeriod } = trpc.analytics.summaryByPeriod.useQuery({ period });
  const { data: managers, isLoading: managersLoading } = trpc.analytics.managerStats.useQuery({ period });
  const { data: daily } = trpc.analytics.dailyActivity.useQuery({ period: chartPeriod });
  const { data: recent } = trpc.analytics.recentDialogs.useQuery();

  const sorted = managers
    ? [...managers].sort((a, b) => {
        const diff = (a[sortBy] as number) - (b[sortBy] as number);
        return sortDir === "desc" ? -diff : diff;
      })
    : [];

  const handleSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  // Build daily chart data: group by date, sum across accounts
  const dailyMap: Record<string, number> = {};
  (daily ?? []).forEach(row => {
    const d = String(row.date);
    dailyMap[d] = (dailyMap[d] ?? 0) + Number(row.count);
  });
  const dailyChartData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cnt]) => ({ date: date.slice(5), count: cnt }));

  // Pie chart: dialogs per manager
  const pieData = (managers ?? [])
    .filter(m => m.dialogs > 0)
    .map((m, i) => ({ name: m.name, value: m.dialogs, color: COLORS[i % COLORS.length] }));

  // Sentiment data from overall summary
  const sentimentData = summary ? [
    { name: "Позитивные", value: summary.positiveDialogs },
    { name: "Нейтральные", value: summary.totalDialogs - summary.positiveDialogs - summary.negativeDialogs },
    { name: "Негативные", value: summary.negativeDialogs },
  ].filter(d => d.value > 0) : [];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <Minus className="h-3 w-3 text-muted-foreground" />;
    return sortDir === "desc"
      ? <ChevronDown className="h-3 w-3 text-primary" />
      : <ChevronUp className="h-3 w-3 text-primary" />;
  };

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Статистика</p>
          <h1 className="text-2xl font-black tracking-tight">Аналитика</h1>
        </div>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Диалогов", value: summaryByPeriod?.totalDialogs, icon: MessageSquare, color: "text-blue-400" },
          { label: "Сделок в Битрикс24", value: summaryByPeriod?.totalDeals, icon: Briefcase, color: "text-amber-400" },
          { label: "Сообщений", value: summaryByPeriod?.totalMessages, icon: MailOpen, color: "text-green-400" },
          { label: "Активных менеджеров", value: summaryByPeriod?.activeAccounts, icon: Users, color: "text-purple-400" },
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

      {/* Manager Leaderboard Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Рейтинг менеджеров
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {managersLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Загрузка...</div>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Нет данных за выбранный период</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium w-8">#</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Менеджер</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Статус</th>
                    {([
                      { key: "dialogs" as SortKey, label: "Диалоги" },
                      { key: "deals" as SortKey, label: "Сделки" },
                      { key: "messages" as SortKey, label: "Сообщения" },
                      { key: "conversionRate" as SortKey, label: "Конверсия" },
                    ]).map(({ key, label }) => (
                      <th
                        key={key}
                        className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none"
                        onClick={() => handleSort(key)}
                      >
                        <span className="flex items-center justify-end gap-1">
                          {label} <SortIcon col={key} />
                        </span>
                      </th>
                    ))}
                    <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Непрочитано</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((m, i) => (
                    <tr key={m.accountId} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-lg">{MEDAL[i] ?? <span className="text-xs text-muted-foreground">{i + 1}</span>}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{m.name}</div>
                        {m.bitrixResponsibleName && (
                          <div className="text-xs text-muted-foreground">{m.bitrixResponsibleName}</div>
                        )}
                        {m.username && (
                          <div className="text-xs text-muted-foreground">@{m.username}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            m.status === "active" ? "border-green-500/50 text-green-400 bg-green-500/10" :
                            m.status === "disconnected" ? "border-red-500/50 text-red-400 bg-red-500/10" :
                            "border-muted text-muted-foreground"
                          }
                        >
                          {m.status === "active" ? "Активен" : m.status === "disconnected" ? "Откл." : m.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{m.dialogs}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={m.deals > 0 ? "text-amber-400 font-bold" : "text-muted-foreground"}>{m.deals}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{m.messages}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={
                          m.conversionRate >= 50 ? "text-green-400 font-bold" :
                          m.conversionRate >= 20 ? "text-amber-400 font-bold" :
                          "text-muted-foreground"
                        }>
                          {m.conversionRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.unread > 0 ? (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{m.unread}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
