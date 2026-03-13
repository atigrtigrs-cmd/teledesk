import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Zap,
  Clock,
  Plus,
  Trash2,
  Loader2,
  Save,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto py-6 px-6">
        <h2 className="text-lg font-bold mb-1">Настройки</h2>
        <p className="text-sm text-muted-foreground mb-6">Управление быстрыми ответами и рабочим временем</p>

        <Tabs defaultValue="quick-replies" className="space-y-4">
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="quick-replies" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />
              Быстрые ответы
            </TabsTrigger>
            <TabsTrigger value="working-hours" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Рабочее время
            </TabsTrigger>
            <TabsTrigger value="bitrix" className="gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" />
              Битрикс24
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quick-replies">
            <QuickRepliesTab />
          </TabsContent>

          <TabsContent value="working-hours">
            <WorkingHoursTab />
          </TabsContent>

          <TabsContent value="bitrix">
            <BitrixTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickRepliesTab() {
  const { data: replies, isLoading, refetch } = trpc.quickReplies.list.useQuery();
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");

  const createMutation = trpc.quickReplies.create.useMutation({
    onSuccess: () => { refetch(); setNewTitle(""); setNewText(""); toast.success("Быстрый ответ создан"); },
    onError: () => toast.error("Ошибка"),
  });
  const deleteMutation = trpc.quickReplies.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Удалено"); },
    onError: () => toast.error("Ошибка"),
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Быстрые ответы</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new */}
        <div className="space-y-2 p-3 rounded-lg bg-muted/20 border border-border">
          <Input
            placeholder="Название (например: Приветствие)"
            className="h-8 text-sm bg-background"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Input
            placeholder="Текст ответа..."
            className="h-8 text-sm bg-background"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => createMutation.mutate({ title: newTitle, text: newText })}
            disabled={!newTitle.trim() || !newText.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Добавить
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !replies?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Нет быстрых ответов</p>
        ) : (
          <div className="space-y-1.5">
            {replies.map((qr) => (
              <div key={qr.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/20 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{qr.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{qr.text}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate({ id: qr.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkingHoursTab() {
  const { data: hours, isLoading } = trpc.workingHours.list.useQuery();
  const [localHours, setLocalHours] = useState<any[] | null>(null);

  const upsertMutation = trpc.workingHours.upsert.useMutation({
    onSuccess: () => toast.success("Сохранено"),
    onError: () => toast.error("Ошибка"),
  });

  const displayHours = localHours ?? hours ?? DAYS.map((_, i) => ({
    dayOfWeek: i,
    isActive: i >= 1 && i <= 5,
    startTime: "09:00",
    endTime: "18:00",
  }));

  const updateDay = (dayOfWeek: number, field: string, value: any) => {
    const updated = displayHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
    );
    setLocalHours(updated);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Рабочее время</CardTitle>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => upsertMutation.mutate(displayHours)}
            disabled={upsertMutation.isPending}
          >
            {upsertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Сохранить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {displayHours.map((h) => (
              <div key={h.dayOfWeek} className="flex items-center gap-3 py-1.5">
                <Switch
                  checked={h.isActive}
                  onCheckedChange={(v) => updateDay(h.dayOfWeek, "isActive", v)}
                />
                <span className={`w-8 text-sm font-medium ${h.isActive ? "" : "text-muted-foreground"}`}>
                  {DAYS[h.dayOfWeek]}
                </span>
                {h.isActive ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="h-7 w-24 text-xs bg-muted/30 border-0"
                      value={h.startTime}
                      onChange={(e) => updateDay(h.dayOfWeek, "startTime", e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <Input
                      type="time"
                      className="h-7 w-24 text-xs bg-muted/30 border-0"
                      value={h.endTime}
                      onChange={(e) => updateDay(h.dayOfWeek, "endTime", e.target.value)}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Выходной</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BitrixTab() {
  const { data: settings, isLoading, refetch } = trpc.bitrix.get.useQuery();
  const [domain, setDomain] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const saveMutation = trpc.bitrix.save.useMutation({
    onSuccess: () => { refetch(); toast.success("Сохранено"); },
    onError: () => toast.error("Ошибка"),
  });
  const testMutation = trpc.bitrix.testConnection.useMutation({
    onSuccess: (res) => toast[res.success ? "success" : "error"](res.message),
  });

  const currentDomain = domain || settings?.domain || "";
  const currentUrl = webhookUrl || settings?.webhookUrl || "";

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Битрикс24</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Домен Битрикс24</label>
          <Input
            placeholder="mycompany.bitrix24.ru"
            className="h-8 text-sm"
            value={currentDomain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Webhook URL</label>
          <Input
            placeholder="https://mycompany.bitrix24.ru/rest/1/abc123/"
            className="h-8 text-sm"
            value={currentUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate({ webhookUrl: currentUrl })}
            disabled={!currentUrl || testMutation.isPending}
          >
            {testMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Тест
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate({ domain: currentDomain, webhookUrl: currentUrl })}
            disabled={!currentDomain || !currentUrl || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Сохранить
          </Button>
        </div>
        {settings && (
          <p className="text-xs text-muted-foreground">
            Текущий домен: <span className="font-medium text-foreground">{settings.domain}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
