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
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  MoreVertical,
  Plus,
  QrCode,
  Smartphone,
  Trash2,
  WifiOff,
  Wifi,
  RefreshCw,
  MessageSquare,
  Key,
  Loader2,
  Settings2,
  Phone,
  Terminal,
  History,
  CloudDownload,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
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

function buildTelegramQRUrl(tokenBase64: string): string {
  // Telegram expects base64url encoding for the token (RFC 4648)
  const base64url = tokenBase64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `tg://login?token=${base64url}`;
}

type LoginMode = "choose" | "qr" | "phone" | "session";
type PhoneStep = "phone" | "code" | "twofa";

export default function Accounts() {
  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("choose");

  // QR state
  const [pendingAccountId, setPendingAccountId] = useState<number | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState<number | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExpired, setQrExpired] = useState(false);

  // Session string state
  const [sessionString, setSessionString] = useState("");
  const [sessionPhone, setSessionPhone] = useState("");

  // Phone login state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [twoFAPassword, setTwoFAPassword] = useState("");
  const [phoneAccountId, setPhoneAccountId] = useState<number | null>(null);

  // Bitrix24 settings state
  const [showBitrixModal, setShowBitrixModal] = useState(false);
  const [bitrixAccountId, setBitrixAccountId] = useState<number | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [selectedPipelineName, setSelectedPipelineName] = useState<string>("");
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<string>("");
  const [selectedResponsibleName, setSelectedResponsibleName] = useState<string>("");

  const { data: accounts, refetch } = trpc.accounts.list.useQuery();
  const { data: allUsers = [] } = trpc.users.list.useQuery();

  const assignManagerMutation = trpc.accounts.assignManager.useMutation({
    onSuccess: () => { refetch(); toast.success("Менеджер назначен"); },
    onError: (e) => toast.error(e.message),
  });

  const { data: pipelines = [] } = trpc.bitrix.getPipelines.useQuery(undefined, { enabled: showBitrixModal });
  const { data: stages = [] } = trpc.bitrix.getPipelineStages.useQuery(
    { pipelineId: selectedPipelineId },
    { enabled: showBitrixModal && !!selectedPipelineId }
  );
  const { data: bitrixUsers = [] } = trpc.bitrix.getUsers.useQuery(undefined, { enabled: showBitrixModal });

  const updateBitrixMutation = trpc.accounts.updateBitrixSettings.useMutation({
    onSuccess: () => {
      toast.success("Настройки воронки сохранены");
      refetch();
      setShowBitrixModal(false);
    },
    onError: (err) => toast.error("Ошибка: " + err.message),
  });

  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => { toast.success("Аккаунт удалён"); refetch(); },
    onError: (err) => toast.error("Ошибка удаления: " + err.message),
  });
  const reconnectAllMutation = trpc.accounts.reconnectAll.useMutation({
    onSuccess: () => {
      toast.success("Переподключение запущено, подождите 10–30 секунд...");
      setTimeout(() => refetch(), 20000);
    },
    onError: (err) => toast.error("Ошибка: " + err.message),
  });
  const updateStatusMutation = trpc.accounts.updateStatus.useMutation({
    onSuccess: () => { toast.success("Статус обновлён"); refetch(); },
  });
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: (acc) => {
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

  // Phone login mutations
  const sendCodeMutation = trpc.accounts.sendPhoneCode.useMutation({
    onSuccess: () => {
      setPhoneStep("code");
      toast.success("Код отправлен в Telegram");
    },
    onError: (err) => toast.error("Ошибка: " + err.message),
  });
  const verifyCodeMutation = trpc.accounts.verifyPhoneCode.useMutation({
    onSuccess: (data) => {
      if (data.requiresPassword) {
        setPhoneStep("twofa");
        toast.info("Требуется пароль двухфакторной аутентификации");
      } else {
        toast.success("Аккаунт успешно подключён!");
        handleCloseDialog();
        refetch();
      }
    },
    onError: (err) => toast.error("Неверный код: " + err.message),
  });
  const connectSessionMutation = trpc.accounts.connectSessionString.useMutation({
    onSuccess: () => {
      toast.success("Аккаунт успешно подключён!");
      handleCloseDialog();
      refetch();
    },
    onError: (err) => toast.error("Ошибка: " + err.message),
  });

  const syncHistoryMutation = trpc.accounts.syncHistory.useMutation({
    onSuccess: () => toast.success("Синхронизация истории запущена. Это может занять 1-5 минут."),
    onError: (e) => toast.error(e.message),
  });

  const verifyTwoFAMutation = trpc.accounts.verifyTwoFA.useMutation({
    onSuccess: () => {
      toast.success("Аккаунт успешно подключён!");
      handleCloseDialog();
      refetch();
    },
    onError: (err) => toast.error("Неверный пароль: " + err.message),
  });

  // Start QR when pendingAccountId set
  useEffect(() => {
    if (pendingAccountId !== null) {
      setQrLoading(true);
      setQrToken(null);
      startQRMutation.mutate({ accountId: pendingAccountId });
    }
  }, [pendingAccountId]);

  // QR expiry timer
  useEffect(() => {
    if (!qrExpires) return;
    const now = Math.floor(Date.now() / 1000);
    const remaining = qrExpires - now;
    if (remaining <= 0) { setQrExpired(true); return; }
    const timer = setTimeout(() => setQrExpired(true), remaining * 1000);
    return () => clearTimeout(timer);
  }, [qrExpires]);

  // Poll for account becoming active (QR mode)
  useEffect(() => {
    if (!pendingAccountId || !showDialog || loginMode !== "qr") return;
    const interval = setInterval(async () => {
      await refetch();
      const acc = accounts?.find(a => a.id === pendingAccountId);
      if (acc?.status === "active") {
        toast.success(`Telegram аккаунт ${acc.firstName ?? acc.phone ?? ""} подключён!`);
        handleCloseDialog();
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pendingAccountId, showDialog, loginMode, accounts]);

  const handleOpenDialog = () => {
    setShowDialog(true);
    setLoginMode("choose");
    resetPhoneState();
    setPendingAccountId(null);
    setQrToken(null);
    setQrExpired(false);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setLoginMode("choose");
    resetPhoneState();
    setPendingAccountId(null);
    setQrToken(null);
    setQrExpired(false);
    setSessionString("");
    setSessionPhone("");
  };

  const resetPhoneState = () => {
    setPhoneStep("phone");
    setPhoneNumber("");
    setPhoneCode("");
    setTwoFAPassword("");
    setPhoneAccountId(null);
  };

  const handleStartQR = () => {
    setLoginMode("qr");
    createMutation.mutate({ status: "pending" });
  };

  const handleStartPhone = () => {
    setLoginMode("phone");
    setPhoneStep("phone");
  };

  const handleRefreshQR = () => {
    if (pendingAccountId) {
      setQrLoading(true);
      setQrExpired(false);
      startQRMutation.mutate({ accountId: pendingAccountId });
    }
  };

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) return;
    // Create account first if not yet created
    if (!phoneAccountId) {
      createMutation.mutate(
        { phone: phoneNumber, status: "pending" },
        {
          onSuccess: (acc) => {
            setPhoneAccountId(acc.id);
            sendCodeMutation.mutate({ accountId: acc.id, phone: phoneNumber });
          },
        }
      );
    } else {
      sendCodeMutation.mutate({ accountId: phoneAccountId, phone: phoneNumber });
    }
  };

  const handleVerifyCode = () => {
    if (!phoneAccountId || !phoneCode.trim()) return;
    verifyCodeMutation.mutate({ accountId: phoneAccountId, phone: phoneNumber, code: phoneCode });
  };

  const handleVerifyTwoFA = () => {
    if (!phoneAccountId || !twoFAPassword.trim()) return;
    verifyTwoFAMutation.mutate({ accountId: phoneAccountId, password: twoFAPassword });
  };

  const handleOpenBitrix = (acc: NonNullable<typeof accounts>[0]) => {
    setBitrixAccountId(acc.id);
    setSelectedPipelineId(acc.bitrixPipelineId ?? "");
    setSelectedPipelineName(acc.bitrixPipelineName ?? "");
    setSelectedStageId(acc.bitrixStageId ?? "");
    setSelectedResponsibleId(acc.bitrixResponsibleId ?? "");
    setSelectedResponsibleName(acc.bitrixResponsibleName ?? "");
    setShowBitrixModal(true);
  };

  const handleSaveBitrix = () => {
    if (!bitrixAccountId) return;
    updateBitrixMutation.mutate({
      id: bitrixAccountId,
      bitrixPipelineId: selectedPipelineId || null,
      bitrixPipelineName: selectedPipelineName || null,
      bitrixStageId: selectedStageId || null,
      bitrixResponsibleId: selectedResponsibleId || null,
      bitrixResponsibleName: selectedResponsibleName || null,
    });
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => reconnectAllMutation.mutate()}
              disabled={reconnectAllMutation.isPending}
              className="gap-2 font-bold"
            >
              {reconnectAllMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              Переподключить
            </Button>
            <Button onClick={handleOpenDialog} className="gap-2 font-bold shadow shadow-primary/25">
              <Plus className="h-4 w-4" />
              Добавить аккаунт
            </Button>
          </div>
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
              Добавьте Telegram аккаунт через QR-код или номер телефона
            </p>
            <Button onClick={handleOpenDialog} className="gap-2 font-bold shadow shadow-primary/25">
              <Plus className="h-4 w-4" />
              Подключить аккаунт
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map(acc => {
              const status = statusConfig[acc.status] ?? statusConfig.disconnected;
              const displayName = [acc.firstName, acc.lastName].filter(Boolean).join(" ") || acc.phone || "Аккаунт";
              const initial = displayName.charAt(0).toUpperCase();
              const hasEmployee = !!acc.bitrixResponsibleName;

              return (
                <div key={acc.id} className={`bg-card border rounded-xl p-5 transition-all ${
                  acc.status === "active" ? "border-border" : "border-border/50"
                }`}>
                  {/* Header row */}
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
                          <DropdownMenuItem onClick={() => handleOpenBitrix(acc)}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            Настройки Битрикс24
                          </DropdownMenuItem>
                          {acc.status === "active" && (
                            <DropdownMenuItem
                              onClick={() => syncHistoryMutation.mutate({ accountId: acc.id })}
                              disabled={syncHistoryMutation.isPending || (acc as any).syncStatus === "syncing"}
                            >
                              <History className="mr-2 h-4 w-4" />
                              Синхронизировать историю
                            </DropdownMenuItem>
                          )}
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

                  {/* Bitrix24 employee assignment block */}
                  <button
                    onClick={() => handleOpenBitrix(acc)}
                    className={`w-full rounded-lg border px-3 py-2.5 flex items-center gap-3 mb-3 transition-colors text-left ${
                      hasEmployee
                        ? "border-blue-500/30 bg-blue-500/8 hover:bg-blue-500/15"
                        : "border-dashed border-border/60 bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      hasEmployee ? "bg-blue-500/20 text-blue-400" : "bg-muted text-muted-foreground"
                    }`}>
                      {hasEmployee ? acc.bitrixResponsibleName!.charAt(0).toUpperCase() : "+"}
                    </div>
                    <div className="flex-1 min-w-0">
                      {hasEmployee ? (
                        <>
                          <p className="text-xs font-semibold text-blue-400 truncate">{acc.bitrixResponsibleName}</p>
                          <p className="text-[10px] text-muted-foreground">Ответственный в Битрикс 24</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-muted-foreground">Не назначен сотрудник</p>
                          <p className="text-[10px] text-muted-foreground">Нажмите чтобы привязать сотрудника Битрикс 24</p>
                        </>
                      )}
                    </div>
                    {acc.bitrixPipelineName && (
                      <span className="text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                        {acc.bitrixPipelineName}
                      </span>
                    )}
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>

                  {/* Sync Status */}
                  {acc.status === "active" && (
                    <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs ${
                      (acc as any).syncStatus === "syncing"
                        ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                        : (acc as any).syncStatus === "done"
                        ? "bg-green-500/10 border border-green-500/20 text-green-400"
                        : (acc as any).syncStatus === "error"
                        ? "bg-red-500/10 border border-red-500/20 text-red-400"
                        : "bg-muted/30 border border-border/40 text-muted-foreground"
                    }`}>
                      {(acc as any).syncStatus === "syncing" ? (
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      ) : (acc as any).syncStatus === "done" ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : (
                        <CloudDownload className="h-3 w-3 shrink-0" />
                      )}
                      <span>
                        {(acc as any).syncStatus === "syncing"
                          ? "Синхронизация истории..."
                          : (acc as any).syncStatus === "done"
                          ? `История синхронизирована · ${(acc as any).syncedDialogs ?? 0} диалогов`
                          : (acc as any).syncStatus === "error"
                          ? "Ошибка синхронизации"
                          : "История не синхронизирована"}
                      </span>
                      {(acc as any).syncStatus !== "syncing" && acc.status === "active" && (
                        <button
                          onClick={() => syncHistoryMutation.mutate({ accountId: acc.id })}
                          className="ml-auto text-[10px] underline underline-offset-2 opacity-70 hover:opacity-100"
                        >
                          {(acc as any).syncStatus === "done" ? "Обновить" : "Синхронизировать"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Manager assignment */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Менеджер:
                    </div>
                    <Select
                      value={acc.managerId ? String(acc.managerId) : "none"}
                      onValueChange={(v) => assignManagerMutation.mutate({ id: acc.id, managerId: v === "none" ? null : Number(v) })}
                    >
                      <SelectTrigger className={`h-7 text-xs flex-1 min-w-0 ${
                        acc.managerId ? "border-primary/40 bg-primary/5 text-foreground" : "border-dashed border-border/60 text-muted-foreground"
                      }`}>
                        <SelectValue placeholder="Не назначен" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {allUsers.map((u: any) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.name ?? u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Footer */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>ID: {acc.telegramId ?? "—"}</span>
                    <span>·</span>
                    <span>Добавлен {new Date(acc.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Connect Dialog ─────────────────────────────────────────── */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-black">Подключить Telegram</DialogTitle>
              <DialogDescription className="text-xs">
                Выберите способ входа
              </DialogDescription>
            </DialogHeader>

            {/* CHOOSE MODE */}
            {loginMode === "choose" && (
              <div className="flex flex-col gap-3 py-2">
                <button
                  onClick={handleStartPhone}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">По номеру телефона</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Код придёт в Telegram — работает с телефона</p>
                  </div>
                </button>

                <button
                  onClick={handleStartQR}
                  disabled={createMutation.isPending}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left group disabled:opacity-50"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    {createMutation.isPending ? (
                      <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                    ) : (
                      <QrCode className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm">QR-код</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Только через Telegram Desktop или web.telegram.org</p>
                  </div>
                </button>

                <button
                  onClick={() => setLoginMode("session")}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Terminal className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Session String</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Вставьте строку сессии — самый надёжный способ</p>
                  </div>
                </button>
              </div>
            )}

            {/* QR MODE */}
            {loginMode === "qr" && (
              <div className="flex flex-col items-center gap-4 py-2">
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
                    <QRCodeSVG value={qrUrl} size={200} bgColor="#ffffff" fgColor="#000000" level="M" includeMargin={false} />
                  ) : !qrLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <QrCode className="h-12 w-12 text-gray-300" />
                      <p className="text-xs text-gray-400 text-center px-4">Генерация QR-кода...</p>
                    </div>
                  ) : null}
                </div>

                <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                  <span className="text-amber-400 text-base shrink-0">⚠️</span>
                  <p className="text-xs text-amber-300 leading-relaxed">
                    Откройте <strong>Telegram Desktop</strong> или <strong>web.telegram.org</strong> → Настройки → Устройства → Подключить устройство
                  </p>
                </div>

                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1 text-xs" onClick={() => setLoginMode("choose")}>
                    ← Назад
                  </Button>
                  <Button variant="outline" className="flex-1 text-xs" onClick={handleRefreshQR} disabled={qrLoading}>
                    {qrLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" />Обновить</>}
                  </Button>
                </div>

                {pendingAccountId && !qrLoading && qrUrl && (
                  <p className="text-xs text-muted-foreground text-center">
                    Ожидание сканирования... Страница обновится автоматически
                  </p>
                )}
              </div>
            )}

            {/* SESSION STRING MODE */}
            {loginMode === "session" && (
              <div className="flex flex-col gap-4 py-2">
                <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
                  <p className="text-xs text-blue-300 leading-relaxed">
                    Сгенерируйте Session String через скрипт на вашем компьютере и вставьте сюда.
                    Это самый надёжный способ — код запрашивается с вашего IP.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Номер телефона (необязательно)</Label>
                  <Input
                    placeholder="+79001234567"
                    value={sessionPhone}
                    onChange={e => setSessionPhone(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Session String <span className="text-primary">*</span></Label>
                  <textarea
                    className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="1BVtsOKABu..."
                    value={sessionString}
                    onChange={e => setSessionString(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Строка начинается с цифры и содержит буквы и символы</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setLoginMode("choose")}>
                    ← Назад
                  </Button>
                  <Button
                    className="flex-1 font-bold"
                    onClick={() => connectSessionMutation.mutate({ sessionString, phone: sessionPhone || undefined })}
                    disabled={connectSessionMutation.isPending || sessionString.trim().length < 10}
                  >
                    {connectSessionMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Подключение...</>
                    ) : (
                      <>Подключить</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* PHONE MODE */}
            {loginMode === "phone" && (
              <div className="flex flex-col gap-4 py-2">
                {phoneStep === "phone" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Номер телефона</Label>
                      <Input
                        placeholder="+7 999 123 45 67"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSendCode()}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">Введите номер в международном формате с +, например <span className="font-mono text-foreground">+79001234567</span></p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setLoginMode("choose")}>
                        ← Назад
                      </Button>
                      <Button
                        className="flex-1 font-bold"
                        onClick={handleSendCode}
                        disabled={sendCodeMutation.isPending || createMutation.isPending || !phoneNumber.trim()}
                      >
                        {(sendCodeMutation.isPending || createMutation.isPending) ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Отправка...</>
                        ) : (
                          <>Получить код</>
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {phoneStep === "code" && (
                  <>
                    <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-green-300 font-semibold">Код отправлен на {phoneNumber}</p>
                        <p className="text-xs text-green-300/70 mt-0.5">Проверьте приложение Telegram — код придёт как сообщение от <strong>Telegram</strong>. Если Telegram не установлен, код придёт по SMS.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Код из Telegram / SMS</Label>
                      <Input
                        placeholder="12345"
                        value={phoneCode}
                        onChange={e => setPhoneCode(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleVerifyCode()}
                        className="font-mono text-center text-lg tracking-widest"
                        maxLength={6}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 text-xs" onClick={() => setPhoneStep("phone")}>
                        ← Назад
                      </Button>
                      <Button
                        className="flex-1 font-bold"
                        onClick={handleVerifyCode}
                        disabled={verifyCodeMutation.isPending || !phoneCode.trim()}
                      >
                        {verifyCodeMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Проверка...</>
                        ) : (
                          <>Подтвердить</>
                        )}
                      </Button>
                    </div>
                    <button
                      className="text-xs text-primary underline underline-offset-2 text-center"
                      onClick={handleSendCode}
                      disabled={sendCodeMutation.isPending}
                    >
                      Отправить код повторно
                    </button>
                  </>
                )}

                {phoneStep === "twofa" && (
                  <>
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
                      <span className="text-amber-400 shrink-0">🔐</span>
                      <p className="text-xs text-amber-300">На аккаунте включена двухфакторная аутентификация. Введите облачный пароль Telegram.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Пароль 2FA</Label>
                      <Input
                        type="password"
                        placeholder="Облачный пароль Telegram"
                        value={twoFAPassword}
                        onChange={e => setTwoFAPassword(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleVerifyTwoFA()}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 text-xs" onClick={() => setPhoneStep("code")}>
                        ← Назад
                      </Button>
                      <Button
                        className="flex-1 font-bold"
                        onClick={handleVerifyTwoFA}
                        disabled={verifyTwoFAMutation.isPending || !twoFAPassword.trim()}
                      >
                        {verifyTwoFAMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Проверка...</>
                        ) : (
                          <>Войти</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bitrix24 Pipeline Settings Dialog */}
        <Dialog open={showBitrixModal} onOpenChange={setShowBitrixModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-black">Настройки Битрикс24</DialogTitle>
              <DialogDescription className="text-xs">
                Укажите воронку, стадию и ответственного сотрудника для этого Telegram аккаунта.
                Все входящие сообщения будут создавать сделки в выбранной воронке и назначаться выбранному сотруднику.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Employee — primary field */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Сотрудник Битрикс 24 <span className="text-primary">*</span></Label>
                <Select
                  value={selectedResponsibleId}
                  onValueChange={(val) => {
                    setSelectedResponsibleId(val);
                    const u = bitrixUsers.find((u: any) => u.id === val);
                    setSelectedResponsibleName(u?.name ?? "");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={bitrixUsers.length === 0 ? "Настройте Битрикс 24 в Настройках" : "Выберите сотрудника..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {bitrixUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">Все входящие сообщения с этого Telegram-аккаунта будут создавать сделки и назначаться этому сотруднику.</p>
              </div>

              <div className="border-t border-border/40 pt-3">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-3">Дополнительно</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Воронка (Pipeline)</Label>
                <Select
                  value={selectedPipelineId}
                  onValueChange={(val) => {
                    setSelectedPipelineId(val);
                    const p = pipelines.find((p: any) => p.id === val);
                    setSelectedPipelineName(p?.name ?? "");
                    setSelectedStageId("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={pipelines.length === 0 ? "Настройте Битрикс24 в Настройках" : "Выберите воронку..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Начальная стадия</Label>
                <Select
                  value={selectedStageId}
                  onValueChange={(val) => setSelectedStageId(val)}
                  disabled={!selectedPipelineId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={!selectedPipelineId ? "Сначала выберите воронку" : "Выберите стадию..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>



              {!selectedPipelineId && pipelines.length === 0 && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                  Битрикс24 не настроен. Перейдите в <strong>Настройки → Битрикс24</strong> и добавьте webhook URL.
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowBitrixModal(false)}>
                Отмена
              </Button>
              <Button
                className="flex-1 font-bold"
                onClick={handleSaveBitrix}
                disabled={updateBitrixMutation.isPending}
              >
                {updateBitrixMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Сохранение...</>
                ) : "Сохранить"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
