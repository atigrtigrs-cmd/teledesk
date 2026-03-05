import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare,
  Zap,
  BarChart3,
  Bot,
  Shield,
  ArrowRight,
  CheckCircle2,
  Building2,
  Smartphone,
} from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      setLocation("/inbox");
    }
  }, [user, loading, setLocation]);

  if (loading) return null;
  if (user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow shadow-primary/40">
              <MessageSquare className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-black text-base tracking-tight">
              LeadCash<span className="text-primary"> Connect</span>
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => setLocation("/login")}
            className="font-semibold shadow shadow-primary/30 hover:shadow-primary/50 transition-shadow"
          >
            Войти
          </Button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Diagonal split background */}
        <div className="absolute inset-0 flex">
          <div className="w-1/2 bg-background" />
          <div className="w-1/2 bg-card/60" style={{ clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0% 100%)" }} />
        </div>
        {/* Glow */}
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-primary/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-28">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/12 border border-primary/25 text-primary text-xs font-semibold mb-7 uppercase tracking-wider">
              <Zap className="h-3 w-3" />
              Telegram → Битрикс24
            </div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.05] mb-6">
              ВАШИ КЛИЕНТЫ —<br />
              <span className="text-primary">НАША РАБОТА</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed mb-10 max-w-md">
              Подключите личные Telegram аккаунты через QR-код. Все входящие сообщения автоматически создают сделки в Битрикс24. ИИ анализирует каждый диалог.
            </p>
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                onClick={() => setLocation("/register")}
                className="gap-2 font-bold text-sm px-7 shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow"
              >
                Начать бесплатно
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-8 mt-12 pt-8 border-t border-border/40">
              {[
                { value: "3+", label: "Telegram аккаунта" },
                { value: "100%", label: "Автоматизация" },
                { value: "24/7", label: "Мониторинг" },
              ].map((s, i) => (
                <div key={i}>
                  <p className="text-2xl font-black text-primary">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/40">
            {[
              { step: "РЕГИСТРАЦИЯ", desc: "Войдите в LeadCash Connect и подключите Telegram аккаунты через QR-код за 2 минуты" },
              { step: "ИНТЕГРАЦИЯ", desc: "Вставьте webhook Битрикс24 и выберите воронку для автоматического создания сделок" },
              { step: "ЗАПУСК", desc: "Все входящие сообщения создают сделки. ИИ пишет резюме диалога в карточку" },
            ].map((s, i) => (
              <div key={i} className="px-8 py-6 first:pl-0 last:pr-0">
                <p className="text-xs font-black text-primary tracking-widest mb-2">{s.step}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-xs font-black text-primary tracking-widest mb-3 uppercase">Возможности</p>
          <h2 className="text-3xl font-black tracking-tight">
            Работаем на форматах
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: MessageSquare,
              title: "Единый Inbox",
              desc: "Все переписки из всех Telegram аккаунтов в одном интерфейсе. Фильтры по статусу, тегам и менеджеру.",
              accent: true,
            },
            {
              icon: Building2,
              title: "Битрикс24",
              desc: "Автоматическое создание сделок в нужной воронке. Резюме диалога записывается в карточку сделки.",
            },
            {
              icon: Bot,
              title: "ИИ-анализ",
              desc: "Краткое резюме диалога, тональность (позитив/негатив) и автоматические теги.",
            },
            {
              icon: Zap,
              title: "Быстрые ответы",
              desc: "Шаблоны ответов одной кнопкой. Автоответы на первое сообщение и вне рабочего времени.",
            },
            {
              icon: BarChart3,
              title: "Аналитика",
              desc: "Статистика по диалогам, менеджерам и аккаунтам. Тональность переписок в реальном времени.",
            },
            {
              icon: Shield,
              title: "Безопасность",
              desc: "Сессии Telegram хранятся зашифрованно. Подключение через официальный QR-код Telegram.",
            },
          ].map((f, i) => (
            <div
              key={i}
              className={`p-6 rounded-xl border transition-all group cursor-default ${
                f.accent
                  ? "bg-primary/8 border-primary/30 hover:border-primary/60"
                  : "bg-card border-border hover:border-border/80 hover:bg-card/80"
              }`}
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-5 ${
                f.accent ? "bg-primary shadow-md shadow-primary/30" : "bg-muted"
              }`}>
                <f.icon className={`h-5 w-5 ${f.accent ? "text-primary-foreground" : "text-primary"}`} />
              </div>
              <h3 className="font-bold text-sm mb-2">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Wide geo / Telegram accounts ── */}
      <section className="bg-card/40 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-black text-primary tracking-widest mb-3 uppercase">Подключение</p>
              <h2 className="text-3xl font-black tracking-tight mb-5">
                Широкая поддержка<br />Telegram аккаунтов
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Подключайте неограниченное количество личных Telegram аккаунтов. Каждый аккаунт — отдельная воронка и отдельный менеджер.
              </p>
              <div className="space-y-2.5">
                {[
                  "Подключение через QR-код (как Telegram Web)",
                  "Без ввода API ключей — всё автоматически",
                  "Сессии хранятся зашифрованно",
                  "Мгновенное отключение из админки",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Smartphone, label: "Личный аккаунт 1" },
                { icon: Smartphone, label: "Личный аккаунт 2" },
                { icon: Smartphone, label: "Рабочий аккаунт" },
                { icon: Smartphone, label: "+ Добавить" },
              ].map((acc, i) => (
                <div key={i} className={`p-4 rounded-xl border flex flex-col items-center gap-2 text-center ${
                  i === 3
                    ? "border-dashed border-primary/30 bg-primary/5 text-primary"
                    : "border-border bg-card"
                }`}>
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                    i === 3 ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <acc.icon className={`h-4 w-4 ${i === 3 ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`text-xs font-medium ${i === 3 ? "text-primary" : ""}`}>{acc.label}</span>
                  {i < 3 && <span className="text-xs text-green-400 font-medium">● Активен</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-primary/6 border border-primary/20 rounded-2xl" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative px-10 py-14 flex flex-col items-center text-center gap-6">
            <p className="text-xs font-black text-primary tracking-widest uppercase">Нет аккаунта?</p>
            <h2 className="text-3xl font-black tracking-tight">
              Чего ждёте?
            </h2>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Подключите первый Telegram аккаунт за 2 минуты и начните получать сделки в Битрикс24 автоматически
            </p>
            <Button
              size="lg"
              onClick={() => setLocation("/register")}
              className="gap-2 font-bold px-8 shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow"
            >
              Начать бесплатно
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <MessageSquare className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-black">
              LeadCash<span className="text-primary"> Connect</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">© 2025 LeadCash Connect. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
}
