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
import { trpc } from "@/lib/trpc";
import { Edit2, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type FormData = { title: string; text: string; shortcut: string };

export default function QuickReplies() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ title: "", text: "", shortcut: "" });

  const { data, refetch, isLoading } = trpc.quickReplies.list.useQuery();
  const createMutation = trpc.quickReplies.create.useMutation({
    onSuccess: () => { toast.success("Шаблон создан"); refetch(); setOpen(false); resetForm(); },
  });
  const updateMutation = trpc.quickReplies.update.useMutation({
    onSuccess: () => { toast.success("Шаблон обновлён"); refetch(); setOpen(false); resetForm(); },
  });
  const deleteMutation = trpc.quickReplies.delete.useMutation({
    onSuccess: () => { toast.success("Шаблон удалён"); refetch(); },
  });

  const resetForm = () => { setForm({ title: "", text: "", shortcut: "" }); setEditing(null); };

  type QRItem = { id: number; title: string; text: string; shortcut?: string | null };
  const handleOpen = (item?: QRItem) => {
    if (item) {
      setEditing(item.id);
      setForm({ title: item.title, text: item.text, shortcut: item.shortcut ?? "" });
    } else {
      resetForm();
    }
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.text.trim()) {
      toast.error("Заполните название и текст");
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Шаблоны</p>
            <h1 className="text-2xl font-black tracking-tight">Быстрые ответы</h1>
          </div>
          <Button onClick={() => handleOpen()} className="gap-2 font-bold shadow shadow-primary/25">
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
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <p className="font-bold text-sm mb-1">Нет шаблонов</p>
            <p className="text-xs text-muted-foreground mb-5">Создайте шаблоны для быстрых ответов в диалогах</p>
            <Button variant="outline" onClick={() => handleOpen()} className="gap-2 font-semibold">
              <Plus className="h-4 w-4" />
              Создать первый шаблон
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map(item => (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-border/80 transition-colors group">
                <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow shadow-primary/25">
                  <Zap className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-sm">{item.title}</p>
                    {item.shortcut && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono border border-primary/20">
                        /{item.shortcut}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{item.text}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpen(item as QRItem)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id: item.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-black">{editing ? "Редактировать шаблон" : "Новый шаблон"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Название</Label>
                <Input
                  placeholder="Например: Приветствие"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Быстрая команда (необязательно)</Label>
                <Input
                  placeholder="привет"
                  value={form.shortcut}
                  onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                  className="bg-muted border-border"
                />
                <p className="text-xs text-muted-foreground">Введите /команда в диалоге для быстрой вставки</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Текст ответа</Label>
                <Textarea
                  placeholder="Здравствуйте! Чем могу помочь?"
                  rows={4}
                  value={form.text}
                  onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                  className="bg-muted border-border resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Отмена</Button>
                <Button className="flex-1 font-bold" onClick={handleSubmit} disabled={isPending}>
                  {isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
