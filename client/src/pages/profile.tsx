import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, CheckCircle2, Coins, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwChanged, setPwChanged] = useState(false);

  const changePwMutation = useMutation({
    mutationFn: ({ newPassword }: { newPassword: string }) =>
      apiRequest("POST", "/api/user/change-password", { newPassword }),
    onSuccess: () => {
      setPwChanged(true);
      setNewPassword("");
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "密码修改成功" });
    },
    onError: (e: Error) => {
      toast({ title: "修改失败", description: e.message, variant: "destructive" });
    },
  });

  const handleChangePw = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "两次密码不一致", variant: "destructive" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: "密码至少4位", variant: "destructive" });
      return;
    }
    changePwMutation.mutate({ newPassword });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title="我的" showBack />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-5">

        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" />
            账号信息
          </h2>
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="text-xl bg-primary/20 text-primary font-bold">
                {user.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-semibold text-lg" data-testid="text-profile-nickname">{user.nickname || user.username}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-username">账号：{user.username}</p>
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium" data-testid="text-profile-balance">{user.balance.toLocaleString()} 积分</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Lock className="w-4 h-4" />
            修改密码
          </h2>
          <p className="text-sm text-muted-foreground">直接输入新密码即可修改</p>

          {pwChanged ? (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm text-green-500 font-medium">密码已成功修改</p>
            </div>
          ) : (
            <form onSubmit={handleChangePw} className="space-y-4">
              <div className="space-y-1.5">
                <Label>新密码</Label>
                <Input
                  data-testid="input-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少4位"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>确认新密码</Label>
                <Input
                  data-testid="input-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                />
              </div>
              <Button
                data-testid="button-change-password"
                type="submit"
                className="w-full"
                disabled={!newPassword || !confirmPassword || changePwMutation.isPending}
              >
                <Lock className="w-4 h-4 mr-2" />
                {changePwMutation.isPending ? "修改中..." : "确认修改密码"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
