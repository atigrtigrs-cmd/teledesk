import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MessageSquare, Eye, EyeOff } from "lucide-react";

export default function Register() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const utils = trpc.useUtils();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Аккаунт создан! Добро пожаловать в TeleDesk.");
      navigate("/inbox");
    },
    onError: (err) => {
      toast.error(err.message || "Ошибка регистрации");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Заполните все поля");
      return;
    }
    if (password.length < 6) {
      toast.error("Пароль должен быть не менее 6 символов");
      return;
    }
    registerMutation.mutate({ name, email, password });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#f5a623]/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-[#f5a623] rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-black" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">
              Tele<span className="text-[#f5a623]">Desk</span>
            </span>
          </div>
          <p className="text-[#888] text-sm">Создайте аккаунт — первый пользователь станет администратором</p>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#ccc] text-sm font-medium">
                Имя
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Иван Иванов"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-[#555] focus:border-[#f5a623] focus:ring-[#f5a623]/20 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#ccc] text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-[#555] focus:border-[#f5a623] focus:ring-[#f5a623]/20 h-11"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#ccc] text-sm font-medium">
                Пароль
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-[#555] focus:border-[#f5a623] focus:ring-[#f5a623]/20 h-11 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-11 bg-[#f5a623] hover:bg-[#e09520] text-black font-bold text-sm rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {registerMutation.isPending ? "Создание аккаунта..." : "Создать аккаунт"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-[#555] text-sm">Уже есть аккаунт? </span>
            <button
              onClick={() => navigate("/login")}
              className="text-[#f5a623] text-sm font-medium hover:underline"
            >
              Войти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
