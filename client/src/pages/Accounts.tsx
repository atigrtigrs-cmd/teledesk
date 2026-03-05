import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  MoreVertical,
  Plus,
  QrCode,
  Smartphone,
  Trash2,
  WifiOff,
  RefreshCw,
  MessageSquare,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
  active: {
    label: "Активен",
    dot: "bg-green-400",
    badge: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  pending: {
    label: "Ожидает",
    dot: "bg-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
  },
  disconnected: {
    label: "Отключён",
    dot: "bg-red-400",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  banned: {
    label: "Заблокирован",
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-500 border-red-500/20",
  },
};

export default function Accounts() {
  const [showQR, setShowQR] = useState(false);
  const { data: accounts, refetch } = trpc.accounts.list.useQuery();
  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => { toast.success("Аккаунт удалён"); refetch(); },
  });
  const updateStatusMutation = trpc.accounts.updateStatus.useMutation({
    onSuccess: () => { toast.success("Статус обновлён"); refetch(); },
  });
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => { toast.success("Аккаунт добавлен!"); refetch(); setShowQR(false); },
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Интеграция</p>
            <h1 className="text-2xl font-black tracking-tight">Telegram аккаунты</h1>
          </div>
          <Button onClick={() => setShowQR(true)} className="gap-2 font-bold shadow shadow-primary/25">
            <Plus className="h-4 w-4" />
            Добавить аккаунт
          </Button>
        </div>

        {/* Stats row */}
        {accounts && accounts.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Всего аккаунтов", value: accounts.length, icon: Smartphone },
              { label: "Активных", value: accounts.filter(a => a.status === "active").length, icon: Wifi },
              { label: "Диалогов сегодня", value: 0, icon: MessageSquare },
            ].map((stat, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-black">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Accounts Grid */}
        {!accounts?.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/8 border border-primary/20 flex items-center justify-center mb-5">
              <Smartphone className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-black text-lg mb-2">Нет подключённых аккаунтов</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Добавьте Telegram аккаунт через QR-код, чтобы начать получать сообщения
            </p>
            <Button onClick={() => setShowQR(true)} className="gap-2 font-bold shadow shadow-primary/25">
              <QrCode className="h-4 w-4" />
              Подключить через QR
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map(acc => {
              const status = statusConfig[acc.status] ?? statusConfig.disconnected;
              const displayName = [acc.firstName, acc.lastName].filter(Boolean).join(" ") || acc.phone || "Аккаунт";
              const initial = displayName.charAt(0).toUpperCase();

              return (
                <div key={acc.id} className={`bg-card border rounded-xl p-5 transition-all ${
                  acc.status === "active" ? "border-border" : "border-border/50"
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-black text-base shadow shadow-primary/25">
                          {initial}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${status.dot}`} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {acc.username ? `@${acc.username}` : acc.phone ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${status.badge}`}>
                        {status.label}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {acc.status === "disconnected" && (
                            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: acc.id, status: "active" })}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Переподключить
                            </DropdownMenuItem>
                          )}
                          {acc.status === "active" && (
                            <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: acc.id, status: "disconnected" })}>
                              <WifiOff className="mr-2 h-4 w-4" />
                              Отключить
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => deleteMutation.mutate({ id: acc.id })}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border/60 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>ID: {acc.telegramId ?? "—"}</span>
                    <span>·</span>
                    <span>Добавлен {new Date(acc.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* QR Connect Dialog */}
        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-black">Подключить Telegram</DialogTitle>
              <DialogDescription className="text-xs">
                Откройте Telegram → Настройки → Устройства → Подключить устройство и отсканируйте QR-код
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-5 py-4">
              {/* QR Code placeholder */}
              <div className="h-48 w-48 rounded-2xl border-2 border-dashed border-primary/30 flex flex-col items-center justify-center gap-3 bg-primary/5">
                <QrCode className="h-16 w-16 text-primary/40" />
                <p className="text-xs text-muted-foreground text-center px-4">
                  QR-код появится после подключения бэкенда
                </p>
              </div>

              <div className="w-full space-y-2.5">
                {[
                  "Откройте Telegram на телефоне",
                  "Настройки → Устройства → Подключить устройство",
                  "Наведите камеру на QR-код",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <span className="text-sm">{step}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => setShowQR(false)}>
                  Отмена
                </Button>
                <Button
                  className="flex-1 font-bold"
                  onClick={() => createMutation.mutate({ status: "active", firstName: "Тестовый", phone: "+7 999 000 00 00" })}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Добавление..." : "Добавить (демо)"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
