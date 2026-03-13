import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import {
  Search,
  Users,
  Loader2,
  Phone,
  AtSign,
  MessageSquare,
} from "lucide-react";

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-pink-500", "bg-primary",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getContactName(c: { firstName?: string | null; lastName?: string | null; username?: string | null }) {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.username || "Неизвестный";
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const { data: dialogsData, isLoading } = trpc.dialogs.list.useQuery({ status: "all" });

  // Extract unique contacts from dialogs
  const contacts = useMemo(() => {
    if (!dialogsData) return [];
    const map = new Map<number, any>();
    for (const { contact, dialog } of dialogsData) {
      if (!contact) continue;
      if (!map.has(contact.id)) {
        map.set(contact.id, { ...contact, dialogCount: 1, lastMessageAt: dialog.lastMessageAt });
      } else {
        const existing = map.get(contact.id)!;
        existing.dialogCount++;
        if (dialog.lastMessageAt && (!existing.lastMessageAt || new Date(dialog.lastMessageAt) > new Date(existing.lastMessageAt))) {
          existing.lastMessageAt = dialog.lastMessageAt;
        }
      }
    }
    let list = Array.from(map.values());
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.firstName ?? "").toLowerCase().includes(q) ||
        (c.lastName ?? "").toLowerCase().includes(q) ||
        (c.username ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [dialogsData, search]);

  return (
    <div className="flex h-full">
      {/* Contact list */}
      <div className="w-[360px] shrink-0 border-r border-border flex flex-col bg-[oklch(0.11_0.006_240)]">
        <div className="px-4 pt-4 pb-3 shrink-0">
          <h2 className="text-base font-bold mb-3">Контакты</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени, username, телефону..."
              className="h-8 pl-8 text-sm bg-muted/30 border-0 focus-visible:ring-primary/30"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {contacts && (
            <p className="text-xs text-muted-foreground mt-2">{contacts.length.toLocaleString()} контактов</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !contacts?.length ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Users className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Нет контактов</p>
            </div>
          ) : (
            contacts.map((c) => {
              const name = getContactName(c);
              const color = getAvatarColor(name);
              return (
                <div
                  key={c.id}
                  className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/20 transition-colors border-b border-border/30"
                >
                  {c.avatarUrl ? (
                    <div className="relative shrink-0">
                      <img
                        src={c.avatarUrl}
                        alt={name}
                        className="h-9 w-9 rounded-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          const fb = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fb) fb.style.display = "flex";
                        }}
                      />
                      <div className={`h-9 w-9 rounded-full ${color} items-center justify-center text-white text-sm font-bold`} style={{ display: "none" }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  ) : (
                    <div className={`h-9 w-9 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.username && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <AtSign className="h-3 w-3" />
                          {c.username}
                        </span>
                      )}
                      {c.phone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground/50">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("ru-RU") : ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel - placeholder */}
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Выберите контакт для просмотра</p>
        </div>
      </div>
    </div>
  );
}
