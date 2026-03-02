import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      apiRequest("POST", isLogin ? "/api/auth/login" : "/api/auth/register", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
    onError: (e: Error) => {
      toast({ title: "错误", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-primary-foreground">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight">Dream Stage</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {isLogin ? "登录您的账户，开始游戏" : "创建账户，加入游戏大厅"}
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-6 shadow-lg">
          <div className="flex rounded-md overflow-hidden mb-6 bg-muted p-1 gap-1">
            <button
              type="button"
              data-testid="tab-login"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                isLogin ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              data-testid="tab-register"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                !isLogin ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm text-muted-foreground">用户名</Label>
              <Input
                id="username"
                data-testid="input-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm text-muted-foreground">密码</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="bg-background border-border"
              />
            </div>
            <Button
              type="submit"
              data-testid="button-submit"
              className="w-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "请稍候..." : isLogin ? "登录" : "注册"}
            </Button>
          </form>

          {isLogin && (
            <p className="mt-4 text-xs text-center text-muted-foreground">
              管理员账号：admin / admin123
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
