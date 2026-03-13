import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useRealtimeInbox } from "@/hooks/useRealtimeInbox";
import {
  MessageSquare,
  Users,
  Kanban,
  BarChart3,
  Tag,
  Bot,
  Smartphone,
  Settings,
  LogOut,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Loader2 } from "lucide-react";

const NAV_ITEMS = [
  { icon: MessageSquare, label: "Сообщения", path: "/messages" },
  { icon: Users, label: "Контакты", path: "/contacts" },
  { icon: Kanban, label: "Воронки", path: "/funnels" },
  { icon: BarChart3, label: "Аналитика", path: "/analytics" },
  { icon: Tag, label: "Теги", path: "/tags" },
  { icon: Bot, label: "Робот", path: "/bot" },
  { icon: Smartphone, label: "Аккаунты", path: "/accounts" },
  { icon: Settings, label: "Настройки", path: "/settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();

  // SSE real-time connection
  useRealtimeInbox();

  // Unread count for messages badge
  const { data: unreadData } = trpc.dialogs.list.useQuery(
    { status: "all" },
    { enabled: !!user }
  );
  const totalUnread = unreadData?.reduce((sum, d) => sum + (d.dialog.unreadCount ?? 0), 0) ?? 0;

  if (loading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-sm w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <MessageSquare className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-2xl font-black tracking-tight">
                TeleDesk
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Центр коммуникаций с партнёрами
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = "/login"; }}
            size="lg"
            className="w-full font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
          >
            Войти в систему
          </Button>
        </div>
      </div>
    );
  }

  const isActive = (path: string) => {
    if (path === "/messages") {
      return location === "/messages" || location.startsWith("/messages/");
    }
    return location.startsWith(path);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      {/* Thin icon sidebar */}
      <nav className="w-[60px] shrink-0 bg-[oklch(0.08_0.006_240)] border-r border-border flex flex-col items-center py-3 gap-1">
        {/* Logo */}
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-md shadow-primary/20">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>

        {/* Nav items */}
        <div className="flex flex-col items-center gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const showBadge = item.path === "/messages" && totalUnread > 0;

            return (
              <Tooltip key={item.path} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setLocation(item.path)}
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {/* Active indicator bar */}
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full -ml-[5px]" />
                    )}
                    <item.icon className="h-[18px] w-[18px]" />
                    {showBadge && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="font-medium">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* User avatar at bottom */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold hover:bg-primary/30 transition-colors mt-2">
              {user.name?.charAt(0).toUpperCase() ?? "U"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={12} className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-semibold truncate">{user.name ?? "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email ?? ""}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* Main content area */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
