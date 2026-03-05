import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Bot, Loader2, Plus, Trash2, Clock, MessageSquare, Hash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TriggerType = "first_message" | "outside_hours" | "keyword";

const triggerLabels: Record<TriggerType, string> = {
  first_message: "Первое сообщение",
  outside_hours: "Вне рабочего времени",
  keyword: "Ключевое слово",
};

const triggerColors: Record<TriggerType, string> = {
  first_message: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  outside_hours: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  keyword: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const triggerIcons: Record<TriggerType, React.ElementType> = {
  first_message: MessageSquare,
  outside_hours: Clock,
  keyword: Hash,
};

type FormData = {
  name: string;
  trigger: TriggerType;
  keyword: string;
  text: string;
  isActive: boolean;
};

export default function AutoReplies() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "",
    trigger: "first_message",
    keyword: "",
    text: "",
    isActive: true,
  });

  const { data, refetch, isLoading } = trpc.autoReplies.list.useQuery();
  const createMutation = trpc.autoReplies.create.useMutation({
    onSuccess: () => { toast.success("Автоответ создан"); refetch(); setOpen(false); resetForm(); },
  });
  const toggleMutation = trpc.autoReplies.toggleActive.useMutation({
    onSuccess: () => { refetch(); },
  });
  const deleteMutation = trpc.autoReplies.delete.useMutation({
    onSuccess: () => { toast.success("Автоответ удалён"); refetch(); },
  });

  const resetForm = () => setForm({ name: "", trigger: "first_message", keyword: "", text: "", isActive: true });

  const handleSubmit = () => {
    if (!form.name.trim() || !form.text.trim()) {
      toast.error("Заполните название и текст");
      return;
    }
    if (form.trigger === "keyword" && !form.keyword.trim()) {
      toast.error("Укажите ключевое слово");
      return;
    }
    createMutation.mutate({
      name: form.name,
      trigger: form.trigger,
      keyword: form.keyword || undefined,
      text: form.text,
      isActive: form.isActive,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Автоматизация</p>
            <h1 className="text-2xl font-black tracking-tight">Автоответы</h1>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2 font-bold shadow shadow-primary/25">
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/8 border border-primary/20 flex items-center justify-center mb-4">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <p className="font-bold text-sm mb-1">Нет автоответов</p>
            <p className="text-xs text-muted-foreground mb-5 max-w-xs">
              Настройте автоматические ответы на первое сообщение или вне рабочего времени
            </p>
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-2 font-semibold">
              <Plus className="h-4 w-4" />
              Создать автоответ
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map(item => {
              const trigger = item.trigger as TriggerType;
              const TriggerIcon = triggerIcons[trigger] ?? Bot;
              return (
                <div key={item.id} className={`bg-card border rounded-xl p-4 flex items-start gap-3 transition-colors group ${
                  item.isActive ? "border-border" : "border-border/50 opacity-60"
                }`}>
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    item.isActive ? "bg-primary shadow shadow-primary/25" : "bg-muted"
                  }`}>
                    <TriggerIcon className={`h-4 w-4 ${item.isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-bold text-sm">{item.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${triggerColors[trigger] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {triggerLabels[trigger] ?? trigger}
                      </span>
                      {item.keyword && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground border border-border">
                          {item.keyword}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{item.text}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={item.isActive}
                      onCheckedChange={v => toggleMutation.mutate({ id: item.id, isActive: v })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteMutation.mutate({ id: item.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-black">Новый автоответ</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Название</Label>
                <Input
                  placeholder="Например: Приветствие"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Условие срабатывания</Label>
                <Select value={form.trigger} onValueChange={v => setForm(f => ({ ...f, trigger: v as TriggerType }))}>
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_message">Первое сообщение</SelectItem>
                    <SelectItem value="outside_hours">Вне рабочего времени</SelectItem>
                    <SelectItem value="keyword">Ключевое слово</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.trigger === "keyword" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Ключевое слово</Label>
                  <Input
                    placeholder="цена"
                    value={form.keyword}
                    onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
                    className="bg-muted border-border"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Текст ответа</Label>
                <Textarea
                  placeholder="Здравствуйте! Мы получили ваше сообщение и ответим в ближайшее время."
                  rows={4}
                  value={form.text}
                  onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                  className="bg-muted border-border resize-none"
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-xs font-semibold">Активен</Label>
                  <p className="text-xs text-muted-foreground">Автоответ будет срабатывать сразу</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Отмена</Button>
                <Button className="flex-1 font-bold" onClick={handleSubmit} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
