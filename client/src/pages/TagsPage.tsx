import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tag, Plus, Pencil, Trash2, Loader2, Hash } from "lucide-react";
import { toast } from "sonner";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6",
];

export default function TagsPage() {
  const { data: tags, isLoading, refetch } = trpc.tags.list.useQuery();
  const [editingTag, setEditingTag] = useState<{ id?: number; name: string; color: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const createMutation = trpc.tags.create.useMutation({
    onSuccess: () => { refetch(); setDialogOpen(false); setEditingTag(null); toast.success("Тег создан"); },
    onError: () => toast.error("Ошибка"),
  });

  const deleteMutation = trpc.tags.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Тег удалён"); },
    onError: () => toast.error("Ошибка"),
  });

  const handleSave = () => {
    if (!editingTag?.name.trim()) return;
    // No update procedure exists — delete old and create new
    if (editingTag.id) {
      deleteMutation.mutate({ id: editingTag.id }, {
        onSuccess: () => {
          createMutation.mutate({ name: editingTag.name, color: editingTag.color });
        }
      });
    } else {
      createMutation.mutate({ name: editingTag.name, color: editingTag.color });
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-full max-w-2xl mx-auto py-6 px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold">Теги</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Управление тегами для диалогов</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setEditingTag({ name: "", color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)] })}
              >
                <Plus className="h-3.5 w-3.5" />
                Новый тег
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingTag?.id ? "Редактировать тег" : "Новый тег"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Input
                  placeholder="Название тега"
                  value={editingTag?.name ?? ""}
                  onChange={(e) => setEditingTag(prev => prev ? { ...prev, name: e.target.value } : null)}
                  autoFocus
                />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Цвет</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setEditingTag(prev => prev ? { ...prev, color } : null)}
                        className={`h-7 w-7 rounded-full transition-all ${editingTag?.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110" : "hover:scale-105"}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Превью:</span>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: editingTag?.color }}
                  >
                    <Hash className="h-3 w-3" />
                    {editingTag?.name || "Тег"}
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditingTag(null); }}>
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!editingTag?.name.trim() || createMutation.isPending || deleteMutation.isPending}
                  >
                    {(createMutation.isPending || deleteMutation.isPending) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      editingTag?.id ? "Сохранить" : "Создать"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !tags?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Tag className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Нет тегов</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Создайте первый тег для маркировки диалогов</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-colors group"
              >
                <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="font-medium text-sm flex-1">{tag.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setEditingTag({ id: tag.id, name: tag.name, color: tag.color }); setDialogOpen(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("Удалить тег?")) deleteMutation.mutate({ id: tag.id }); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
