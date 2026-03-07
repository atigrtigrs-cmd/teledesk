import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  ExternalLink,
  Tag,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

type WorkDay = { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string };

const defaultWorkDays: WorkDay[] = DAYS.map((_, i) => ({
  dayOfWeek: i,
  isActive: i >= 1 && i <= 5,
  startTime: "09:00",
  endTime: "18:00",
}));

export default function Settings() {
  const [bitrixForm, setBitrixForm] = useState({
    domain: "",
    webhookUrl: "",
    pipelineId: "",
    pipelineName: "",
    stageId: "",
  });
  const [workDays, setWorkDays] = useState<WorkDay[]>(defaultWorkDays);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: bitrixSettings } = trpc.bitrix.get.useQuery();
  const { data: workingHoursData } = trpc.workingHours.list.useQuery();

  useEffect(() => {
    if (bitrixSettings) {
      setBitrixForm({
        domain: bitrixSettings.domain ?? "",
        webhookUrl: bitrixSettings.webhookUrl ?? "",
        pipelineId: bitrixSettings.pipelineId ?? "",
        pipelineName: bitrixSettings.pipelineName ?? "",
        stageId: bitrixSettings.stageId ?? "",
      });
    }
  }, [bitrixSettings]);

  useEffect(() => {
    if (workingHoursData?.length) {
      const map = Object.fromEntries(workingHoursData.map(d => [d.dayOfWeek, d]));
      setWorkDays(defaultWorkDays.map(d => ({
        ...d,
        ...(map[d.dayOfWeek] ? {
          isActive: map[d.dayOfWeek].isActive,
          startTime: map[d.dayOfWeek].startTime,
          endTime: map[d.dayOfWeek].endTime,
        } : {}),
      })));
    }
  }, [workingHoursData]);

  const saveBitrixMutation = trpc.bitrix.save.useMutation({
    onSuccess: () => toast.success("Настройки Битрикс24 сохранены"),
    onError: () => toast.error("Ошибка сохранения"),
  });

  const testConnectionMutation = trpc.bitrix.testConnection.useMutation({
    onSuccess: (data) => setTestResult(data),
    onError: () => setTestResult({ success: false, message: "Ошибка подключения" }),
  });

  const saveWorkHoursMutation = trpc.workingHours.upsert.useMutation({
    onSuccess: () => toast.success("Рабочее время сохранено"),
    onError: () => toast.error("Ошибка сохранения"),
  });

  const handleSaveBitrix = () => {
    if (!bitrixForm.domain || !bitrixForm.webhookUrl) {
      toast.error("Заполните домен и webhook URL");
      return;
    }
    saveBitrixMutation.mutate(bitrixForm);
  };

  const updateWorkDay = (dayOfWeek: number, field: keyof WorkDay, value: boolean | string) => {
    setWorkDays(prev => prev.map(d => d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d));
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Конфигурация</p>
          <h1 className="text-2xl font-black tracking-tight">Настройки</h1>
        </div>

        <Tabs defaultValue="bitrix">
          <TabsList className="mb-6 bg-card border border-border p-1 h-auto">
            <TabsTrigger value="bitrix" className="gap-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Битрикс24
            </TabsTrigger>
            <TabsTrigger value="tags" className="gap-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Tag className="h-3.5 w-3.5" />
              Теги
            </TabsTrigger>
            <TabsTrigger value="hours" className="gap-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Clock className="h-3.5 w-3.5" />
              Рабочее время
            </TabsTrigger>
          </TabsList>

          {/* Bitrix24 Tab */}
          <TabsContent value="bitrix">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow shadow-primary/30">
                    <Building2 className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold">Интеграция с Битрикс24</h2>
                    <p className="text-xs text-muted-foreground">Настройте подключение для автоматического создания сделок</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-5">
                {/* How to get webhook */}
                <div className="p-4 rounded-lg bg-primary/6 border border-primary/20">
                  <p className="text-xs font-bold text-primary mb-2">Как получить Webhook URL</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Войдите в Битрикс24</li>
                    <li>Перейдите: Разработчикам → Входящие вебхуки</li>
                    <li>Нажмите "Добавить вебхук" и выберите права CRM</li>
                    <li>Скопируйте URL и вставьте ниже</li>
                  </ol>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Домен Битрикс24</Label>
                  <Input
                    placeholder="company.bitrix24.ru"
                    value={bitrixForm.domain}
                    onChange={e => setBitrixForm(f => ({ ...f, domain: e.target.value }))}
                    className="bg-muted border-border focus:border-primary/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Webhook URL</Label>
                  <Input
                    placeholder="https://company.bitrix24.ru/rest/1/xxxxx/"
                    value={bitrixForm.webhookUrl}
                    onChange={e => setBitrixForm(f => ({ ...f, webhookUrl: e.target.value }))}
                    className="bg-muted border-border focus:border-primary/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">ID воронки</Label>
                    <Input
                      placeholder="1"
                      value={bitrixForm.pipelineId}
                      onChange={e => setBitrixForm(f => ({ ...f, pipelineId: e.target.value }))}
                      className="bg-muted border-border focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Название воронки</Label>
                    <Input
                      placeholder="Telegram лиды"
                      value={bitrixForm.pipelineName}
                      onChange={e => setBitrixForm(f => ({ ...f, pipelineName: e.target.value }))}
                      className="bg-muted border-border focus:border-primary/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">ID начальной стадии</Label>
                  <Input
                    placeholder="NEW"
                    value={bitrixForm.stageId}
                    onChange={e => setBitrixForm(f => ({ ...f, stageId: e.target.value }))}
                    className="bg-muted border-border focus:border-primary/50"
                  />
                </div>

                {testResult && (
                  <div className={`flex items-center gap-2.5 p-3.5 rounded-lg text-sm font-medium ${
                    testResult.success
                      ? "bg-green-500/8 text-green-400 border border-green-500/20"
                      : "bg-red-500/8 text-red-400 border border-red-500/20"
                  }`}>
                    {testResult.success
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <XCircle className="h-4 w-4 shrink-0" />}
                    {testResult.message}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1 font-semibold"
                    onClick={() => {
                      setTestResult(null);
                      testConnectionMutation.mutate({ webhookUrl: bitrixForm.webhookUrl });
                    }}
                    disabled={!bitrixForm.webhookUrl || testConnectionMutation.isPending}
                  >
                    {testConnectionMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Проверка...</>
                    ) : "Проверить"}
                  </Button>
                  <Button
                    className="flex-1 font-bold shadow shadow-primary/25"
                    onClick={handleSaveBitrix}
                    disabled={saveBitrixMutation.isPending}
                  >
                    {saveBitrixMutation.isPending ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tags Tab */}
          <TabsContent value="tags">
            <TagsManager />
          </TabsContent>

          {/* Working Hours Tab */}
          <TabsContent value="hours">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow shadow-primary/30">
                    <Clock className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold">Рабочее время</h2>
                    <p className="text-xs text-muted-foreground">Автоответы вне рабочего времени отправляются автоматически</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {workDays.map(day => (
                    <div key={day.dayOfWeek} className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                      day.isActive ? "bg-primary/5 border border-primary/15" : "bg-muted/30 border border-transparent"
                    }`}>
                      <Switch
                        checked={day.isActive}
                        onCheckedChange={v => updateWorkDay(day.dayOfWeek, "isActive", v)}
                      />
                      <span className={`text-sm font-medium w-28 shrink-0 ${day.isActive ? "" : "text-muted-foreground"}`}>
                        {DAYS[day.dayOfWeek]}
                      </span>
                      {day.isActive ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time"
                            value={day.startTime}
                            onChange={e => updateWorkDay(day.dayOfWeek, "startTime", e.target.value)}
                            className="h-8 text-xs w-28 bg-background border-border"
                          />
                          <span className="text-muted-foreground text-xs font-medium">—</span>
                          <Input
                            type="time"
                            value={day.endTime}
                            onChange={e => updateWorkDay(day.dayOfWeek, "endTime", e.target.value)}
                            className="h-8 text-xs w-28 bg-background border-border"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Выходной</span>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full mt-5 font-bold shadow shadow-primary/25"
                  onClick={() => saveWorkHoursMutation.mutate(workDays)}
                  disabled={saveWorkHoursMutation.isPending}
                >
                  {saveWorkHoursMutation.isPending ? "Сохранение..." : "Сохранить расписание"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4", "#14b8a6", "#6b7280",
];

function TagsManager() {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const { data: tags, refetch } = trpc.tags.list.useQuery();
  const createMutation = trpc.tags.create.useMutation({
    onSuccess: () => { setNewName(""); refetch(); toast.success("Тег создан"); },
    onError: () => toast.error("Ошибка создания тега"),
  });
  const deleteMutation = trpc.tags.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Тег удалён"); },
    onError: () => toast.error("Ошибка удаления"),
  });
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow shadow-primary/30">
            <Tag className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Теги диалогов</h2>
            <p className="text-xs text-muted-foreground">Цветные метки для категоризации и фильтрации диалогов</p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        {/* Create new tag */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Создать тег</p>
          <div className="flex gap-2 flex-wrap">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`h-7 w-7 rounded-full transition-all ${
                  newColor === c ? "ring-2 ring-offset-2 ring-offset-background ring-white scale-110" : "hover:scale-105"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: newColor }}>
              <Tag className="h-4 w-4 text-white" />
            </div>
            <Input
              placeholder="Название тега..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newName.trim() && createMutation.mutate({ name: newName.trim(), color: newColor })}
              className="flex-1 h-9 text-sm"
            />
            <Button
              size="sm"
              onClick={() => newName.trim() && createMutation.mutate({ name: newName.trim(), color: newColor })}
              disabled={!newName.trim() || createMutation.isPending}
              className="gap-1.5 px-4"
            >
              <Plus className="h-3.5 w-3.5" />
              Создать
            </Button>
          </div>
        </div>
        {/* Tags list */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Существующие теги</p>
          {(!tags || tags.length === 0) && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Нет тегов. Создайте первый!</p>
            </div>
          )}
          {tags?.map(tag => (
            <div key={tag.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border">
              <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="flex-1 text-sm font-semibold">{tag.name}</span>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
                onClick={() => deleteMutation.mutate({ id: tag.id })}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
