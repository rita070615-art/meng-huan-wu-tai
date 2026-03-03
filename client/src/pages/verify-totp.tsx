import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import logoImg from "@assets/梦幻舞台.png";

export default function VerifyTotpPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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
    if (code.length !== 6) return;
    verifyMutation.mutate(code.trim());
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={logoImg} alt="梦幻舞台" className="w-16 h-16 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold">双重认证验证</h1>
          <p className="text-muted-foreground text-sm mt-1">请打开验证器 App，输入当前的6位验证码</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>验证码</Label>
              <Input
                data-testid="input-totp-verify-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                className="text-center text-2xl tracking-widest font-mono h-14"
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
            <Button
              data-testid="button-verify-totp"
              type="submit"
              className="w-full"
              disabled={code.length !== 6 || verifyMutation.isPending}
            >
              {verifyMutation.isPending ? "验证中..." : "验证并登录"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            验证码每30秒更新一次，请使用最新的验证码
          </p>
        </div>
      </div>
    </div>
  );
}
