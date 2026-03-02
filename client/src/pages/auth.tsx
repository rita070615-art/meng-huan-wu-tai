import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Redirect } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, CheckCircle2 } from "lucide-react";
import logoImg from "@assets/logo_v2.png";

type View = "login" | "register" | "forgot";

export default function AuthPage() {
  const { user, isLoading } = useAuth();
  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Forgot password state
  const [resetUsername, setResetUsername] = useState("");
  const [resetTotpCode, setResetTotpCode] = useState("");
  const [resetNewPw, setResetNewPw] = useState("");
  const [resetConfirmPw, setResetConfirmPw] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const authMutation = useMutation({
    mutationFn: (data: { username: string; password: string; nickname?: string }) =>
      apiRequest("POST", view === "login" ? "/api/auth/login" : "/api/auth/register", data),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/");
    },
    onError: (e: Error) => {
      toast({ title: "错误", description: e.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (data: { username: string; totpCode: string; newPassword: string }) =>
      apiRequest("POST", "/api/auth/reset-password", data),
    onSuccess: () => {
      setResetDone(true);
    },
    onError: (e: Error) => {
      toast({ title: "重置失败", description: e.message, variant: "destructive" });
      setResetTotpCode("");
    },
  });

  if (!isLoading && user) return <Redirect to="/" />;

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === "register" && !nickname.trim()) {
      toast({ title: "请填写昵称", variant: "destructive" });
      return;
    }
    authMutation.mutate(
      view === "login"
        ? { username, password }
        : { username, nickname: nickname.trim(), password }
    );
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPw !== resetConfirmPw) {
      toast({ title: "两次密码不一致", variant: "destructive" });
      return;
    }
    if (resetTotpCode.length !== 6) {
      toast({ title: "请输入6位验证码", variant: "destructive" });
      return;
    }
    resetMutation.mutate({ username: resetUsername, totpCode: resetTotpCode, newPassword: resetNewPw });
  };

  const switchToForgot = () => {
    setView("forgot");
    setResetUsername(username);
    setResetTotpCode("");
    setResetNewPw("");
    setResetConfirmPw("");
    setResetDone(false);
  };

  const switchTab = (v: View) => {
    setView(v);
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
            {view === "login" && "登录您的账户，开始聊天"}
            {view === "register" && "创建账户，加入聊天大厅"}
            {view === "forgot" && "使用双重认证重置密码"}
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-6 shadow-lg">
          {view === "forgot" ? (
            /* ── Forgot Password View ── */
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">通过双重认证重置密码</h3>
              </div>

              {resetDone ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                  <p className="font-semibold">密码重置成功！</p>
                  <Button
                    className="w-full mt-2"
                    onClick={() => { setView("login"); setResetDone(false); }}
                  >
                    返回登录
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">用户名</Label>
                    <Input
                      data-testid="input-reset-username"
                      value={resetUsername}
                      onChange={(e) => setResetUsername(e.target.value)}
                      placeholder="请输入您的用户名"
                      autoComplete="username"
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">验证器验证码</Label>
                    <Input
                      data-testid="input-reset-totp"
                      value={resetTotpCode}
                      onChange={(e) => setResetTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      className="bg-background border-border font-mono tracking-widest text-center text-lg"
                      autoComplete="one-time-code"
                    />
                    <p className="text-xs text-muted-foreground">打开您的验证器 App（如 Google Authenticator），输入当前6位验证码</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">新密码</Label>
                    <Input
                      data-testid="input-reset-new-pw"
                      type="password"
                      value={resetNewPw}
                      onChange={(e) => setResetNewPw(e.target.value)}
                      placeholder="至少4位"
                      autoComplete="new-password"
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm text-muted-foreground">确认新密码</Label>
                    <Input
                      data-testid="input-reset-confirm-pw"
                      type="password"
                      value={resetConfirmPw}
                      onChange={(e) => setResetConfirmPw(e.target.value)}
                      placeholder="再次输入新密码"
                      autoComplete="new-password"
                      className="bg-background border-border"
                    />
                  </div>

                  <Button
                    data-testid="button-reset-submit"
                    type="submit"
                    className="w-full"
                    disabled={!resetUsername || resetTotpCode.length !== 6 || !resetNewPw || !resetConfirmPw || resetMutation.isPending}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    {resetMutation.isPending ? "重置中..." : "确认重置密码"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => switchTab("login")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="link-back-to-login"
                  >
                    返回登录
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ── Login / Register View ── */
            <>
              <div className="flex rounded-md overflow-hidden mb-6 bg-muted p-1 gap-1">
                <button
                  type="button"
                  data-testid="tab-login"
                  onClick={() => switchTab("login")}
                  className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                    view === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  登录
                </button>
                <button
                  type="button"
                  data-testid="tab-register"
                  onClick={() => switchTab("register")}
                  className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                    view === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  注册
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
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

                {view === "register" && (
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm text-muted-foreground">密码</Label>
                    {view === "login" && (
                      <button
                        type="button"
                        data-testid="link-forgot-password"
                        onClick={switchToForgot}
                        className="text-xs text-primary hover:underline"
                      >
                        忘记密码？
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    data-testid="input-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                    className="bg-background border-border"
                  />
                </div>

                <Button
                  type="submit"
                  data-testid="button-submit"
                  className="w-full"
                  disabled={authMutation.isPending}
                >
                  {authMutation.isPending ? "请稍候..." : view === "login" ? "登录" : "注册"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
