import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck } from "lucide-react";
import logoImg from "@assets/梦幻舞台.png";

export default function VerifyTotpPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [code, setCode] = useState("");

  const verifyMutation = useMutation({
    mutationFn: (code: string) => apiRequest("POST", "/api/auth/totp/verify", { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
    onError: (e: Error) => {
      toast({ title: "验证失败", description: e.message, variant: "destructive" });
      setCode("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) verifyMutation.mutate(code);
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
            <img src={logoImg} alt="梦幻舞台" className="w-28 h-28 object-contain" style={{ filter: "drop-shadow(0 0 20px rgba(139,92,246,0.4))" }} />
            <span className="text-2xl font-bold tracking-tight -mt-2">梦幻舞台</span>
          </div>
          <p className="text-muted-foreground text-sm">双重身份验证</p>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-6 shadow-lg space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">验证您的身份</p>
              {user && (
                <p className="text-sm text-muted-foreground mt-0.5">欢迎回来，{user.nickname || user.username}</p>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            请打开您的验证器应用，输入当前显示的 6 位动态验证码
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              data-testid="input-verify-totp"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) verifyMutation.mutate(v);
              }}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              className="font-mono tracking-[0.4em] text-center text-2xl h-14"
              autoComplete="one-time-code"
              autoFocus
            />
            <Button
              data-testid="button-verify-totp"
              type="submit"
              className="w-full"
              disabled={code.length !== 6 || verifyMutation.isPending}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              {verifyMutation.isPending ? "验证中..." : "确认验证"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
