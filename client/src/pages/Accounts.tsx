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
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

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

// Convert base64 token to tg://login?token=... URL
function buildTelegramQRUrl(tokenBase64: string): string {
  // Convert base64 to hex
  const bytes = atob(tokenBase64);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `tg://login?token=${hex}`;
}

export default function Accounts() {
  const [showQR, setShowQR] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<number | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState<number | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);

  const { data: accounts, refetch } = trpc.accounts.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => { toast.success("Аккаунт удалён"); refetch(); },
  });
  const updateStatusMutation = trpc.accounts.updateStatus.useMutation({
    onSuccess: () => { toast.success("Статус обновлён"); refetch(); },
  });
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: (acc) => {
      refetch();
      setPendingAccountId(acc.id);
    },
  });
  const startQRMutation = trpc.accounts.startQRLogin.useMutation({
    onSuccess: (data) => {
      setQrToken(data.token);
      setQrExpires(data.expires);
      setQrExpired(false);
      setQrLoading(false);
    },
    onError: (err) => {
      toast.error("Ошибка запуска QR: " + err.message);
      setQrLoading(false);
    },
  });

  // Start QR login when pendingAccountId is set
  useEffect(() => {
    if (pendingAccountId !== null) {
      setQrLoading(true);
      setQrToken(null);
      startQRMutation.mutate({ accountId: pendingAccountId });
    }
  }, [pendingAccountId]);

  // Check QR expiry
  useEffect(() => {
    if (!qrExpires) return;
    const now = Math.floor(Date.now() / 1000);
    const remaining = qrExpires - now;
    if (remaining <= 0) {
      setQrExpired(true);
      return;
    }
    const timer = setTimeout(() => setQrExpired(true), remaining * 1000);
    return () => clearTimeout(timer);
  }, [qrExpires]);

  // Poll for account becoming active
  useEffect(() => {
    if (!pendingAccountId || !showQR) return;
    const interval = setInterval(async () => {
      await refetch();
      const acc = accounts?.find(a => a.id === pendingAccountId);
      if (acc?.status === "active") {
        toast.success(`Telegram аккаунт ${acc.firstName ?? acc.phone ?? ""} подключён!`);
        setShowQR(false);
        setPendingAccountId(null);
        setQrToken(null);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pendingAccountId, showQR, accounts]);

  const handleOpenQR = () => {
    setShowQR(true);
    setPendingAccountId(null);
    setQrToken(null);
    setQrExpired(false);
  };

  const handleCloseQR = () => {
    setShowQR(false);
    setPendingAccountId(null);
    setQrToken(null);
    setQrExpired(false);
  };

  const handleStartQR = () => {
    createMutation.mutate({ status: "pending" });
  };

  const handleRefreshQR = () => {
    if (pendingAccountId) {
      setQrLoading(true);
      setQrExpired(false);
      startQRMutation.mutate({ accountId: pendingAccountId });
    }
  };

  const qrUrl = qrToken ? buildTelegramQRUrl(qrToken) : null;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Интеграция</p>
            <h1 className="text-2xl font-black tracking-tight">Telegram аккаунты</h1>
          </div>
          <Button onClick={handleOpenQR} className="gap-2 font-bold shadow shadow-primary/25">
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
            <Button onClick={handleOpenQR} className="gap-2 font-bold shadow shadow-primary/25">
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
        <Dialog open={showQR} onOpenChange={handleCloseQR}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-black">Подключить Telegram</DialogTitle>
              <DialogDescription className="text-xs">
                Откройте Telegram → Настройки → Устройства → Подключить устройство и отсканируйте QR-код
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-5 py-4">
              {/* QR Code area */}
              <div className="relative h-52 w-52 rounded-2xl border-2 border-primary/20 flex flex-col items-center justify-center gap-3 bg-white overflow-hidden">
                {qrLoading && (
                  <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-10">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                )}
                {qrExpired && !qrLoading && (
                  <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center z-10 gap-2">
                    <p className="text-xs text-gray-500 font-medium">QR-код истёк</p>
                    <Button size="sm" variant="outline" onClick={handleRefreshQR} className="text-xs">
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Обновить
                    </Button>
                  </div>
                )}
                {qrUrl && !qrExpired ? (
                  <QRCodeSVG
                    value={qrUrl}
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                    includeMargin={false}
                  />
                ) : !qrLoading && !pendingAccountId ? (
                  <div className="flex flex-col items-center gap-2">
                    <QrCode className="h-12 w-12 text-gray-300" />
                    <p className="text-xs text-gray-400 text-center px-4">
                      Нажмите «Начать» для генерации QR-кода
                    </p>
                  </div>
                ) : null}
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
                <Button variant="outline" className="flex-1" onClick={handleCloseQR}>
                  Отмена
                </Button>
                {!pendingAccountId ? (
                  <Button
                    className="flex-1 font-bold"
                    onClick={handleStartQR}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Создание...</>
                    ) : (
                      <>
                        <QrCode className="h-4 w-4 mr-2" />
                        Начать
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 font-bold"
                    onClick={handleRefreshQR}
                    disabled={qrLoading}
                    variant="outline"
                  >
                    {qrLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Загрузка...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-2" />Обновить QR</>
                    )}
                  </Button>
                )}
              </div>

              {pendingAccountId && !qrLoading && qrUrl && (
                <p className="text-xs text-muted-foreground text-center">
                  Ожидание сканирования... Страница обновится автоматически
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
