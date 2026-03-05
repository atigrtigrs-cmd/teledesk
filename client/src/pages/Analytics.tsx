import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  MessageSquare,
  CheckCircle2,
  Smartphone,
  TrendingUp,
  Loader2,
  Bot,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

// Lead-Cash color palette
const SENTIMENT_COLORS = ["#f59e0b", "#6b7280", "#ef4444"];
const PRIMARY = "#f59e0b";

// Mock weekly data for demo
const weeklyData = [
  { day: "Пн", dialogs: 12, resolved: 8 },
  { day: "Вт", dialogs: 19, resolved: 14 },
  { day: "Ср", dialogs: 8, resolved: 6 },
  { day: "Чт", dialogs: 24, resolved: 18 },
  { day: "Пт", dialogs: 16, resolved: 12 },
  { day: "Сб", dialogs: 5, resolved: 4 },
  { day: "Вс", dialogs: 3, resolved: 2 },
];

export default function Analytics() {
  const { data: summary, isLoading } = trpc.analytics.summary.useQuery();
  const { data: recent } = trpc.analytics.recentDialogs.useQuery();

  const sentimentData = summary ? [
    { name: "Позитивные", value: summary.positiveDialogs },
    { name: "Нейтральные", value: summary.totalDialogs - summary.positiveDialogs - summary.negativeDialogs },
    { name: "Негативные", value: summary.negativeDialogs },
  ].filter(d => d.value > 0) : [];

  const stats = [
    {
      icon: MessageSquare,
      label: "Всего диалогов",
      value: summary?.totalDialogs ?? 0,
      sub: "за всё время",
      accent: true,
    },
    {
      icon: TrendingUp,
      label: "Открытых",
      value: summary?.openDialogs ?? 0,
      sub: "требуют ответа",
      accent: false,
    },
    {
      icon: CheckCircle2,
      label: "Решённых",
      value: summary?.resolvedDialogs ?? 0,
      sub: "закрыто успешно",
      accent: false,
    },
    {
      icon: Smartphone,
      label: "Активных аккаунтов",
      value: summary?.activeAccounts ?? 0,
      sub: "Telegram",
      accent: false,
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Статистика</p>
          <h1 className="text-2xl font-black tracking-tight">Аналитика</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {stats.map((stat, i) => (
                <div
                  key={i}
                  className={`p-5 rounded-xl border transition-all ${
                    stat.accent
                      ? "bg-primary/8 border-primary/30"
                      : "bg-card border-border"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-4 ${
                    stat.accent ? "bg-primary shadow-md shadow-primary/30" : "bg-muted"
                  }`}>
                    <stat.icon className={`h-4 w-4 ${stat.accent ? "text-primary-foreground" : "text-primary"}`} />
                  </div>
                  <p className={`text-3xl font-black ${stat.accent ? "text-primary" : ""}`}>{stat.value}</p>
                  <p className="text-xs font-semibold mt-1">{stat.label}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* Weekly Activity Chart */}
            <div className="bg-card border border-border rounded-xl p-5 mb-4">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs font-black text-primary tracking-widest uppercase mb-0.5">Активность</p>
                  <h3 className="text-sm font-bold">Диалоги за неделю</h3>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    Новые
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    Решённые
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyData} barGap={4}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "hsl(var(--accent))" }}
                  />
                  <Bar dataKey="dialogs" fill={PRIMARY} radius={[4, 4, 0, 0]} name="Новые" />
                  <Bar dataKey="resolved" fill="#22c55e" radius={[4, 4, 0, 0]} name="Решённые" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Sentiment Pie */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="mb-4">
                  <p className="text-xs font-black text-primary tracking-widest uppercase mb-0.5">ИИ-анализ</p>
                  <h3 className="text-sm font-bold">Тональность диалогов</h3>
                </div>
                {sentimentData.length > 0 ? (
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={110} height={110}>
                      <PieChart>
                        <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={28} outerRadius={50} dataKey="value" strokeWidth={0}>
                          {sentimentData.map((_, i) => (
                            <Cell key={i} fill={SENTIMENT_COLORS[i]} />
                          ))}
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
              </div>

              {/* Response time */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="mb-4">
                  <p className="text-xs font-black text-primary tracking-widest uppercase mb-0.5">Эффективность</p>
                  <h3 className="text-sm font-bold">Время ответа</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Среднее время ответа", value: "4 мин", pct: 70 },
                    { label: "Быстрее 5 минут", value: "68%", pct: 68 },
                    { label: "Решено с первого ответа", value: "42%", pct: 42 },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className="text-xs font-bold">{item.value}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Dialogs */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <p className="text-xs font-black text-primary tracking-widest uppercase mb-0.5">Последние</p>
                <h3 className="text-sm font-bold">Последние диалоги</h3>
              </div>
              {!recent?.length ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  Нет диалогов
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recent.map(({ dialog, contact }) => {
                    const name = contact
                      ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.username || "Неизвестный"
                      : "Неизвестный";
                    return (
                      <div key={dialog.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-accent/20 transition-colors">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black shrink-0">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">{dialog.lastMessageText ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {dialog.lastMessageAt
                              ? new Date(dialog.lastMessageAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
                              : "—"}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            dialog.sentiment === "positive" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                            dialog.sentiment === "negative" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            "bg-muted text-muted-foreground border-border"
                          }`}>
                            {dialog.sentiment === "positive" ? "😊 Позитив" : dialog.sentiment === "negative" ? "😟 Негатив" : "😐 Нейтрал"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
