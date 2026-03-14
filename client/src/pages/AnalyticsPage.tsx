import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

type Period = "today" | "week" | "month" | "all";

const statusLabels: Record<string, { label: string; color: string }> = {
  open: { label: "Открыт", color: "#3b82f6" },
  in_progress: { label: "В работе", color: "#f97316" },
  waiting: { label: "Ожидает", color: "#eab308" },
  needs_reply: { label: "Ответить", color: "#ef4444" },
  resolved: { label: "Решён", color: "#22c55e" },
  closed: { label: "Закрыт", color: "#6b7280" },
  archived: { label: "Архив", color: "#71717a" },
};

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("week");

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summaryByPeriod.useQuery({ period });
  const { data: accountStats } = trpc.analytics.accountStats.useQuery({ period });
  const { data: managerStats } = trpc.analytics.managerUserStats.useQuery({ period });
  const { data: messagesByDay } = trpc.analytics.messagesByDay.useQuery({ period });
  const { data: dialogsByStatus } = trpc.analytics.dialogsByStatus.useQuery({ period });
  const { data: hourlyActivity } = trpc.analytics.hourlyActivity.useQuery({ period });
  const { data: newDialogsByDay } = trpc.analytics.newDialogsByDay.useQuery({ period });

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto py-6 px-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Аналитика</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Обзор активности и эффективности</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Сегодня</SelectItem>
              <SelectItem value="week">Неделя</SelectItem>
              <SelectItem value="month">Месяц</SelectItem>
              <SelectItem value="all">Всё время</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards - 2 rows */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard title="Диалоги" value={summary?.totalDialogs ?? 0} icon={MessageSquare} color="text-blue-400" bgColor="bg-blue-500/10" />
              <KpiCard title="Сообщения" value={summary?.totalMessages ?? 0} icon={Zap} color="text-primary" bgColor="bg-primary/10" />
              <KpiCard title="Отправлено" value={totalSent} icon={ArrowUpRight} color="text-green-400" bgColor="bg-green-500/10" />
              <KpiCard title="Получено" value={totalReceived} icon={ArrowDownLeft} color="text-cyan-400" bgColor="bg-cyan-500/10" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            </div>
          </>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
        </div>

        {/* Second Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        </div>

        {/* Account Stats Table */}
        {accountStats?.stats && accountStats.stats.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Статистика по аккаунтам</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4 font-medium">Аккаунт</th>
                      <th className="text-left py-2 pr-4 font-medium">Менеджер</th>
                      <th className="text-right py-2 pr-4 font-medium">Диалоги</th>
                      <th className="text-right py-2 pr-4 font-medium">Отправлено</th>
                      <th className="text-right py-2 pr-4 font-medium">Получено</th>
                      <th className="text-right py-2 pr-4 font-medium">Ответить</th>
                      <th className="text-right py-2 font-medium">Ср. ответ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountStats.stats.map((acc) => (
                      <tr key={acc.accountId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${acc.status === "active" ? "bg-green-400" : "bg-muted-foreground"}`} />
                            <span className="font-medium">
                              {acc.username ? `@${acc.username}` : acc.firstName ?? `#${acc.accountId}`}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{acc.managerName ?? "—"}</td>
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
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {acc.avgResponseMs > 0 ? `${Math.round(acc.avgResponseMs / 60000)} мин` : "—"}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-2.5 pr-4" colSpan={2}>Итого</td>
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
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {avgResponse ? `${avgResponse} мин` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manager Stats Table */}
        {managerStats && managerStats.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Эффективность менеджеров</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4 font-medium">Менеджер</th>
                      <th className="text-right py-2 pr-4 font-medium">Назначено</th>
                      <th className="text-right py-2 pr-4 font-medium">Открытые</th>
                      <th className="text-right py-2 pr-4 font-medium">Закрытые</th>
                      <th className="text-right py-2 pr-4 font-medium">Отправлено</th>
                      <th className="text-right py-2 pr-4 font-medium">Ср. ответ</th>
                      <th className="text-right py-2 font-medium">Эффективность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerStats.map((m) => {
                      const efficiency = m.assigned > 0 ? Math.round((m.closed / m.assigned) * 100) : 0;
                      return (
                        <tr key={m.userId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{m.assigned}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-blue-400">{m.open}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-green-400">{m.closed}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{m.sentMessages}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                            {m.avgResponseMinutes != null ? `${m.avgResponseMinutes} мин` : "—"}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${efficiency >= 70 ? "bg-green-400" : efficiency >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                  style={{ width: `${Math.min(100, efficiency)}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums w-8 text-right">{efficiency}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
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

// ─── Bar Chart (Messages by Day) ─────────────────────────────────────────────
function BarChartSimple({ data }: { data: { day: string; incoming: number; outgoing: number }[] }) {
  const maxVal = useMemo(() => Math.max(...data.map(d => d.incoming + d.outgoing), 1), [data]);

  // Show max 14 labels for readability
  const showEvery = Math.max(1, Math.ceil(data.length / 14));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-blue-400" />
          <span>Входящие</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
          <span>Исходящие</span>
        </div>
      </div>
      <div className="flex items-end gap-[2px] h-48">
        {data.map((d, i) => {
          const inH = (d.incoming / maxVal) * 100;
          const outH = (d.outgoing / maxVal) * 100;
          const dayLabel = d.day.slice(5); // MM-DD
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center group relative">
              {/* Tooltip */}
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border border-border rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                <p className="font-semibold">{d.day}</p>
                <p className="text-blue-400">Вход: {d.incoming}</p>
                <p className="text-primary">Исход: {d.outgoing}</p>
              </div>
              <div className="w-full flex flex-col items-center gap-[1px]">
                <div className="w-full rounded-t-sm bg-primary transition-all" style={{ height: `${outH}%`, minHeight: d.outgoing > 0 ? 2 : 0 }} />
                <div className="w-full rounded-b-sm bg-blue-400 transition-all" style={{ height: `${inH}%`, minHeight: d.incoming > 0 ? 2 : 0 }} />
              </div>
              {i % showEvery === 0 && (
                <span className="text-[9px] text-muted-foreground mt-1 rotate-0">{dayLabel}</span>
              )}
            </div>
          );
        })}
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

// ─── Hourly Activity Chart ───────────────────────────────────────────────────
function HourlyChart({ data }: { data: { hour: number; count: number }[] }) {
  // Fill all 24 hours
  const hours = useMemo(() => {
    const map = new Map(data.map(d => [d.hour, d.count]));
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: map.get(i) ?? 0 }));
  }, [data]);

  const maxVal = useMemo(() => Math.max(...hours.map(h => h.count), 1), [hours]);

  return (
    <div className="flex items-end gap-[2px] h-40">
      {hours.map(h => {
        const height = (h.count / maxVal) * 100;
        const intensity = h.count / maxVal;
        return (
          <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
              <p className="font-semibold">{h.hour}:00</p>
              <p>{h.count} сообщ.</p>
            </div>
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${height}%`,
                minHeight: h.count > 0 ? 2 : 0,
                backgroundColor: `oklch(${0.65 + intensity * 0.15} ${0.15 + intensity * 0.1} 30)`,
              }}
            />
            {h.hour % 3 === 0 && (
              <span className="text-[9px] text-muted-foreground mt-1">{h.hour}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── New Dialogs by Day Chart ────────────────────────────────────────────────
function NewDialogsChart({ data }: { data: { day: string; count: number }[] }) {
  const maxVal = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);
  const showEvery = Math.max(1, Math.ceil(data.length / 14));

  return (
    <div className="flex items-end gap-[2px] h-40">
      {data.map((d, i) => {
        const height = (d.count / maxVal) * 100;
        const dayLabel = d.day.slice(5);
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center group relative">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border border-border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
              <p className="font-semibold">{d.day}</p>
              <p>{d.count} диалогов</p>
            </div>
            <div
              className="w-full rounded-t-sm bg-emerald-400 transition-all"
              style={{ height: `${height}%`, minHeight: d.count > 0 ? 2 : 0 }}
            />
            {i % showEvery === 0 && (
              <span className="text-[9px] text-muted-foreground mt-1">{dayLabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
