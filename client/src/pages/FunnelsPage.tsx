import { Kanban } from "lucide-react";
import { toast } from "sonner";

export default function FunnelsPage() {
  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="text-center">
        <Kanban className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Воронки</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Kanban-доска для управления сделками</p>
        <p className="text-xs text-primary mt-3">Скоро</p>
      </div>
    </div>
  );
}
