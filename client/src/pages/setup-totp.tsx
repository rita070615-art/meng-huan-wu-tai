import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ShieldCheck, Copy, CheckCircle2 } from "lucide-react";

type SetupData = { secret: string; qrDataUrl: string };

export default function SetupTotpPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);

  const { data, isLoading } = useQuery<SetupData>({
    queryKey: ["/api/auth/totp/setup"],
  });

  const enableMutation = useMutation({
    mutationFn: ({ secret, code }: { secret: string; code: string }) =>
      apiRequest("POST", "/api/auth/totp/enable", { secret, code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setDone(true);
    },
    onError: (e: Error) => {
      toast({ title: "绑定失败", description: e.message, variant: "destructive" });
      setCode("");
    },
  });

  const handleCopy = () => {
    if (data?.secret) {
      navigator.clipboard.writeText(data.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header title="双重验证" showBack />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold">双重验证已成功启用</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              您的账户现已受到双重身份验证保护。日后登录时，系统将要求您输入验证器应用中的动态验证码。
            </p>
            <Button className="w-full" onClick={() => setLocation("/")}>
              返回首页
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title="设置双重验证" showBack />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-5">

        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">绑定验证器应用</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            请使用 <span className="text-foreground font-medium">Google Authenticator</span>、
            <span className="text-foreground font-medium">Microsoft Authenticator</span> 或其他支持 TOTP 协议的验证器应用扫描以下二维码。
          </p>

          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={data.qrDataUrl}
                  alt="TOTP QR Code"
                  className="w-48 h-48 rounded-lg border border-border bg-white p-2"
                  data-testid="img-totp-qr"
                />
              </div>

              <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                <p className="text-xs text-muted-foreground">无法扫描二维码？手动输入密钥：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-background border border-border rounded px-2 py-1.5 break-all select-all" data-testid="text-totp-secret">
                    {data.secret}
                  </code>
                  <Button size="icon" variant="ghost" className="shrink-0 h-8 w-8" onClick={handleCopy} data-testid="button-copy-secret">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {data && (
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm">验证并启用</h2>
            <p className="text-sm text-muted-foreground">扫描完成后，请输入验证器应用中显示的 6 位动态验证码以完成绑定。</p>
            <div className="space-y-1.5">
              <Label>验证码</Label>
              <Input
                data-testid="input-totp-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                className="font-mono tracking-widest text-center text-lg"
                autoComplete="one-time-code"
              />
            </div>
            <Button
              data-testid="button-enable-totp"
              className="w-full"
              disabled={code.length !== 6 || enableMutation.isPending}
              onClick={() => enableMutation.mutate({ secret: data.secret, code })}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              {enableMutation.isPending ? "验证中..." : "确认启用双重验证"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
