import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      setLocation("/inbox");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <div className="w-full max-w-sm px-6 flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <MessageSquare className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black tracking-tight">LeadCash Connect</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Центр коммуникаций</p>
          </div>
        </div>

        {/* Login card */}
        <div className="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground text-center mb-5">
            Войдите через аккаунт Manus чтобы продолжить
          </p>
          <Button
            className="w-full font-semibold"
            size="lg"
            onClick={() => (window.location.href = getLoginUrl())}
          >
            Войти
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/50">Только для сотрудников команды</p>
      </div>
    </div>
  );
}
