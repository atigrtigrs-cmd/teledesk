import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare,
  Zap,
  BarChart3,
  Bot,
  ArrowRight,
  CheckCircle2,
  Users,
  Briefcase,
  Activity,
  Shield,
  TrendingUp,
  Bell,
  Clock,
  LayoutDashboard,
  Radio,
  ChevronRight,
} from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  if (loading) return null;
  if (user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded bg-primary flex items-center justify-center">
              <MessageSquare className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-black text-sm tracking-tight">
              LeadCash<span className="text-primary"> Connect</span>
            </span>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary/80 hidden md:flex">
              Communication Management
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setLocation("/login")}>
              Войти
            </Button>
            <Button size="sm" className="text-xs font-bold gap-1.5" onClick={() => setLocation("/register")}>
              Начать работу
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative border-b border-border/40">
        {/* Grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background pointer-events-none" />
        {/* Accent glow */}
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/6 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-48 h-48 bg-primary/4 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6 tracking-wide">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Центр управления коммуникациями
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-5">
                КОНТРОЛЬ<br />
                ВСЕХ КАНАЛОВ<br />
                <span className="text-primary">В ОДНОМ МЕСТЕ</span>
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-lg">
                Единая платформа для управления командой менеджеров, Telegram-аккаунтами и сделками в Битрикс24. Полная видимость каждого диалога в реальном времени.
              </p>
              <div className="flex items-center gap-3 mb-10">
                <Button
                  size="lg"
                  onClick={() => setLocation("/register")}
                  className="gap-2 font-bold text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
                >
                  Подключить платформу
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="lg" className="text-sm text-muted-foreground" onClick={() => setLocation("/login")}>
                  Войти в кабинет
                </Button>
              </div>
              <div className="flex items-center gap-6 pt-6 border-t border-border/40">
                {[
                  { value: "Real-time", label: "Мониторинг" },
                  { value: "Auto", label: "Сделки в CRM" },
                  { value: "AI", label: "Анализ диалогов" },
                ].map((s, i) => (
                  <div key={i}>
                    <p className="text-lg font-black text-primary">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Dashboard preview mockup */}
            <div className="relative hidden lg:block">
              <div className="rounded-xl border border-border bg-card/80 backdrop-blur overflow-hidden shadow-2xl shadow-black/40">
                {/* Mockup header */}
                <div className="border-b border-border/60 px-4 py-3 flex items-center gap-3 bg-muted/30">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <div className="flex-1 h-5 rounded bg-muted/60 max-w-xs" />
                  <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium">Live</span>
                </div>
                {/* Mockup content */}
                <div className="p-4 space-y-3">
                  {/* KPI row */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Диалоги", val: "247", color: "text-blue-400" },
                      { label: "Сделки", val: "89", color: "text-amber-400" },
                      { label: "Сообщения", val: "1.4K", color: "text-green-400" },
                      { label: "Менеджеры", val: "6", color: "text-purple-400" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-muted/40 rounded-lg p-2.5 border border-border/40">
                        <p className={`text-base font-black ${color}`}>{val}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Manager table */}
                  <div className="bg-muted/20 rounded-lg border border-border/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
                      <Users className="h-3 w-3 text-primary" />
                      <span className="text-xs font-bold">Рейтинг менеджеров</span>
                    </div>
                    {[
                      { medal: "🥇", name: "Алексей К.", dialogs: 84, deals: 31, status: "active" },
                      { medal: "🥈", name: "Мария С.", dialogs: 67, deals: 24, status: "active" },
                      { medal: "🥉", name: "Дмитрий В.", dialogs: 52, deals: 18, status: "active" },
                    ].map((m) => (
                      <div key={m.name} className="px-3 py-2 flex items-center gap-2 border-b border-border/30 last:border-0">
                        <span className="text-sm">{m.medal}</span>
                        <span className="text-xs font-medium flex-1">{m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.dialogs} диал.</span>
                        <span className="text-xs text-amber-400 font-bold">{m.deals} сд.</span>
                        <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      </div>
                    ))}
                  </div>
                  {/* Activity bars */}
                  <div className="bg-muted/20 rounded-lg border border-border/40 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-3 w-3 text-primary" />
                      <span className="text-xs font-bold">Активность</span>
                    </div>
                    <div className="flex items-end gap-1 h-12">
                      {[4, 7, 5, 9, 6, 11, 8, 13, 10, 15, 12, 9, 14, 11].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-primary/40"
                          style={{ height: `${(h / 15) * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Floating notification */}
              <div className="absolute -top-3 -right-3 bg-card border border-border rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-green-500/20 flex items-center justify-center">
                  <Briefcase className="h-3 w-3 text-green-400" />
                </div>
                <div>
                  <p className="text-xs font-bold">Новая сделка</p>
                  <p className="text-xs text-muted-foreground">Битрикс24 • только что</p>
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-3 -left-3 bg-card border border-border rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <p className="text-xs font-bold text-primary">3 новых сообщения</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Core capabilities strip ── */}
      <section className="border-b border-border/40 bg-muted/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40">
            {[
              { icon: LayoutDashboard, label: "Единый дашборд", desc: "Все метрики в одном экране" },
              { icon: Users, label: "Команда менеджеров", desc: "Каждый TG аккаунт = менеджер" },
              { icon: Briefcase, label: "Авто-сделки CRM", desc: "Битрикс24 без ручного ввода" },
              { icon: Bell, label: "Live уведомления", desc: "SSE push без перезагрузки" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="px-6 py-5 flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-bold">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features: Manager control ── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs font-black text-primary tracking-widest mb-3 uppercase">Управление командой</p>
            <h2 className="text-3xl font-black tracking-tight mb-5">
              Каждый менеджер —<br />под контролем
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              Привяжите каждый Telegram-аккаунт к сотруднику Битрикс24. Все сделки автоматически назначаются нужному менеджеру. Видите кто работает, кто нет — в реальном времени.
            </p>
            <div className="space-y-3">
              {[
                { icon: Users, text: "Telegram аккаунт = менеджер Битрикс24" },
                { icon: Briefcase, text: "Сделки назначаются автоматически нужному сотруднику" },
                { icon: BarChart3, text: "Рейтинг менеджеров: диалоги, сделки, конверсия" },
                { icon: Activity, text: "Онлайн-статус каждого аккаунта в реальном времени" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Manager cards mockup */}
          <div className="space-y-2">
            {[
              { name: "Алексей Козлов", phone: "+7 999 111 22 33", dialogs: 84, deals: 31, conv: 37, status: "active", medal: "🥇" },
              { name: "Мария Смирнова", phone: "+7 999 444 55 66", dialogs: 67, deals: 24, conv: 36, status: "active", medal: "🥈" },
              { name: "Дмитрий Волков", phone: "+7 999 777 88 99", dialogs: 52, deals: 18, conv: 35, status: "active", medal: "🥉" },
            ].map((m) => (
              <div key={m.name} className="p-4 rounded-xl border border-border bg-card flex items-center gap-4">
                <span className="text-xl">{m.medal}</span>
                <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-sm shrink-0">
                  {m.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate">{m.name}</p>
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground">{m.phone}</p>
                </div>
                <div className="flex gap-4 text-center shrink-0">
                  <div>
                    <p className="text-sm font-black">{m.dialogs}</p>
                    <p className="text-xs text-muted-foreground">диал.</p>
                  </div>
                  <div>
                    <p className="text-sm font-black text-amber-400">{m.deals}</p>
                    <p className="text-xs text-muted-foreground">сделок</p>
                  </div>
                  <div>
                    <p className="text-sm font-black text-green-400">{m.conv}%</p>
                    <p className="text-xs text-muted-foreground">конв.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="border-t border-border/40 bg-muted/5">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="mb-10">
            <p className="text-xs font-black text-primary tracking-widest mb-3 uppercase">Платформа</p>
            <h2 className="text-3xl font-black tracking-tight">Полный стек управления</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: LayoutDashboard,
                title: "Главный дашборд",
                desc: "KPI карточки, непрочитанные диалоги, рейтинг менеджеров и график активности на одном экране.",
                accent: true,
              },
              {
                icon: MessageSquare,
                title: "Единый Inbox",
                desc: "Все переписки из всех Telegram-аккаунтов в одном интерфейсе. Фильтры, теги, статусы.",
              },
              {
                icon: Briefcase,
                title: "Авто-сделки Битрикс24",
                desc: "Каждое новое сообщение → сделка в нужной воронке. Ответственный назначается автоматически.",
              },
              {
                icon: Bot,
                title: "ИИ-анализ диалогов",
                desc: "Краткое резюме переписки, тональность (позитив/негатив) и теги записываются в карточку сделки.",
              },
              {
                icon: Radio,
                title: "Массовые рассылки",
                desc: "Отправляйте сообщения по группам контактов с нескольких аккаунтов одновременно.",
              },
              {
                icon: TrendingUp,
                title: "Аналитика",
                desc: "Конверсия по менеджерам, динамика диалогов, тональность — с фильтром по периоду.",
              },
              {
                icon: Zap,
                title: "Быстрые ответы",
                desc: "Шаблоны сообщений одной кнопкой. Автоответы на первое сообщение и вне рабочего времени.",
              },
              {
                icon: Clock,
                title: "Рабочие часы",
                desc: "Настройте расписание работы. Автоответ отправляется автоматически в нерабочее время.",
              },
              {
                icon: Shield,
                title: "Безопасность",
                desc: "Сессии Telegram хранятся зашифрованно. Подключение через официальный QR-код Telegram.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`p-5 rounded-xl border transition-colors ${
                  f.accent
                    ? "bg-primary/8 border-primary/25 hover:border-primary/50"
                    : "bg-card border-border hover:border-border/80"
                }`}
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-4 ${
                  f.accent ? "bg-primary shadow-md shadow-primary/30" : "bg-muted"
                }`}>
                  <f.icon className={`h-4 w-4 ${f.accent ? "text-primary-foreground" : "text-primary"}`} />
                </div>
                <h3 className="font-bold text-sm mb-1.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-border/40">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="mb-10">
            <p className="text-xs font-black text-primary tracking-widest mb-3 uppercase">Запуск</p>
            <h2 className="text-3xl font-black tracking-tight">Три шага до работы</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Подключите аккаунты",
                desc: "Войдите и подключите Telegram-аккаунты менеджеров через QR-код. Каждый аккаунт привязывается к сотруднику Битрикс24.",
                checks: ["QR-код как в Telegram Web", "Без API ключей", "Мгновенное подключение"],
              },
              {
                step: "02",
                title: "Настройте интеграцию",
                desc: "Вставьте webhook Битрикс24, выберите воронку и стадию для каждого аккаунта. Настройте ответственных.",
                checks: ["Webhook Битрикс24", "Воронка и стадия", "Ответственный менеджер"],
              },
              {
                step: "03",
                title: "Управляйте командой",
                desc: "Все входящие сообщения создают сделки автоматически. Дашборд показывает активность каждого менеджера в реальном времени.",
                checks: ["Авто-создание сделок", "Дашборд в реальном времени", "ИИ-анализ диалогов"],
              },
            ].map(({ step, title, desc, checks }) => (
              <div key={step} className="p-6 rounded-xl border border-border bg-card">
                <div className="text-4xl font-black text-primary/20 mb-4">{step}</div>
                <h3 className="font-black text-base mb-2">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{desc}</p>
                <div className="space-y-1.5">
                  {checks.map((c) => (
                    <div key={c} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs text-muted-foreground">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-border/40 bg-muted/5">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="relative rounded-2xl overflow-hidden border border-primary/20 bg-primary/5">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--primary)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary)/0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
            <div className="relative px-10 py-14 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <p className="text-xs font-black text-primary tracking-widest uppercase mb-2">Готовы к запуску?</p>
                <h2 className="text-3xl font-black tracking-tight mb-2">
                  Подключите команду<br />за 5 минут
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Все Telegram-аккаунты менеджеров в одном центре управления. Сделки в Битрикс24 — автоматически.
                </p>
              </div>
              <div className="flex flex-col gap-3 shrink-0">
                <Button
                  size="lg"
                  onClick={() => setLocation("/register")}
                  className="gap-2 font-bold px-8 shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow"
                >
                  Начать работу
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setLocation("/login")}
                  className="font-semibold px-8 bg-transparent"
                >
                  Войти в кабинет
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <MessageSquare className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-black">
              LeadCash<span className="text-primary"> Connect</span>
            </span>
            <span className="text-xs text-muted-foreground">— Центр управления коммуникациями</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2025 LeadCash Connect. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
}
