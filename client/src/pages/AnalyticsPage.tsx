import { useState, useMemo } from "react";
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
} from "lucide-react";

type Period = "today" | "week" | "month" | "all";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("week");

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summaryByPeriod.useQuery({ period });
  const { data: accountStats } = trpc.analytics.accountStats.useQuery({ period });
  const { data: managerStats } = trpc.analytics.managerUserStats.useQuery({ period });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto py-6 px-6 space-y-6">
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

        {/* KPI Cards */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Диалоги"
              value={summary?.totalDialogs ?? 0}
              icon={MessageSquare}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <KpiCard
              title="Сообщения"
              value={summary?.totalMessages ?? 0}
              icon={Zap}
              color="text-primary"
              bgColor="bg-primary/10"
            />
            <KpiCard
              title="Сделки"
              value={summary?.totalDeals ?? 0}
              icon={TrendingUp}
              color="text-green-400"
              bgColor="bg-green-500/10"
            />
            <KpiCard
              title="Активные аккаунты"
              value={summary?.activeAccounts ?? 0}
              icon={Users}
              color="text-violet-400"
              bgColor="bg-violet-500/10"
            />
          </div>
        )}

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
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {acc.managerName ?? "—"}
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
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {acc.avgResponseMs > 0
                            ? `${Math.round(acc.avgResponseMs / 60000)} мин`
                            : "—"
                          }
                        </td>
                      </tr>
                    ))}
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
                      <th className="text-right py-2 font-medium">Ср. ответ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerStats.map((m) => (
                      <tr key={m.userId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{m.assigned}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-blue-400">{m.open}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-green-400">{m.closed}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{m.sentMessages}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {m.avgResponseMinutes != null ? `${m.avgResponseMinutes} мин` : "—"}
                        </td>
                      </tr>
                    ))}
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

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  bgColor: string;
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
        <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
