import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Smartphone, CheckCircle2 } from "lucide-react";
import logoImg from "@assets/梦幻舞台.png";

type SetupData = { secret: string; qrDataUrl: string };

export default function SetupTotpPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"qr" | "done">("qr");

  const { data, isLoading, error } = useQuery<SetupData>({
    queryKey: ["/api/auth/totp/setup"],
    retry: false,
  });

  const enableMutation = useMutation({
    mutationFn: ({ secret, code }: { secret: string; code: string }) =>
      apiRequest("POST", "/api/auth/totp/enable", { secret, code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setStep("done");
      setTimeout(() => setLocation("/"), 1500);
    },
    onError: (e: Error) => toast({ title: "绑定失败", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || code.length !== 6) return;
    enableMutation.mutate({ secret: data.secret, code: code.trim() });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={logoImg} alt="梦幻舞台" className="w-16 h-16 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold">绑定双重认证</h1>
          <p className="text-muted-foreground text-sm mt-1">为保护账号安全，请绑定 TOTP 验证器</p>
        </div>

        {step === "done" ? (
          <div className="bg-card border border-card-border rounded-xl p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <p className="font-semibold text-lg">绑定成功！</p>
            <p className="text-muted-foreground text-sm">正在跳转到大厅...</p>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3 text-sm">
              <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">使用 Google Authenticator 或同类应用</p>
                <p className="text-muted-foreground">扫描下方二维码，然后输入应用显示的6位验证码</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <p className="text-destructive text-sm text-center">加载失败，请刷新重试</p>
            ) : data ? (
              <>
                <div className="flex justify-center">
                  <img
                    src={data.qrDataUrl}
                    alt="TOTP QR Code"
                    className="w-48 h-48 rounded-lg border border-border bg-white p-1"
                    data-testid="img-totp-qr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">手动输入密钥（如无法扫码）</Label>
                  <div
                    className="font-mono text-xs bg-muted px-3 py-2 rounded-md break-all select-all border border-border"
                    data-testid="text-totp-secret"
                  >
                    {data.secret}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>输入验证器中的6位验证码</Label>
                    <Input
                      data-testid="input-totp-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      className="text-center text-lg tracking-widest font-mono"
                      autoFocus
                      autoComplete="one-time-code"
                    />
                  </div>
                  <Button
                    data-testid="button-enable-totp"
                    type="submit"
                    className="w-full"
                    disabled={code.length !== 6 || enableMutation.isPending}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    {enableMutation.isPending ? "绑定中..." : "确认绑定"}
                  </Button>
                </form>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
