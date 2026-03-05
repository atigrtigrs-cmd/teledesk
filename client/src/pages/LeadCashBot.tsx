import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Users,
  Clock,
  Activity,
  Globe,
  ShieldCheck,
  FileText,
  ScrollText,
  LayoutGrid,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Pencil,
  Save,
  X,
  AlertCircle,
  MessageSquare,
  Trash2,
  Plus,
  Send,
  CheckCheck,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "moderation" | "groups" | "categories" | "admins" | "templates" | "logs" | "broadcast";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Обзор", icon: LayoutGrid },
  { id: "moderation", label: "Модерация", icon: Clock },
  { id: "groups", label: "Группы", icon: Users },
  { id: "categories", label: "Категории", icon: Globe },
  { id: "admins", label: "Администраторы", icon: ShieldCheck },
  { id: "templates", label: "Шаблоны", icon: FileText },
  { id: "logs", label: "Лог событий", icon: ScrollText },
  { id: "broadcast", label: "Рассылка", icon: Send },
];

const CATEGORY_COLORS: Record<string, string> = {
  advertisers: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  brokers_ru: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  brokers_en: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  test: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const STAT_COLORS = [
  "from-violet-600 to-violet-800",
  "from-blue-600 to-blue-800",
  "from-cyan-600 to-cyan-800",
  "from-emerald-600 to-emerald-800",
  "from-amber-600 to-amber-800",
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
function StatCard({ label, value, colorIdx }: { label: string; value: number | string; colorIdx: number }) {
  return (
    <div className={`rounded-xl p-4 bg-gradient-to-br ${STAT_COLORS[colorIdx % STAT_COLORS.length]} text-white`}>
      <p className="text-xs font-semibold opacity-80 mb-1">{label}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-7 w-7 text-primary animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-14 w-14 rounded-2xl bg-primary/8 border border-primary/20 flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-black text-base mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: groups, isLoading } = trpc.leadcashBot.groups.useQuery();
  const { data: logs } = trpc.leadcashBot.logs.useQuery();
  if (isLoading) return <LoadingState />;
  const g = groups as any;
  const advertisers = g?.advertisers?.count ?? 0;
  const brokersRu = g?.brokers_ru?.count ?? 0;
  const brokersEn = g?.brokers_en?.count ?? 0;
  const pending = g?.pending?.count ?? 0;
  const total = g?.total_groups ?? 0;
  const logCount = (logs as any)?.total_entries ?? 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Всего групп" value={total} colorIdx={0} />
        <StatCard label="Брокеры РФ" value={brokersRu} colorIdx={1} />
        <StatCard label="Брокеры EN" value={brokersEn} colorIdx={2} />
        <StatCard label="Категорий" value={5} colorIdx={3} />
        <StatCard label="Рекламодатели" value={advertisers} colorIdx={4} />
        <StatCard label="На модерации" value={pending} colorIdx={0} />
        <StatCard label="Событий в логе" value={logCount} colorIdx={1} />
        <StatCard label="Тест" value={g?.test?.count ?? 0} colorIdx={2} />
      </div>
      {pending > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-400">{pending} группа ожидает модерации</p>
            <p className="text-xs text-muted-foreground">Перейдите во вкладку «Модерация» для одобрения</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Moderation Tab ───────────────────────────────────────────────────────────
function ModerationTab() {
  const { data: groups, isLoading, refetch } = trpc.leadcashBot.groups.useQuery();
  const { data: categoriesData } = trpc.leadcashBot.categories.useQuery();
  const [approving, setApproving] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Record<string, string>>({});
  const approveMutation = trpc.leadcashBot.approveGroup.useMutation({
    onSuccess: (res) => {
      if (res.success) toast.success("Группа одобрена!");
      else toast.error("Ошибка при одобрении группы");
      setApproving(null);
      refetch();
    },
    onError: () => { toast.error("Ошибка сети"); setApproving(null); },
  });
  const removeMutation = trpc.leadcashBot.removeGroup.useMutation({
    onSuccess: () => { toast.success("Группа удалена"); refetch(); },
    onError: () => toast.error("Ошибка удаления"),
  });
  if (isLoading) return <LoadingState />;
  const pendingGroups = Object.entries((groups as any)?.pending?.groups ?? {}) as [string, any][];
  const categories = Object.entries((categoriesData as any)?.categories ?? {}) as [string, any][];
  if (pendingGroups.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Нет групп на модерации" description="Все группы обработаны. Новые заявки появятся здесь автоматически." />;
  }
  return (
    <div className="space-y-3">
      {pendingGroups.map(([chatId, group]) => (
        <div key={chatId} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{group.title}</p>
            <p className="text-xs text-muted-foreground">ID: {chatId} · Язык: {group.lang?.toUpperCase() ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={selectedCategory[chatId] ?? ""} onValueChange={(v) => setSelectedCategory(prev => ({ ...prev, [chatId]: v }))}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Выбрать категорию" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(([key, cat]) => (
                  <SelectItem key={key} value={key}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs font-bold"
              disabled={!selectedCategory[chatId] || approving === chatId}
              onClick={() => { setApproving(chatId); approveMutation.mutate({ chatId, category: selectedCategory[chatId], lang: group.lang ?? "ru" }); }}
            >
              {approving === chatId ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
              Одобрить
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => removeMutation.mutate({ chatId })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Groups Tab ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const { data: groups, isLoading, refetch } = trpc.leadcashBot.groups.useQuery();
  const { data: categoriesData } = trpc.leadcashBot.categories.useQuery();
  const [filter, setFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editLang, setEditLang] = useState("");

  const updateMutation = trpc.leadcashBot.updateGroup.useMutation({
    onSuccess: (res) => {
      if (res.success) { toast.success("Группа обновлена"); refetch(); }
      else toast.error("Ошибка обновления");
      setEditingId(null);
    },
    onError: () => toast.error("Ошибка сети"),
  });
  const removeMutation = trpc.leadcashBot.removeGroup.useMutation({
    onSuccess: () => { toast.success("Группа удалена"); refetch(); },
    onError: () => toast.error("Ошибка удаления"),
  });

  if (isLoading) return <LoadingState />;

  const allGroups: { chatId: string; group: any; category: string }[] = [];
  const cats = ["advertisers", "brokers_ru", "brokers_en", "test", "pending"];
  for (const cat of cats) {
    const catGroups = (groups as any)?.[cat]?.groups ?? {};
    for (const [chatId, group] of Object.entries(catGroups) as [string, any][]) {
      allGroups.push({ chatId, group, category: cat });
    }
  }
  const filtered = filter === "all" ? allGroups : allGroups.filter(g => g.category === filter);
  const categories = Object.entries((categoriesData as any)?.categories ?? {}) as [string, any][];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {[{ id: "all", label: "Все" }, ...cats.map(c => ({ id: c, label: c }))].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {f.id === "all" ? "Все" : f.label}
            {f.id !== "all" && <span className="ml-1.5 opacity-60">{allGroups.filter(g => g.category === f.id).length}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Нет групп" description="В этой категории нет групп." />
      ) : (
        <div className="space-y-2">
          {filtered.map(({ chatId, group, category }) => (
            <div key={chatId} className="bg-card border border-border rounded-xl px-4 py-3">
              {editingId === chatId ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{group.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">{chatId}</p>
                    </div>
                  </div>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue placeholder="Категория" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(([key, cat]) => (
                        <SelectItem key={key} value={key}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={editLang} onValueChange={setEditLang}>
                    <SelectTrigger className="w-20 h-8 text-xs">
                      <SelectValue placeholder="Язык" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">RU</SelectItem>
                      <SelectItem value="en">EN</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" className="h-8 text-xs font-bold gap-1" disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ chatId, category: editCategory, lang: editLang, title: group.title })}>
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Сохранить
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{group.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">{chatId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[category] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                      {category}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase">{group.lang ?? "—"}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditingId(chatId); setEditCategory(category); setEditLang(group.lang ?? "ru"); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMutation.mutate({ chatId })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const { data, isLoading, refetch } = trpc.leadcashBot.categories.useQuery();
  const { data: groups } = trpc.leadcashBot.groups.useQuery();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [editLineId, setEditLineId] = useState("");

  const updateMutation = trpc.leadcashBot.updateCategory.useMutation({
    onSuccess: (res) => {
      if (res.success) { toast.success("Категория обновлена"); refetch(); }
      else toast.error("Ошибка обновления");
      setEditingKey(null);
    },
    onError: () => toast.error("Ошибка сети"),
  });

  if (isLoading) return <LoadingState />;
  const categories = Object.entries((data as any)?.categories ?? {}) as [string, any][];

  return (
    <div className="space-y-3">
      {categories.map(([key, cat]) => {
        const count = (groups as any)?.[key]?.count ?? 0;
        const isEditing = editingKey === key;
        return (
          <div key={key} className="bg-card border border-border rounded-xl p-4">
            {isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[key] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>{key}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingKey(null)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" className="h-7 text-xs font-bold gap-1" disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ key, name: editName, name_en: editNameEn, line_id: editLineId })}>
                      {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Сохранить
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Название (RU)</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Название (EN)</Label>
                    <Input value={editNameEn} onChange={e => setEditNameEn(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Line ID (Bitrix24)</Label>
                    <Input value={editLineId} onChange={e => setEditLineId(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.name_en} · Line ID: {cat.line_id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[key] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>{key}</span>
                  <span className="text-sm font-black text-primary">{count}</span>
                  <span className="text-xs text-muted-foreground">групп</span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditingKey(key); setEditName(cat.name); setEditNameEn(cat.name_en ?? ""); setEditLineId(cat.line_id ?? ""); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Admins Tab ───────────────────────────────────────────────────────────────
function AdminsTab() {
  const { data, isLoading, refetch } = trpc.leadcashBot.admins.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");

  const addMutation = trpc.leadcashBot.addAdmin.useMutation({
    onSuccess: (res) => {
      if (res.success) { toast.success("Администратор добавлен"); refetch(); setShowAdd(false); setNewId(""); setNewName(""); }
      else toast.error("Ошибка добавления");
    },
    onError: () => toast.error("Ошибка сети"),
  });
  const removeMutation = trpc.leadcashBot.removeAdmin.useMutation({
    onSuccess: () => { toast.success("Администратор удалён"); refetch(); },
    onError: () => toast.error("Ошибка удаления"),
  });

  if (isLoading) return <LoadingState />;
  const admins = Object.entries((data as any)?.admins ?? {}) as [string, any][];

  return (
    <div className="space-y-3">
      {/* Add admin button */}
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5 font-bold" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          Добавить администратора
        </Button>
      </div>

      {/* Add admin dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Добавить администратора</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Telegram ID</Label>
              <Input value={newId} onChange={e => setNewId(e.target.value)} placeholder="123456789" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Имя</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Иван Иванов" className="h-9 text-sm" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Отмена</Button>
              <Button
                className="flex-1 font-bold"
                disabled={!newId || !newName || addMutation.isPending}
                onClick={() => addMutation.mutate({ telegram_id: newId, name: newName })}
              >
                {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Добавить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {admins.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Нет администраторов" description="Добавьте администраторов через кнопку выше." />
      ) : (
        admins.map(([userId, admin]) => (
          <div key={userId} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-black text-sm">
                {admin.name?.charAt(0) ?? "A"}
              </div>
              <div>
                <p className="font-bold text-sm">{admin.name}</p>
                <p className="text-xs text-muted-foreground">ID: {userId} · Добавлен: {admin.added_at}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">Администратор</Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeMutation.mutate({ telegram_id: userId })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab() {
  const { data, isLoading, refetch } = trpc.leadcashBot.templates.useQuery();
  const [editing, setEditing] = useState<string | null>(null);
  const [editRu, setEditRu] = useState("");
  const [editEn, setEditEn] = useState("");
  const updateMutation = trpc.leadcashBot.updateTemplate.useMutation({
    onSuccess: (res) => {
      if (res.success) { toast.success("Шаблон обновлён"); refetch(); }
      else toast.error("Ошибка обновления шаблона");
      setEditing(null);
    },
    onError: () => toast.error("Ошибка сети"),
  });
  if (isLoading) return <LoadingState />;
  const templates = Object.entries((data as any)?.templates ?? {}) as [string, any][];
  const TEMPLATE_NAMES: Record<string, string> = {
    increase: "Увеличение трафика",
    payment: "Запрос оплаты",
    reconciliation: "Сверка трафика",
  };
  return (
    <div className="space-y-4">
      {templates.map(([key, tpl]) => (
        <div key={key} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-sm">{TEMPLATE_NAMES[key] ?? key}</p>
              <p className="text-xs text-muted-foreground font-mono">{key}</p>
            </div>
            {editing !== key ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                onClick={() => { setEditing(key); setEditRu(tpl.ru ?? ""); setEditEn(tpl.en ?? ""); }}>
                <Pencil className="h-3 w-3" />Изменить
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(null)}><X className="h-3 w-3" /></Button>
                <Button size="sm" className="h-7 text-xs gap-1 font-bold" disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ key, ru: editRu, en: editEn })}>
                  {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Сохранить
                </Button>
              </div>
            )}
          </div>
          {editing === key ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">🇷🇺 Русский</Label>
                <Textarea value={editRu} onChange={e => setEditRu(e.target.value)} className="text-xs min-h-[100px] font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">🇬🇧 English</Label>
                <Textarea value={editEn} onChange={e => setEditEn(e.target.value)} className="text-xs min-h-[100px] font-mono" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">🇷🇺 Русский</p>
                <p className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{tpl.ru}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">🇬🇧 English</p>
                <p className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{tpl.en}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────
const LOG_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  new_group: { label: "Новая группа", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  group_category_set: { label: "Категория задана", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  group_removed: { label: "Группа удалена", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  message_sent: { label: "Сообщение отправлено", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

function LogsTab() {
  const { data, isLoading } = trpc.leadcashBot.logs.useQuery();
  if (isLoading) return <LoadingState />;
  const logs: any[] = (data as any)?.logs ?? [];
  if (logs.length === 0) return <EmptyState icon={ScrollText} title="Лог пуст" description="События появятся здесь по мере работы бота." />;
  return (
    <div className="space-y-2">
      {[...logs].reverse().map((log: any, i: number) => {
        const cfg = LOG_TYPE_CONFIG[log.type] ?? { label: log.type, color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
        const ts = new Date(log.timestamp).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        return (
          <div key={i} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-3">
            <Activity className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground">{ts}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {log.data?.title ?? log.data?.chat_id ?? JSON.stringify(log.data).slice(0, 80)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Broadcast Tab ───────────────────────────────────────────────────────────
function BroadcastTab() {
  const { data: categoriesData } = trpc.leadcashBot.categories.useQuery();
  const { data: templatesData } = trpc.leadcashBot.templates.useQuery();
  const broadcastMutation = trpc.leadcashBot.broadcast.useMutation();

  const [category, setCategory] = useState("all");
  const [langFilter, setLangFilter] = useState<"all" | "ru" | "en">("all");
  const [text, setText] = useState("");
  const [results, setResults] = useState<null | { successCount: number; failCount: number; total: number; results: Array<{ id: number; title: string; ok: boolean; error?: string }> }>(null);

  const categories: any[] = (categoriesData as any)?.categories ?? [];
  const templates: any[] = (templatesData as any)?.templates ?? [];

  const handleSend = () => {
    if (!text.trim()) { toast.error("Введите текст сообщения"); return; }
    broadcastMutation.mutate(
      { category, text: text.trim(), langFilter },
      {
        onSuccess: (data) => {
          setResults(data);
          toast.success(`Отправлено: ${data.successCount}/${data.total} групп`);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-black text-sm tracking-wide">Настройки рассылки</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Категория групп</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все группы</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {cat.name} ({cat.name_en})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Язык групп</Label>
            <Select value={langFilter} onValueChange={(v) => setLangFilter(v as "all" | "ru" | "en")}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все языки</SelectItem>
                <SelectItem value="ru">🇷🇺 Русские</SelectItem>
                <SelectItem value="en">🇬🇧 Английские</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="font-black text-sm tracking-wide">Выбрать шаблон</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {templates.map((tpl: any) => (
              <button
                key={tpl.key}
                onClick={() => setText(langFilter === "en" ? tpl.en : tpl.ru)}
                className="text-left rounded-lg border border-border bg-muted/20 hover:bg-muted/50 p-3 transition-colors"
              >
                <p className="text-xs font-bold mb-1 text-primary">{tpl.key}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{langFilter === "en" ? tpl.en : tpl.ru}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message composer */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-black text-sm tracking-wide">Текст сообщения</h3>
        <p className="text-xs text-muted-foreground">Поддерживается HTML-форматирование: <code className="bg-muted px-1 rounded">&lt;b&gt;</code>, <code className="bg-muted px-1 rounded">&lt;i&gt;</code>, <code className="bg-muted px-1 rounded">&lt;a href="..."&gt;</code></p>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Введите текст рассылки..."
          className="min-h-[140px] font-mono text-sm"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{text.length} символов</p>
          <Button
            onClick={handleSend}
            disabled={broadcastMutation.isPending || !text.trim()}
            className="gap-2 font-bold"
          >
            {broadcastMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {broadcastMutation.isPending ? "Отправляем..." : "Отправить рассылку"}
          </Button>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="font-black text-sm tracking-wide flex-1">Результаты рассылки</h3>
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <CheckCheck className="h-4 w-4" />{results.successCount} успешно
            </span>
            {results.failCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                <XCircle className="h-4 w-4" />{results.failCount} ошибок
              </span>
            )}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {results.results.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${
                r.ok ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20"
              }`}>
                {r.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                <span className="flex-1 truncate font-medium">{r.title}</span>
                {!r.ok && <span className="text-red-400 truncate max-w-[200px]">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeadCashBot() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data: groups, refetch: refetchGroups } = trpc.leadcashBot.groups.useQuery();
  const { data: logs, refetch: refetchLogs } = trpc.leadcashBot.logs.useQuery();
  const pendingCount = (groups as any)?.pending?.count ?? 0;
  const logCount = (logs as any)?.total_entries ?? 0;
  const totalGroups = (groups as any)?.total_groups ?? 0;
  const BADGES: Partial<Record<Tab, number>> = {
    moderation: pendingCount,
    logs: logCount,
    groups: totalGroups,
  };
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-black text-primary tracking-widest uppercase mb-1">Интеграция</p>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight">LeadCash Bot</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Активен
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">@leadcash_support_bot · Управление партнёрскими группами</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchGroups(); refetchLogs(); }} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 border-b border-border pb-3">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const badge = BADGES[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {badge !== undefined && badge > 0 && (
                  <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-black ${
                    isActive ? "bg-white/20 text-white" : "bg-primary/15 text-primary"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "moderation" && <ModerationTab />}
        {activeTab === "groups" && <GroupsTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "admins" && <AdminsTab />}
        {activeTab === "templates" && <TemplatesTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "broadcast" && <BroadcastTab />}
      </div>
    </DashboardLayout>
  );
}
