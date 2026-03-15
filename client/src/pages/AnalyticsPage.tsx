import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Users,
  Zap,
  TrendingUp,
  Loader2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  PieChart,
  Activity,
  Sparkles,
  AlertTriangle,
  ArrowRightCircle,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { CalendarDays } from "lucide-react";

type Period = "today" | "week" | "month" | "all" | "custom";

const statusLabels: Record<string, { label: string; color: string }> = {
  open: { label: "Открыт", color: "#3b82f6" },
  in_progress: { label: "В работе", color: "#f97316" },
  waiting: { label: "Ожидает", color: "#eab308" },
  needs_reply: { label: "Ответить", color: "#ef4444" },
  resolved: { label: "Решён", color: "#22c55e" },
  closed: { label: "Закрыт", color: "#6b7280" },
  archived: { label: "Архив", color: "#71717a" },
};

const analyticsSectionVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      delay: index * 0.07,
      ease: "easeOut",
    },
  }),
};

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Build query params based on period or custom dates
  const queryParams = useMemo(() => {
    if (period === "custom" && dateFrom) {
      return { period: "all" as const, from: dateFrom, to: dateTo || undefined };
    }
    return { period: period === "custom" ? "all" as const : period };
  }, [period, dateFrom, dateTo]);

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summaryByPeriod.useQuery(queryParams);
  const { data: accountStats } = trpc.analytics.accountStats.useQuery(queryParams);
  // managerStats removed — accounts table IS the managers table
  const { data: messagesByDay } = trpc.analytics.messagesByDay.useQuery(queryParams);
  const { data: dialogsByStatus } = trpc.analytics.dialogsByStatus.useQuery(queryParams);
  const { data: hourlyActivity } = trpc.analytics.hourlyActivity.useQuery(queryParams);
  const { data: newDialogsByDay } = trpc.analytics.newDialogsByDay.useQuery(queryParams);
  const { data: aiInsights } = trpc.analytics.aiInsights.useQuery(queryParams);

  // Derived metrics
  const totalSent = useMemo(() => accountStats?.stats?.reduce((s, a) => s + a.sent, 0) ?? 0, [accountStats]);
  const totalReceived = useMemo(() => accountStats?.stats?.reduce((s, a) => s + a.received, 0) ?? 0, [accountStats]);
  const totalNeedsReply = useMemo(() => accountStats?.stats?.reduce((s, a) => s + a.needsReply, 0) ?? 0, [accountStats]);
  const avgResponse = useMemo(() => {
    if (!accountStats?.stats?.length) return null;
    const withResp = accountStats.stats.filter(a => a.avgResponseMs > 0);
    if (!withResp.length) return null;
    return Math.round(withResp.reduce((s, a) => s + a.avgResponseMs, 0) / withResp.length / 60000);
  }, [accountStats]);

  const peakHour = useMemo(() => {
    if (!hourlyActivity?.length) return null;
    return hourlyActivity.reduce((max, h) => h.count > max.count ? h : max, hourlyActivity[0]);
  }, [hourlyActivity]);

  const insightHighlights = useMemo(() => {
    const highlights: string[] = [];

    if ((summary?.totalDialogs ?? 0) > 0) {
      highlights.push(`За период в работе ${summary?.totalDialogs ?? 0} диалогов и ${summary?.totalMessages ?? 0} сообщений.`);
    }

    if (totalNeedsReply > 0) {
      highlights.push(`${totalNeedsReply} диалогов требуют follow-up, их стоит вынести в приоритет.`);
    }

    if (peakHour) {
      highlights.push(`Пиковая нагрузка приходится на ${peakHour.hour}:00, в этот слот лучше держать максимальную доступность команды.`);
    }

    if ((aiInsights?.negativeDialogs?.length ?? 0) > 0) {
      highlights.push(`${aiInsights?.negativeDialogs?.length ?? 0} диалогов отмечены как негативные и требуют ручного внимания.`);
    }

    if ((summary?.activeAccounts ?? 0) > 0) {
      highlights.push(`Сейчас активно ${summary?.activeAccounts ?? 0} Telegram-аккаунта, realtime-синхронизация распределена между ними.`);
    }

    return highlights;
  }, [aiInsights?.negativeDialogs?.length, peakHour, summary?.activeAccounts, summary?.totalDialogs, summary?.totalMessages, totalNeedsReply]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto py-6 px-6 space-y-6">
        {/* Header */}
        <motion.div
          className="flex items-center justify-between"
          variants={analyticsSectionVariants}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <div>
            <h2 className="text-lg font-bold">Аналитика</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Обзор активности и эффективности</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period presets */}
            <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
              {(["today", "week", "month", "all"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setShowDatePicker(false); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    period === p ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {{ today: "Сегодня", week: "Неделя", month: "Месяц", all: "Всё" }[p]}
                </button>
              ))}
              <button
                onClick={() => { setPeriod("custom"); setShowDatePicker(true); }}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  period === "custom" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                Даты
              </button>
            </div>

            {/* Custom date range */}
            {showDatePicker && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-36 text-xs bg-muted/30 border-0"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-36 text-xs bg-muted/30 border-0"
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* KPI Cards - 2 rows */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              variants={analyticsSectionVariants}
              initial="hidden"
              animate="visible"
              custom={1}
            >
              <KpiCard title="Диалоги" value={summary?.totalDialogs ?? 0} icon={MessageSquare} color="text-blue-400" bgColor="bg-blue-500/10" />
              <KpiCard title="Сообщения" value={summary?.totalMessages ?? 0} icon={Zap} color="text-primary" bgColor="bg-primary/10" />
              <KpiCard title="Отправлено" value={totalSent} icon={ArrowUpRight} color="text-green-400" bgColor="bg-green-500/10" />
              <KpiCard title="Получено" value={totalReceived} icon={ArrowDownLeft} color="text-cyan-400" bgColor="bg-cyan-500/10" />
            </motion.div>
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              variants={analyticsSectionVariants}
              initial="hidden"
              animate="visible"
              custom={2}
            >
              <KpiCard title="Сделки" value={summary?.totalDeals ?? 0} icon={TrendingUp} color="text-emerald-400" bgColor="bg-emerald-500/10" />
              <KpiCard title="Аккаунты" value={summary?.activeAccounts ?? 0} icon={Users} color="text-violet-400" bgColor="bg-violet-500/10" />
              <KpiCard title="Нужен ответ" value={totalNeedsReply} icon={MessageSquare} color="text-red-400" bgColor="bg-red-500/10" />
              <KpiCard
                title="Ср. ответ"
                value={avgResponse ?? 0}
                suffix=" мин"
                icon={Clock}
                color="text-amber-400"
                bgColor="bg-amber-500/10"
              />
            </motion.div>
          </>
        )}

        {/* Charts Row */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          variants={analyticsSectionVariants}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          {/* Messages by Day Bar Chart */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Сообщения по дням</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {messagesByDay && messagesByDay.length > 0 ? (
                <BarChartSimple data={messagesByDay} />
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Нет данных за выбранный период
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialogs by Status */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <PieChart className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Диалоги по статусам</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {dialogsByStatus && dialogsByStatus.length > 0 ? (
                <StatusBreakdown data={dialogsByStatus} />
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Нет данных
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Second Charts Row */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          variants={analyticsSectionVariants}
          initial="hidden"
          animate="visible"
          custom={4}
        >
          {/* Hourly Activity */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Активность по часам
                  {peakHour && <span className="text-xs text-muted-foreground font-normal ml-2">Пик: {peakHour.hour}:00</span>}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {hourlyActivity && hourlyActivity.length > 0 ? (
                <HourlyChart data={hourlyActivity} />
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Нет данных
                </div>
              )}
            </CardContent>
          </Card>

          {/* New Dialogs by Day */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Новые диалоги по дням</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {newDialogsByDay && newDialogsByDay.length > 0 ? (
                <NewDialogsChart data={newDialogsByDay} />
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Нет данных
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Менеджеры (ТГ аккаунты) — единая таблица */}
        {accountStats?.stats && accountStats.stats.length > 0 && (
          <motion.div
            variants={analyticsSectionVariants}
            initial="hidden"
            animate="visible"
            custom={5}
          >
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Менеджеры</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-4 font-medium">Менеджер</th>
                        <th className="text-right py-2 pr-4 font-medium">Диалоги</th>
                        <th className="text-right py-2 pr-4 font-medium">Отправлено</th>
                        <th className="text-right py-2 pr-4 font-medium">Получено</th>
                        <th className="text-right py-2 pr-4 font-medium">Нужен ответ</th>
                        <th className="text-right py-2 pr-4 font-medium">Ср. ответ</th>
                        <th className="text-right py-2 font-medium">Нагрузка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountStats.stats.map((acc) => {
                        const total = acc.sent + acc.received;
                        const maxTotal = Math.max(...accountStats.stats.map(a => a.sent + a.received), 1);
                        const loadPct = Math.round((total / maxTotal) * 100);
                        const managerLabel = [acc.firstName, acc.lastName].filter(Boolean).join(" ") || acc.managerName;
                        return (
                          <tr key={acc.accountId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="py-2.5 pr-4">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <div className={`h-2 w-2 rounded-full ${acc.status === "active" ? "bg-green-400" : "bg-muted-foreground"}`} />
                                  <span className="font-medium">{managerLabel || "—"}</span>
                                </div>
                                <span className="text-xs text-muted-foreground ml-4">
                                  {acc.username ? `@${acc.username}` : `#${acc.accountId}`}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">{acc.newDialogs}</td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-green-400">{acc.sent}</td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-blue-400">{acc.received}</td>
                            <td className="py-2.5 pr-4 text-right">
                              {acc.needsReply > 0 ? (
                                <span className="text-red-400 font-semibold">{acc.needsReply}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                              {acc.avgResponseMs > 0 ? `${Math.round(acc.avgResponseMs / 60000)} мин` : "—"}
                            </td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${loadPct >= 50 ? "bg-primary" : "bg-primary/60"}`}
                                    style={{ width: `${loadPct}%` }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums w-8 text-right text-muted-foreground">{loadPct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="py-2.5 pr-4">Итого</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {accountStats.stats.reduce((s, a) => s + a.newDialogs, 0)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-green-400">
                          {totalSent}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-blue-400">
                          {totalReceived}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-red-400">
                          {totalNeedsReply}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                          {avgResponse ? `${avgResponse} мин` : "—"}
                        </td>
                        <td className="py-2.5 text-right" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* AI Insights */}
        <motion.div
          className="grid grid-cols-1 xl:grid-cols-3 gap-4"
          variants={analyticsSectionVariants}
          initial="hidden"
          animate="visible"
          custom={6}
        >
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Топ тем</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                Основано на {aiInsights?.analyzedDialogs ?? 0} диалогах с готовым ИИ-анализом за выбранный период.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiInsights?.topTopics?.length ? aiInsights.topTopics.map((item) => (
                <div key={item.topic} className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 px-3 py-2">
                  <span className="text-sm">{item.topic}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{item.count}</span>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">Нет AI-анализа за выбранный период</div>
              )}

              {!!aiInsights?.accountTopicBreakdown?.length && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    По аккаунтам
                  </p>
                  <div className="space-y-2">
                    {aiInsights.accountTopicBreakdown.map((account) => (
                      <div key={account.accountUsername} className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{account.accountUsername}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {account.analyzedDialogs} диалогов
                          </span>
                        </div>
                        {account.topics.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {account.topics.map((topic) => (
                              <span
                                key={`${account.accountUsername}-${topic.topic}`}
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-foreground/85"
                              >
                                <span className="max-w-[180px] truncate">{topic.topic}</span>
                                <span className="text-muted-foreground">{topic.count}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Для этого аккаунта тем пока мало.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <CardTitle className="text-sm font-semibold">Негативные диалоги</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {aiInsights?.negativeDialogs?.length ? aiInsights.negativeDialogs.map((item) => (
                <div key={item.dialogId} className="rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{item.contactName}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{item.accountUsername}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{item.summary}</p>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">Негативных диалогов не найдено</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightCircle className="h-4 w-4 text-amber-400" />
                <CardTitle className="text-sm font-semibold">Нужен follow-up</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {aiInsights?.followUpDialogs?.length ? aiInsights.followUpDialogs.map((item) => (
                <div key={item.dialogId} className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{item.contactName}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{item.accountUsername}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {item.nextStep || item.summary}
                  </p>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">Нет диалогов для follow-up</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={analyticsSectionVariants}
          initial="hidden"
          animate="visible"
          custom={7}
        >
          <Card className="border-border bg-gradient-to-br from-primary/10 via-background to-amber-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Ключевые выводы</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {insightHighlights.length ? (
                insightHighlights.map((highlight) => (
                  <div key={highlight} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-foreground/90">
                    {highlight}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  Недостаточно данных для выводов за выбранный период.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, suffix, icon: Icon, color, bgColor,
}: {
  title: string; value: number; suffix?: string; icon: any; color: string; bgColor: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{title}</span>
          <div className={`h-7 w-7 rounded-lg ${bgColor} flex items-center justify-center`}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
          </div>
        </div>
        <p className="text-2xl font-bold tabular-nums">
          {value.toLocaleString()}{suffix ?? ""}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Bar Chart (Messages by Day) — SVG ──────────────────────────────────────
function BarChartSimple({ data }: { data: { day: string; incoming: number; outgoing: number }[] }) {
  const maxVal = useMemo(() => Math.max(...data.map(d => d.incoming + d.outgoing), 1), [data]);
  const [tooltip, setTooltip] = useState<{ x: number; d: typeof data[0] } | null>(null);

  const chartH = 180;
  const chartW = 700;
  const barGap = 2;
  const labelH = 20;
  const showEvery = Math.max(1, Math.ceil(data.length / 14));
  const barW = Math.max(4, (chartW - barGap * data.length) / data.length);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-blue-400" /><span>Входящие</span></div>
        <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-primary" /><span>Исходящие</span></div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${chartW} ${chartH + labelH}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map(pct => (
            <line key={pct} x1={0} y1={chartH * (1 - pct)} x2={chartW} y2={chartH * (1 - pct)} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray="4 4" />
          ))}
          {data.map((d, i) => {
            const x = i * (barW + barGap);
            const totalH = ((d.incoming + d.outgoing) / maxVal) * chartH;
            const outH = (d.outgoing / maxVal) * chartH;
            const inH = (d.incoming / maxVal) * chartH;
            return (
              <g key={d.day}
                onMouseEnter={() => setTooltip({ x: x + barW / 2, d })}
                onMouseLeave={() => setTooltip(null)}
                className="cursor-pointer"
              >
                {/* Outgoing (bottom) */}
                <rect x={x} y={chartH - totalH} width={barW} height={outH} rx={1.5}
                  className="fill-primary" opacity={0.9} />
                {/* Incoming (top of stack) */}
                <rect x={x} y={chartH - inH} width={barW} height={inH} rx={1.5}
                  className="fill-blue-400" opacity={0.85} />
                {/* Label */}
                {i % showEvery === 0 && (
                  <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                    {d.day.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {/* Tooltip overlay */}
        {tooltip && (
          <div className="absolute top-0 bg-popover text-popover-foreground border border-border rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap pointer-events-none z-10 shadow-lg"
            style={{ left: `${(tooltip.x / chartW) * 100}%`, transform: 'translateX(-50%)' }}>
            <p className="font-semibold">{tooltip.d.day}</p>
            <p className="text-blue-400">Вход: {tooltip.d.incoming.toLocaleString()}</p>
            <p style={{ color: 'oklch(0.75 0.18 55)' }}>Исход: {tooltip.d.outgoing.toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Status Breakdown ────────────────────────────────────────────────────────
function StatusBreakdown({ data }: { data: { status: string; count: number }[] }) {
  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);
  const sorted = useMemo(() => [...data].sort((a, b) => b.count - a.count), [data]);

  return (
    <div className="space-y-3">
      {sorted.map(d => {
        const cfg = statusLabels[d.status] ?? { label: d.status, color: "#6b7280" };
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        return (
          <div key={d.status} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{cfg.label}</span>
              <span className="text-muted-foreground tabular-nums">{d.count} ({pct}%)</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: cfg.color }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-2 border-t border-border text-xs text-muted-foreground flex justify-between">
        <span>Всего</span>
        <span className="font-semibold text-foreground">{total}</span>
      </div>
    </div>
  );
}

// ─── Hourly Activity Chart — SVG ────────────────────────────────────────────
function HourlyChart({ data }: { data: { hour: number; count: number }[] }) {
  const hours = useMemo(() => {
    const map = new Map(data.map(d => [d.hour, d.count]));
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: map.get(i) ?? 0 }));
  }, [data]);
  const maxVal = useMemo(() => Math.max(...hours.map(h => h.count), 1), [hours]);
  const [hovered, setHovered] = useState<number | null>(null);

  const chartH = 140;
  const chartW = 500;
  const barW = (chartW - 24 * 2) / 24;
  const labelH = 18;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${chartW} ${chartH + labelH}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={0} y1={chartH * (1 - pct)} x2={chartW} y2={chartH * (1 - pct)} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray="4 4" />
        ))}
        {hours.map((h, i) => {
          const x = i * (barW + 2);
          const barH = (h.count / maxVal) * chartH;
          const intensity = h.count / maxVal;
          return (
            <g key={h.hour}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <rect x={x} y={chartH - barH} width={barW} height={barH} rx={2}
                fill={`oklch(${0.65 + intensity * 0.15} ${0.15 + intensity * 0.1} 30)`}
                opacity={hovered === i ? 1 : 0.85}
              />
              {h.hour % 3 === 0 && (
                <text x={x + barW / 2} y={chartH + 13} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                  {h.hour}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered !== null && (
        <div className="absolute top-0 bg-popover text-popover-foreground border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap pointer-events-none z-10 shadow-lg"
          style={{ left: `${((hovered * (barW + 2) + barW / 2) / chartW) * 100}%`, transform: 'translateX(-50%)' }}>
          <p className="font-semibold">{hours[hovered].hour}:00</p>
          <p>{hours[hovered].count.toLocaleString()} сообщ.</p>
        </div>
      )}
    </div>
  );
}

// ─── New Dialogs by Day Chart — SVG ─────────────────────────────────────────
function NewDialogsChart({ data }: { data: { day: string; count: number }[] }) {
  const maxVal = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);
  const [tooltip, setTooltip] = useState<{ x: number; d: typeof data[0] } | null>(null);

  const chartH = 140;
  const chartW = 500;
  const barGap = 2;
  const showEvery = Math.max(1, Math.ceil(data.length / 14));
  const barW = Math.max(4, (chartW - barGap * data.length) / data.length);
  const labelH = 18;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${chartW} ${chartH + labelH}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={0} y1={chartH * (1 - pct)} x2={chartW} y2={chartH * (1 - pct)} stroke="currentColor" className="text-border" strokeWidth={0.5} strokeDasharray="4 4" />
        ))}
        {data.map((d, i) => {
          const x = i * (barW + barGap);
          const barH = (d.count / maxVal) * chartH;
          return (
            <g key={d.day}
              onMouseEnter={() => setTooltip({ x: x + barW / 2, d })}
              onMouseLeave={() => setTooltip(null)}
              className="cursor-pointer"
            >
              <rect x={x} y={chartH - barH} width={barW} height={barH} rx={1.5}
                className="fill-emerald-400" opacity={0.85} />
              {i % showEvery === 0 && (
                <text x={x + barW / 2} y={chartH + 13} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                  {d.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div className="absolute top-0 bg-popover text-popover-foreground border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap pointer-events-none z-10 shadow-lg"
          style={{ left: `${(tooltip.x / chartW) * 100}%`, transform: 'translateX(-50%)' }}>
          <p className="font-semibold">{tooltip.d.day}</p>
          <p>{tooltip.d.count} диалогов</p>
        </div>
      )}
    </div>
  );
}
