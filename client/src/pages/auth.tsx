import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoImg from "@assets/logo_v2.png";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (data: { username: string; password: string; nickname?: string }) =>
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
    if (!isLogin && !nickname.trim()) {
      toast({ title: "请填写昵称", variant: "destructive" });
      return;
    }
    mutation.mutate(isLogin ? { username, password } : { username, nickname: nickname.trim(), password });
  };

  const switchTab = (login: boolean) => {
    setIsLogin(login);
    setUsername("");
    setNickname("");
    setPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-0 mb-2">
            <img src={logoImg} alt="梦幻舞台" className="w-40 h-40 object-contain" style={{ filter: "drop-shadow(0 0 20px rgba(139,92,246,0.4))" }} />
            <span className="text-2xl font-bold tracking-tight -mt-2">梦幻舞台</span>
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
              onClick={() => switchTab(true)}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                isLogin ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              data-testid="tab-register"
              onClick={() => switchTab(false)}
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
                placeholder="请输入用户名（登录用）"
                autoComplete="username"
                className="bg-background border-border"
              />
            </div>

            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="nickname" className="text-sm text-muted-foreground">
                  昵称
                  <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  id="nickname"
                  data-testid="input-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="您的显示名称（不能重复）"
                  maxLength={20}
                  autoComplete="off"
                  className="bg-background border-border"
                />
                <p className="text-xs text-muted-foreground">昵称用于聊天室显示，注册后可由管理员修改</p>
              </div>
            )}

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

        </div>
      </div>
    </div>
  );
}
