import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Trash2, Edit2, Play, Square, Coins, Users,
  Settings, MessageSquare, ChevronRight, Check, X, Ban, ShieldCheck, ShieldPlus, Bot, ToggleLeft, ToggleRight, Lock, LockOpen,
  Mail, Send, Inbox, ArrowLeft, MicOff, Mic, AlertTriangle, FileDown, BarChart2, TrendingUp, TrendingDown, Wallet, RefreshCw
} from "lucide-react";
import type { Room, BetRound, BetOption, BotSettings } from "@shared/schema";

type AdminUser = { id: string; username: string; nickname: string | null; balance: number; role: string; notes: string; banned: boolean; muted: boolean; isShill: boolean; shillRoomId: string | null };
type RoomWithBet = Room & { hasActiveBet: boolean };
type BetRoundWithBets = BetRound & { bets: any[]; options: BetOption[] };

export default function AdminPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (!isLoading && !isAdmin) {
    setLocation("/");
    return null;
  }

  const isDong798 = user?.username === "DONG798" || user?.username === "@DONG798";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title="管理后台" showBack />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Tabs defaultValue="rooms">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <TabsList className="w-full sm:w-auto flex-1">
              <TabsTrigger value="rooms" data-testid="tab-rooms" className="flex-1 sm:flex-none">
                <MessageSquare className="w-4 h-4 mr-1.5" />
                聊天室管理
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users" className="flex-1 sm:flex-none">
                <Users className="w-4 h-4 mr-1.5" />
                用户管理
              </TabsTrigger>
              <TabsTrigger value="bot" data-testid="tab-bot" className="flex-1 sm:flex-none">
                <Bot className="w-4 h-4 mr-1.5" />
                托管设置
              </TabsTrigger>
              <TabsTrigger value="inbox" data-testid="tab-inbox" className="flex-1 sm:flex-none">
                <Mail className="w-4 h-4 mr-1.5" />
                私信收件箱
              </TabsTrigger>
              {isDong798 && (
                <TabsTrigger value="finance" data-testid="tab-finance" className="flex-1 sm:flex-none">
                  <BarChart2 className="w-4 h-4 mr-1.5" />
                  平台财务
                </TabsTrigger>
              )}
            </TabsList>
            <ExportDialog />
          </div>

          <TabsContent value="rooms">
            <RoomsAdmin />
          </TabsContent>
          <TabsContent value="users">
            <UsersAdmin />
          </TabsContent>
          <TabsContent value="bot">
            <BotAdmin />
          </TabsContent>
          <TabsContent value="inbox">
            <AdminInbox />
          </TabsContent>
          {isDong798 && (
            <TabsContent value="finance">
              <PlatformStats />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleExport = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const url = `/api/admin/export/excel${params.toString() ? "?" + params.toString() : ""}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-testid="button-export-excel"
        className="shrink-0 h-9 gap-1.5 text-green-600 border-green-600/40 hover:bg-green-600/5"
        onClick={() => setOpen(true)}
      >
        <FileDown className="w-4 h-4" />
        导出Excel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-4 h-4 text-green-500" />
              导出报表
            </DialogTitle>
            <DialogDescription>
              选择日期范围后导出，留空则导出全部数据。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">开始日期</Label>
                <Input
                  data-testid="input-export-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">结束日期</Label>
                <Input
                  data-testid="input-export-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>
            </div>

            {(from || to) && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                将导出 {from || "最早"} 至 {to || "最新"} 的数据
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                size="sm"
                data-testid="button-confirm-export"
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                onClick={handleExport}
              >
                <FileDown className="w-3.5 h-3.5" />
                {from || to ? "导出选定范围" : "导出全部数据"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoomsAdmin() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const { data: rooms, isLoading } = useQuery<RoomWithBet[]>({
    queryKey: ["/api/rooms"],
    refetchInterval: 10000,
  });

  const createRoomMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiRequest("POST", "/api/rooms", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setNewName("");
      setNewDesc("");
      toast({ title: "聊天室创建成功！" });
    },
    onError: (e: Error) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rooms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "聊天室已删除" });
    },
    onError: (e: Error) => toast({ title: "删除失败", description: e.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createRoomMutation.mutate({ name: newName.trim(), description: newDesc.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-card-border rounded-lg p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          创建聊天室
        </h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">厅名称</Label>
              <Input
                data-testid="input-room-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如：百家乐大厅"
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">描述（可选）</Label>
              <Input
                data-testid="input-room-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="简短描述..."
                className="bg-background"
              />
            </div>
          </div>
          <Button
            type="submit"
            data-testid="button-create-room"
            disabled={createRoomMutation.isPending || !newName.trim()}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {createRoomMutation.isPending ? "创建中..." : "创建聊天室"}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          聊天室列表
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : rooms && rooms.length > 0 ? (
          <div className="space-y-2">
            {rooms.map((room) => (
              <div key={room.id}>
                <div
                  className="bg-card border border-card-border rounded-lg p-4 flex items-center gap-4"
                  data-testid={`admin-room-${room.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{room.name}</p>
                    {room.description && (
                      <p className="text-sm text-muted-foreground truncate">{room.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {room.hasActiveBet && (
                      <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-md">
                        点餐中
                      </span>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid={`button-manage-room-${room.id}`}
                      onClick={() => setSelectedRoom(selectedRoom === room.id ? null : room.id)}
                    >
                      <Settings className="w-3.5 h-3.5 mr-1" />
                      管理
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`button-delete-room-${room.id}`}
                      onClick={() => deleteRoomMutation.mutate(room.id)}
                      disabled={deleteRoomMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {selectedRoom === room.id && (
                  <div className="mt-1 ml-4 border-l-2 border-primary/30 pl-4 space-y-3">
                    <RoomPasswordManager room={room} />
                    <ClearMessagesButton roomId={room.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-8 text-center text-muted-foreground text-sm">
            暂无聊天室，请先创建
          </div>
        )}
      </div>
    </div>
  );
}

function ClearMessagesButton({ roomId }: { roomId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmPw, setConfirmPw] = useState("");

  const clearMutation = useMutation({
    mutationFn: (confirmPassword: string) =>
      apiRequest("DELETE", `/api/admin/rooms/${roomId}/messages`, { confirmPassword }),
    onSuccess: () => {
      setOpen(false);
      setConfirmPw("");
      toast({ title: "聊天记录已清除" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="bg-card border border-card-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-destructive" />
            <h3 className="font-semibold text-sm">清除聊天记录</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid={`button-clear-messages-${roomId}`}
            className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => { setConfirmPw(""); setOpen(true); }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            一键清除
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setConfirmPw(""); } setOpen(v); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              确认清除聊天记录
            </DialogTitle>
            <DialogDescription>
              此操作将删除该聊天室的<strong>全部消息</strong>，且无法恢复。<br />
              请输入您的账号登录密码确认操作。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              data-testid={`input-confirm-password-${roomId}`}
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="输入您的登录密码"
              autoFocus
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === "Enter" && confirmPw) clearMutation.mutate(confirmPw); }}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setOpen(false); setConfirmPw(""); }}>
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                data-testid={`button-confirm-clear-${roomId}`}
                disabled={!confirmPw || clearMutation.isPending}
                onClick={() => clearMutation.mutate(confirmPw)}
              >
                {clearMutation.isPending ? "清除中..." : "确认清除"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoomPasswordManager({ room }: { room: RoomWithBet }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState("");

  const hasPassword = !!(room as any).password || !!(room as any).hasPassword;

  const saveMutation = useMutation({
    mutationFn: (password: string) =>
      apiRequest("PATCH", `/api/admin/rooms/${room.id}/password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setEditing(false);
      setPw("");
      toast({ title: pw ? "密码已设置" : "密码已移除" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        {hasPassword ? <Lock className="w-4 h-4 text-primary" /> : <LockOpen className="w-4 h-4 text-muted-foreground" />}
        <h3 className="font-semibold text-sm">房间密码</h3>
        {hasPassword && (
          <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            已加密
          </span>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Input
            data-testid={`input-room-password-${room.id}`}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="输入新密码（留空则移除密码）"
            className="bg-background text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveMutation.mutate(pw)} disabled={saveMutation.isPending}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {pw ? "设置密码" : "移除密码"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPw(""); setEditing(false); }}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => setEditing(true)}
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs border border-dashed border-border rounded-md px-3 py-1.5 group-hover:border-primary/50 group-hover:text-primary transition-colors w-full">
            <Lock className="w-3 h-3" />
            {hasPassword ? "点击修改或移除密码..." : "点击设置房间密码..."}
          </div>
        </div>
      )}
    </div>
  );
}

function BetRoundManager({ roomId }: { roomId: string }) {
  const { toast } = useToast();
  const [options, setOptions] = useState<BetOption[]>([
    { key: "A", label: "力量", color: "#ef4444" },
    { key: "B", label: "体力", color: "#22c55e" },
    { key: "C", label: "法力", color: "#a855f7" },
    { key: "D", label: "耐力", color: "#3b82f6" },
  ]);
  const [editingOptions, setEditingOptions] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const { data: betRound, refetch } = useQuery<BetRoundWithBets | null>({
    queryKey: [`/api/rooms/${roomId}/bet-round`],
    refetchInterval: 10000,
  });

  const startBetMutation = useMutation({
    mutationFn: () => {
      const colored = options.map((o, i) => ({ ...o, color: COLORS[i % COLORS.length] }));
      return apiRequest("POST", `/api/rooms/${roomId}/bet-round`, { options: colored });
    },
    onSuccess: () => { refetch(); toast({ title: "点餐已开启！" }); },
    onError: (e: Error) => toast({ title: "开启失败", description: e.message, variant: "destructive" }),
  });

  const updateOptionsMutation = useMutation({
    mutationFn: (newOptions: BetOption[]) =>
      apiRequest("PATCH", `/api/rooms/${roomId}/bet-round/options`, { options: newOptions }),
    onSuccess: () => {
      refetch();
      setEditingOptions(false);
      toast({ title: "选项已更新！" });
    },
    onError: (e: Error) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const closeBetMutation = useMutation({
    mutationFn: (winnerOption: string) =>
      apiRequest("POST", `/api/rooms/${roomId}/bet-round/close`, { winnerOption }),
    onSuccess: () => { refetch(); toast({ title: "点餐已结束，奖励已发放！" }); },
    onError: (e: Error) => toast({ title: "结束失败", description: e.message, variant: "destructive" }),
  });

  const COLORS = ["#ef4444", "#06b6d4", "#a855f7", "#3b82f6", "#f97316", "#10b981", "#f59e0b", "#ec4899"];

  const activeOptions: BetOption[] = editingOptions
    ? options
    : betRound
    ? (betRound.options as BetOption[])
    : options;

  const generateKey = (label: string) =>
    label.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 6) + "_" + Date.now().toString(36).slice(-3);

  const updateLabel = (key: string, label: string) =>
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, label } : o)));

  const removeOption = (key: string) =>
    setOptions((prev) => prev.filter((o) => o.key !== key));

  const addOption = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = generateKey(label);
    setOptions((prev) => [...prev, { key, label, color: COLORS[prev.length % COLORS.length] }]);
    setNewLabel("");
  };

  const handleEditingToggle = () => {
    if (!editingOptions) {
      setOptions((betRound?.options as BetOption[]) || options);
    }
    setEditingOptions(!editingOptions);
  };

  const saveActiveOptions = () => {
    const colored = options.map((o, i) => ({ ...o, color: COLORS[i % COLORS.length] }));
    updateOptionsMutation.mutate(colored);
  };

  return (
    <div className="py-3 space-y-3">
      {!betRound ? (
        <Button
          size="sm"
          data-testid="button-start-bet"
          onClick={() => startBetMutation.mutate()}
          disabled={startBetMutation.isPending || options.length < 2}
          className="w-full"
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          {startBetMutation.isPending ? "开启中..." : `开启点餐（${options.length} 个选项）`}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">选择获胜选项并结束本轮：</p>
          <div className="flex flex-wrap gap-2">
            {(betRound.options as BetOption[]).map((opt, i) => (
              <Button
                key={opt.key}
                size="sm"
                variant="secondary"
                data-testid={`button-close-winner-${opt.key}`}
                onClick={() => closeBetMutation.mutate(opt.key)}
                disabled={closeBetMutation.isPending}
                className="flex-1"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                {opt.label} 获胜
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UsersAdmin() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [editingBalance, setEditingBalance] = useState<{ id: string; mode: "add" | "sub" } | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [pendingBalance, setPendingBalance] = useState<{ id: string; mode: "add" | "sub"; delta: number; currentBalance: number } | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;
  const [confirmRoleChange, setConfirmRoleChange] = useState<{ id: string; newRole: string } | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [newBalance, setNewBalance] = useState("0");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateBalanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: string; balance: number }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/balance`, { balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingBalance(null);
      setPendingBalance(null);
      toast({ title: "余额已更新" });
    },
    onError: (e: Error) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/notes`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingNotes(null);
      toast({ title: "备注已保存" });
    },
    onError: (e: Error) => toast({ title: "保存失败", description: e.message, variant: "destructive" }),
  });

  const banMutation = useMutation({
    mutationFn: ({ id, banned }: { id: string; banned: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/ban`, { banned }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: vars.banned ? "账号已封禁" : "账号已解封" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const shillMutation = useMutation({
    mutationFn: ({ id, isShill }: { id: string; isShill: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/shill`, { isShill }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-settings"] });
      toast({ title: vars.isShill ? "已设为托" : "已取消托身份" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/role`, { role }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: vars.role === "admin" ? "已升级为管理员" : "已降为普通用户" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const updateNicknameMutation = useMutation({
    mutationFn: ({ id, nickname }: { id: string; nickname: string }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/nickname`, { nickname }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingNickname(null);
      toast({ title: "昵称已更新" });
    },
    onError: (e: Error) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: { username: string; password: string; nickname?: string; balance?: number; role?: string }) =>
      apiRequest("POST", "/api/admin/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowCreateUser(false);
      setNewUsername(""); setNewPassword(""); setNewNickname(""); setNewBalance("0"); setNewRole("user");
      toast({ title: "用户已创建" });
    },
    onError: (e: Error) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });

  const sortedUsers = users ? [
    ...users.filter(u => u.role === "admin"),
    ...users.filter(u => u.role !== "admin"),
  ] : [];

  const filteredUsers = sortedUsers.filter(u => {
    const q = searchQuery.toLowerCase();
    return !q || u.username.toLowerCase().includes(q) || (u.nickname || "").toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getSeqNum = (userId: string) => {
    const idx = sortedUsers.findIndex(u => u.id === userId);
    return idx >= 0 ? idx + 1 : "?";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" />
          用户列表
        </h2>
        <Button size="sm" className="h-7 text-xs px-2" onClick={() => setShowCreateUser(v => !v)} data-testid="button-toggle-create-user">
          <Plus className="w-3.5 h-3.5 mr-1" />
          创建用户
        </Button>
      </div>

      {/* Create User Form */}
      {showCreateUser && (
        <div className="mb-4 border border-border rounded-lg p-3 bg-card space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">新建用户</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">用户名 *</label>
              <Input data-testid="input-new-username" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="用户名" className="h-7 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">密码 *</label>
              <Input data-testid="input-new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="密码" className="h-7 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">昵称</label>
              <Input data-testid="input-new-nickname" value={newNickname} onChange={e => setNewNickname(e.target.value)} placeholder="可选" className="h-7 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">初始余额</label>
              <Input data-testid="input-new-balance" type="number" min={0} value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="0" className="h-7 text-xs mt-0.5" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">角色：</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value as "user"|"admin")} className="text-xs bg-background border border-border rounded px-2 py-0.5 text-foreground" data-testid="select-new-role">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={!newUsername.trim() || !newPassword.trim() || createUserMutation.isPending} onClick={() => createUserMutation.mutate({ username: newUsername.trim(), password: newPassword, nickname: newNickname.trim() || undefined, balance: Number(newBalance) || 0, role: newRole })} data-testid="button-create-user-submit">
              {createUserMutation.isPending ? "创建中..." : "创建"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreateUser(false)}>取消</Button>
          </div>
        </div>
      )}

      {/* Confirm Role Change Dialog */}
      {confirmRoleChange && (() => {
        const target = users?.find(u => u.id === confirmRoleChange.id);
        return (
          <div className="mb-4 border border-yellow-500/40 bg-yellow-500/5 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-yellow-400">
              确认{confirmRoleChange.newRole === "admin" ? "升级为管理员" : "降为普通用户"}：{target?.nickname || target?.username}？
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-6 text-xs bg-yellow-500 hover:bg-yellow-600 text-black" disabled={roleMutation.isPending} onClick={() => { roleMutation.mutate({ id: confirmRoleChange.id, role: confirmRoleChange.newRole }); setConfirmRoleChange(null); }} data-testid="button-confirm-role-change">
                确认
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setConfirmRoleChange(null)}>取消</Button>
            </div>
          </div>
        );
      })()}

      <div className="mb-3">
        <Input
          data-testid="input-user-search"
          placeholder="搜索用户名或昵称..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="h-8 text-sm"
        />
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : pagedUsers.length > 0 ? (
        <div className="space-y-2">
          {pagedUsers.map((u) => (
            <div
              key={u.id}
              data-testid={`admin-user-${u.id}`}
              className="bg-card border border-card-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {u.username[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Nickname (primary display) */}
                    {editingNickname === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          data-testid={`input-nickname-${u.id}`}
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateNicknameMutation.mutate({ id: u.id, nickname: editNickname });
                            if (e.key === "Escape") setEditingNickname(null);
                          }}
                          maxLength={20}
                          autoFocus
                          className="h-6 w-28 text-sm px-2 py-0"
                        />
                        <button
                          data-testid={`button-save-nickname-${u.id}`}
                          onClick={() => updateNicknameMutation.mutate({ id: u.id, nickname: editNickname })}
                          disabled={updateNicknameMutation.isPending}
                          className="text-primary hover:opacity-80 transition-opacity"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingNickname(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        data-testid={`button-edit-nickname-${u.id}`}
                        onClick={() => { setEditingNickname(u.id); setEditNickname(u.nickname || ""); }}
                        className="flex items-center gap-1 group"
                        title="点击修改昵称"
                      >
                        <p className="font-medium truncate">{u.nickname || <span className="text-muted-foreground italic text-sm">未设置昵称</span>}</p>
                        <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    )}
                    {u.isShill && (
                      <span className="text-xs font-medium text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        托·开启
                      </span>
                    )}
                    {u.banned && (
                      <span className="text-xs font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                        已封禁
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    @{u.username} · {u.role === "admin" ? "管理员" : u.isShill ? "托管账户" : "普通用户"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                    编号：#{getSeqNum(u.id)}
                  </p>
                </div>

                {editingBalance?.id === u.id ? (
                  pendingBalance?.id === u.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium whitespace-nowrap ${pendingBalance.mode === "add" ? "text-green-400" : "text-red-400"}`}>
                        确认{pendingBalance.mode === "add" ? "上分" : "下分"} {pendingBalance.delta.toLocaleString()} 分？
                      </span>
                      <Button
                        size="sm"
                        variant="default"
                        data-testid={`button-confirm-balance-${u.id}`}
                        onClick={() => {
                          const newBal = pendingBalance.mode === "add"
                            ? pendingBalance.currentBalance + pendingBalance.delta
                            : Math.max(0, pendingBalance.currentBalance - pendingBalance.delta);
                          updateBalanceMutation.mutate({ id: u.id, balance: newBal });
                          setPendingBalance(null);
                        }}
                        disabled={updateBalanceMutation.isPending}
                        className={pendingBalance.mode === "add" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                      >
                        <Check className="w-3.5 h-3.5" />
                        确认
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPendingBalance(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${editingBalance.mode === "add" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                        {editingBalance.mode === "add" ? "上分" : "下分"}
                      </span>
                      <Input
                        data-testid={`input-balance-${u.id}`}
                        type="number"
                        min={1}
                        placeholder="输入金额"
                        value={editBalance}
                        onChange={(e) => setEditBalance(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const delta = parseInt(editBalance);
                            if (!isNaN(delta) && delta > 0) setPendingBalance({ id: u.id, mode: editingBalance.mode, delta, currentBalance: u.balance });
                          }
                          if (e.key === "Escape") setEditingBalance(null);
                        }}
                        className="w-24 h-8 text-sm"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="default"
                        data-testid={`button-save-balance-${u.id}`}
                        onClick={() => {
                          const delta = parseInt(editBalance);
                          if (!isNaN(delta) && delta > 0) setPendingBalance({ id: u.id, mode: editingBalance.mode, delta, currentBalance: u.balance });
                        }}
                        disabled={!editBalance || isNaN(parseInt(editBalance)) || parseInt(editBalance) <= 0}
                        className={editingBalance.mode === "add" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingBalance(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-sm font-semibold flex items-center gap-1"
                      data-testid={`text-user-balance-${u.id}`}
                    >
                      <Coins className="w-3.5 h-3.5 text-yellow-500" />
                      {u.balance.toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-add-balance-${u.id}`}
                        onClick={() => { setEditingBalance({ id: u.id, mode: "add" }); setEditBalance(""); }}
                        className="h-6 px-2 text-xs border-green-600 text-green-500 hover:bg-green-600/10"
                      >
                        上分
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-sub-balance-${u.id}`}
                        onClick={() => { setEditingBalance({ id: u.id, mode: "sub" }); setEditBalance(""); }}
                        className="h-6 px-2 text-xs border-red-600 text-red-500 hover:bg-red-600/10"
                      >
                        下分
                      </Button>
                      {u.role !== "admin" && (
                        <Button
                          size="sm"
                          data-testid={`button-shill-${u.id}`}
                          onClick={() => shillMutation.mutate({ id: u.id, isShill: !u.isShill })}
                          disabled={shillMutation.isPending}
                          className={`h-6 px-2 text-xs ${u.isShill
                            ? "bg-green-500/20 border border-green-500 text-green-400 hover:bg-green-500/30"
                            : "bg-transparent border border-border text-muted-foreground hover:border-green-500/60 hover:text-green-400"
                          }`}
                        >
                          托管
                        </Button>
                      )}
                      {u.role !== "admin" && (
                        <Button
                          size="sm"
                          data-testid={`button-ban-${u.id}`}
                          onClick={() => banMutation.mutate({ id: u.id, banned: !u.banned })}
                          disabled={banMutation.isPending}
                          className={`h-6 px-2 text-xs ${u.banned
                            ? "bg-green-500/20 border border-green-500 text-green-400 hover:bg-green-500/30"
                            : "bg-transparent border border-border text-muted-foreground hover:border-destructive/60 hover:text-destructive"
                          }`}
                        >
                          {u.banned ? "解封" : "封号"}
                        </Button>
                      )}
                      {u.id !== currentUser?.id && (
                        <Button
                          size="sm"
                          data-testid={`button-role-${u.id}`}
                          onClick={() => setConfirmRoleChange({ id: u.id, newRole: u.role === "admin" ? "user" : "admin" })}
                          disabled={roleMutation.isPending}
                          className={`h-6 px-2 text-xs ${u.role === "admin"
                            ? "bg-yellow-500/20 border border-yellow-500 text-yellow-400 hover:bg-yellow-500/30"
                            : "bg-transparent border border-border text-muted-foreground hover:border-yellow-500/60 hover:text-yellow-400"
                          }`}
                        >
                          设置管理
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="ml-12 space-y-1.5">
                {editingNotes === u.id ? (
                  <div className="space-y-2">
                    <textarea
                      data-testid={`input-notes-${u.id}`}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="输入备注内容（最多 500 字）..."
                      maxLength={500}
                      rows={3}
                      autoFocus
                      className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 resize-none outline-none focus:border-primary transition-colors text-foreground placeholder:text-muted-foreground"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        data-testid={`button-save-notes-${u.id}`}
                        onClick={() => updateNotesMutation.mutate({ id: u.id, notes: editNotes })}
                        disabled={updateNotesMutation.isPending}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        保存备注
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNotes(null)}>
                        取消
                      </Button>
                      <span className="text-xs text-muted-foreground ml-auto">{editNotes.length}/500</span>
                    </div>
                  </div>
                ) : (
                  <button
                    data-testid={`button-edit-notes-${u.id}`}
                    onClick={() => { setEditingNotes(u.id); setEditNotes(u.notes || ""); }}
                    className="w-full text-left group"
                  >
                    {u.notes ? (
                      <div className="flex items-start gap-2 bg-muted/50 rounded-md px-3 py-2">
                        <span
                          className="text-sm text-foreground flex-1 whitespace-pre-wrap break-words"
                          data-testid={`text-notes-${u.id}`}
                        >
                          {u.notes}
                        </span>
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground text-xs border border-dashed border-border rounded-md px-3 py-1.5 group-hover:border-primary/50 group-hover:text-primary transition-colors">
                        <Edit2 className="w-3 h-3" />
                        点击添加备注...
                      </div>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-lg p-8 text-center text-muted-foreground text-sm">
          {searchQuery ? "没有找到匹配的用户" : "暂无用户"}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            第 {currentPage} / {totalPages} 页，共 {filteredUsers.length} 人
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              data-testid="button-prev-page"
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              data-testid="button-next-page"
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MigrateSection() {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const migrateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/migrate-data"),
    onSuccess: () => { setDone(true); toast({ title: "数据迁移成功", description: "线上数据库已同步完成" }); },
    onError: (e: any) => toast({ title: "迁移失败", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="bg-card border border-card-border rounded-lg p-5">
      <h2 className="font-semibold mb-3 flex items-center gap-2 text-amber-400">
        <Settings className="w-4 h-4" />
        数据库同步（首次使用时运行一次）
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        将开发数据库的用户、房间等数据同步到当前数据库。只需运行一次，之后可忽略。
      </p>
      <Button
        data-testid="button-migrate-data"
        size="sm"
        variant="outline"
        onClick={() => migrateMutation.mutate()}
        disabled={migrateMutation.isPending || done}
        className={done ? "border-green-500 text-green-500" : "border-amber-500 text-amber-500 hover:bg-amber-500/10"}
      >
        {done ? <Check className="w-3.5 h-3.5 mr-1" /> : <Settings className="w-3.5 h-3.5 mr-1" />}
        {migrateMutation.isPending ? "同步中..." : done ? "已同步完成" : "一键同步数据库"}
      </Button>
    </div>
  );
}

function BotAdmin() {
  const { toast } = useToast();
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery<BotSettings>({
    queryKey: ["/api/admin/bot-settings"],
  });


  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const shills = users?.filter((u) => u.isShill) ?? [];

  const shillRoomMutation = useMutation({
    mutationFn: ({ id, shillRoomId }: { id: string; shillRoomId: string | null }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/shill-room`, { shillRoomId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "指定房间已保存" });
    },
    onError: (e: Error) => toast({ title: "保存失败", description: e.message, variant: "destructive" }),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: { enabled: boolean; minAmount: number; maxAmount: number }) =>
      apiRequest("PATCH", "/api/admin/bot-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-settings"] });
      toast({ title: "托管设置已保存" });
    },
    onError: (e: Error) => toast({ title: "保存失败", description: e.message, variant: "destructive" }),
  });

  const shillMutation = useMutation({
    mutationFn: ({ id, isShill }: { id: string; isShill: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/shill`, { isShill }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: vars.isShill ? "已设为托" : "已取消托身份" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const [editingBalanceId, setEditingBalanceId] = useState<{ id: string; mode: "add" | "sub" } | null>(null);
  const [editingBalanceValue, setEditingBalanceValue] = useState("");

  const balanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: string; balance: number }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/balance`, { balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingBalanceId(null);
      toast({ title: "积分已更新" });
    },
    onError: (e: Error) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const commitBalanceEdit = (id: string, currentBalance: number) => {
    const delta = parseInt(editingBalanceValue, 10);
    if (isNaN(delta) || delta <= 0) {
      toast({ title: "请输入有效金额（>0）", variant: "destructive" });
      return;
    }
    const mode = editingBalanceId?.mode ?? "add";
    const newBal = mode === "add" ? currentBalance + delta : Math.max(0, currentBalance - delta);
    balanceMutation.mutate({ id, balance: newBal });
  };

  const handleToggleEnabled = () => {
    if (!settings) return;
    updateSettingsMutation.mutate({
      enabled: !settings.enabled,
      minAmount: settings.minAmount,
      maxAmount: settings.maxAmount,
    });
  };

  const handleSaveRange = () => {
    if (!settings) return;
    const min = parseInt(minAmount || String(settings.minAmount));
    const max = parseInt(maxAmount || String(settings.maxAmount));
    if (isNaN(min) || isNaN(max) || min < 1 || max < 1) {
      toast({ title: "请输入有效金额", variant: "destructive" });
      return;
    }
    if (max < min) {
      toast({ title: "最大值不能小于最小值", variant: "destructive" });
      return;
    }
    updateSettingsMutation.mutate({ enabled: settings.enabled, minAmount: min, maxAmount: max });
  };


  return (
    <div className="space-y-6">
      <div className="bg-card border border-card-border rounded-lg p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-400" />
          自动托管设置
        </h2>

        {settingsLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : settings ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div>
                <p className="font-medium text-sm">托管自动下注</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  开启后，点餐开始时托账号将自动随机点餐
                </p>
              </div>
              <button
                data-testid="button-toggle-bot"
                onClick={handleToggleEnabled}
                disabled={updateSettingsMutation.isPending}
                className="flex items-center gap-1.5 text-sm font-medium transition-colors"
              >
                {settings.enabled ? (
                  <ToggleRight className="w-9 h-9 text-purple-400" />
                ) : (
                  <ToggleLeft className="w-9 h-9 text-muted-foreground" />
                )}
                <span className={settings.enabled ? "text-purple-400" : "text-muted-foreground"}>
                  {settings.enabled ? "已开启" : "已关闭"}
                </span>
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">随机下注区间（积分）</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">最小值</Label>
                  <Input
                    data-testid="input-bot-min"
                    type="number"
                    min={1}
                    placeholder={String(settings.minAmount)}
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <span className="text-muted-foreground mt-5">—</span>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1 block">最大值</Label>
                  <Input
                    data-testid="input-bot-max"
                    type="number"
                    min={1}
                    placeholder={String(settings.maxAmount)}
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  data-testid="button-save-bot-range"
                  onClick={handleSaveRange}
                  disabled={updateSettingsMutation.isPending}
                  className="mt-5 shrink-0"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  保存
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                当前区间：{settings.minAmount.toLocaleString()} ~ {settings.maxAmount.toLocaleString()} 积分，每次随机选取
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" />
          托账号列表
          {shills.length > 0 && (
            <span className="text-xs font-medium text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded ml-1">
              {shills.length} 个
            </span>
          )}
        </h2>
        {usersLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : shills.length > 0 ? (
          <div className="space-y-2">
            {shills.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-400 shrink-0">
                  {u.username[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{u.username}</p>
                  {/* Room assignment */}
                  <div className="flex items-center gap-1 mt-0.5 mb-1">
                    <select
                      data-testid={`select-shill-room-${u.id}`}
                      value={u.shillRoomId ?? ""}
                      onChange={(e) => shillRoomMutation.mutate({ id: u.id, shillRoomId: e.target.value || null })}
                      className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer max-w-[160px] truncate"
                    >
                      <option value="">🌐 全部房间</option>
                      {rooms?.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <Coins className="w-3 h-3 text-yellow-500 shrink-0" />
                    <span data-testid={`text-shill-balance-${u.id}`} className="text-xs text-muted-foreground">
                      {u.balance.toLocaleString()} 积分
                    </span>
                    {editingBalanceId?.id === u.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => { e.preventDefault(); commitBalanceEdit(u.id, u.balance); }}
                      >
                        <span className={`text-xs font-semibold px-1 py-0.5 rounded ${editingBalanceId.mode === "add" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                          {editingBalanceId.mode === "add" ? "上分" : "下分"}
                        </span>
                        <Input
                          data-testid={`input-shill-balance-${u.id}`}
                          type="number"
                          min={1}
                          placeholder="金额"
                          value={editingBalanceValue}
                          onChange={(e) => setEditingBalanceValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditingBalanceId(null); }}
                          autoFocus
                          className="h-6 text-xs w-20 px-2"
                        />
                        <button
                          type="submit"
                          className={editingBalanceId.mode === "add" ? "text-green-500 hover:text-green-400" : "text-red-500 hover:text-red-400"}
                          data-testid={`button-save-shill-balance-${u.id}`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditingBalanceId(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`button-shill-add-${u.id}`}
                          onClick={() => { setEditingBalanceId({ id: u.id, mode: "add" }); setEditingBalanceValue(""); }}
                          className="text-xs px-1.5 py-0.5 rounded border border-green-600 text-green-500 hover:bg-green-600/10 transition-colors"
                        >
                          上分
                        </button>
                        <button
                          data-testid={`button-shill-sub-${u.id}`}
                          onClick={() => { setEditingBalanceId({ id: u.id, mode: "sub" }); setEditingBalanceValue(""); }}
                          className="text-xs px-1.5 py-0.5 rounded border border-red-600 text-red-500 hover:bg-red-600/10 transition-colors"
                        >
                          下分
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid={`button-remove-shill-${u.id}`}
                  onClick={() => shillMutation.mutate({ id: u.id, isShill: false })}
                  disabled={shillMutation.isPending}
                  className="shrink-0 hover:border-destructive hover:text-destructive"
                  title="取消托身份"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-6 border border-dashed border-border rounded-lg">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            暂无托账号<br />
            <span className="text-xs">在「用户管理」中点击 <Bot className="w-3 h-3 inline" /> 图标可将用户设为托</span>
          </div>
        )}
      </div>

      <MigrateSection />
    </div>
  );
}

type PmThread = { userId: string; userUsername: string; userNickname: string | null; unread: number; lastMessage: string; lastAt: string };
type PmMessage = { id: string; userId: string; userUsername: string; userNickname: string | null; adminId: string | null; adminUsername: string | null; content: string; isFromAdmin: boolean; readByAdmin: boolean; readByUser: boolean; createdAt: string };

function AdminInbox() {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: threads, isLoading } = useQuery<PmThread[]>({
    queryKey: ["/api/admin/private-messages"],
    refetchInterval: 5000,
  });

  const { data: allUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    refetchInterval: 10000,
  });

  const { data: conversation, isLoading: convLoading } = useQuery<PmMessage[]>({
    queryKey: ["/api/admin/private-messages", selectedUserId],
    queryFn: () => apiRequest("GET", `/api/admin/private-messages/${selectedUserId}`),
    enabled: !!selectedUserId,
    refetchInterval: 3000,
  });

  const replyMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/admin/private-messages/${selectedUserId}/reply`, { content }),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/private-messages", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/private-messages"] });
    },
    onError: (e: Error) => toast({ title: "发送失败", description: e.message, variant: "destructive" }),
  });

  const muteMutation = useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/mute`, { muted }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: vars.muted ? "已禁言该用户" : "已解除禁言" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const banMutation = useMutation({
    mutationFn: ({ id, banned }: { id: string; banned: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/ban`, { banned }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: vars.banned ? "账号已封禁" : "账号已解封" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const deleteThreadMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("DELETE", `/api/admin/private-messages/${userId}`),
    onSuccess: () => {
      setSelectedUserId(null);
      setConfirmDelete(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/private-messages"] });
      toast({ title: "聊天记录已删除" });
    },
    onError: (e: Error) => toast({ title: "删除失败", description: e.message, variant: "destructive" }),
  });

  const totalUnread = threads?.reduce((sum, t) => sum + t.unread, 0) ?? 0;
  const selectedThread = threads?.find((t) => t.userId === selectedUserId);
  const selectedUserInfo = allUsers?.find((u) => u.id === selectedUserId);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="flex h-[600px]">
          <div className="w-64 border-r border-border flex flex-col shrink-0">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">私信列表</h3>
              {totalUnread > 0 && (
                <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5 font-bold">
                  {totalUnread}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                </div>
              ) : !threads?.length ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
                  <Mail className="w-8 h-8 mb-2 opacity-30" />
                  暂无私信
                </div>
              ) : (
                threads.map((thread) => {
                  const uInfo = allUsers?.find((u) => u.id === thread.userId);
                  return (
                    <button
                      key={thread.userId}
                      data-testid={`thread-item-${thread.userId}`}
                      onClick={() => { setSelectedUserId(thread.userId); setConfirmDelete(false); }}
                      className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${selectedUserId === thread.userId ? "bg-muted" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-sm truncate max-w-[120px]">
                          {thread.userNickname || thread.userUsername}
                        </span>
                        {thread.unread > 0 && (
                          <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 font-bold shrink-0">
                            {thread.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground/70 bg-muted/60 px-1 rounded">
                          ID:{thread.userId.slice(0, 8).toUpperCase()}
                        </span>
                        {uInfo?.muted && <MicOff className="w-3 h-3 text-amber-500" />}
                        {uInfo?.banned && <Ban className="w-3 h-3 text-destructive" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{thread.lastMessage}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {!selectedUserId ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                <Mail className="w-10 h-10 mb-3 opacity-20" />
                <p>选择一条私信查看对话</p>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-border flex items-center gap-2">
                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    data-testid="button-back-threads"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{selectedThread?.userNickname || selectedThread?.userUsername}</p>
                      {selectedUserInfo?.muted && <MicOff className="w-3.5 h-3.5 text-amber-500 shrink-0" title="已禁言" />}
                      {selectedUserInfo?.banned && <Ban className="w-3.5 h-3.5 text-destructive shrink-0" title="已封号" />}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      ID:{selectedUserId.slice(0, 8).toUpperCase()}
                      {selectedThread?.userNickname && ` · @${selectedThread.userUsername}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      data-testid="button-inbox-mute"
                      size="sm"
                      variant={selectedUserInfo?.muted ? "secondary" : "outline"}
                      className={`h-7 px-2 text-xs ${!selectedUserInfo?.muted ? "hover:border-amber-500 hover:text-amber-500" : ""}`}
                      title={selectedUserInfo?.muted ? "解除禁言" : "禁言"}
                      disabled={muteMutation.isPending || !selectedUserId}
                      onClick={() => selectedUserInfo && muteMutation.mutate({ id: selectedUserInfo.id, muted: !selectedUserInfo.muted })}
                    >
                      {selectedUserInfo?.muted ? <Mic className="w-3.5 h-3.5 text-amber-500" /> : <MicOff className="w-3.5 h-3.5" />}
                      <span className="ml-1">{selectedUserInfo?.muted ? "解言" : "禁言"}</span>
                    </Button>
                    <Button
                      data-testid="button-inbox-ban"
                      size="sm"
                      variant={selectedUserInfo?.banned ? "secondary" : "outline"}
                      className={`h-7 px-2 text-xs ${!selectedUserInfo?.banned ? "hover:border-destructive hover:text-destructive" : ""}`}
                      title={selectedUserInfo?.banned ? "解除封号" : "封号"}
                      disabled={banMutation.isPending || !selectedUserId}
                      onClick={() => selectedUserInfo && banMutation.mutate({ id: selectedUserInfo.id, banned: !selectedUserInfo.banned })}
                    >
                      {selectedUserInfo?.banned ? <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> : <Ban className="w-3.5 h-3.5" />}
                      <span className="ml-1">{selectedUserInfo?.banned ? "解封" : "封号"}</span>
                    </Button>
                    {confirmDelete ? (
                      <div className="flex items-center gap-1">
                        <Button
                          data-testid="button-inbox-delete-confirm"
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          disabled={deleteThreadMutation.isPending}
                          onClick={() => deleteThreadMutation.mutate(selectedUserId)}
                        >
                          {deleteThreadMutation.isPending ? "..." : "确认删除"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setConfirmDelete(false)}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <Button
                        data-testid="button-inbox-delete"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs hover:border-destructive hover:text-destructive"
                        title="删除聊天记录"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="ml-1">删除聊天</span>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {convLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                    </div>
                  ) : !conversation?.length ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                      <Mail className="w-8 h-8 mb-2 opacity-20" />
                      <p>暂无消息</p>
                    </div>
                  ) : conversation?.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isFromAdmin ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-xl px-4 py-2 text-sm ${
                          msg.isFromAdmin
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                        data-testid={`pm-msg-${msg.id}`}
                      >
                        <p className="break-words">{msg.content}</p>
                        <p className={`text-xs mt-1 opacity-60 ${msg.isFromAdmin ? "text-right" : ""}`}>
                          {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                          {msg.isFromAdmin && msg.adminUsername && ` · ${msg.adminUsername}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 border-t border-border flex gap-2">
                  <Textarea
                    data-testid="input-admin-reply"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="回复用户… (Enter发送, Shift+Enter换行)"
                    className="resize-none text-sm min-h-[60px] max-h-[120px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
                        e.preventDefault();
                        replyMutation.mutate(replyText.trim());
                      }
                    }}
                  />
                  <Button
                    data-testid="button-send-reply"
                    size="icon"
                    className="self-end shrink-0"
                    disabled={!replyText.trim() || replyMutation.isPending}
                    onClick={() => replyText.trim() && replyMutation.mutate(replyText.trim())}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformStats() {
  type Stats = {
    totalDeposits: number;
    totalWithdrawals: number;
    totalUserBalances: number;
    platformNetCash: number;
    pumpCollected: number;
    periodPump: number;
    periodRounds: number;
    periodBets: number;
    hasDateFilter: boolean;
  };

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  const qParams = new URLSearchParams();
  if (appliedFrom) qParams.set("from", appliedFrom);
  if (appliedTo) qParams.set("to", appliedTo);
  const qString = qParams.toString();

  const { data, isLoading, refetch, isFetching } = useQuery<Stats>({
    queryKey: ["/api/admin/platform-stats", qString],
    queryFn: () => fetch(`/api/admin/platform-stats${qString ? "?" + qString : ""}`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error("加载失败"); return r.json(); }),
    refetchInterval: false,
  });

  const fmt = (n: number) => n.toLocaleString("en-US");

  const applyFilter = () => {
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const clearFilter = () => {
    setFrom(""); setTo("");
    setAppliedFrom(""); setAppliedTo("");
  };

  const cards = data
    ? [
        {
          label: "平台总上分（充值）",
          value: data.totalDeposits,
          icon: <TrendingUp className="w-5 h-5" />,
          color: "text-green-500",
          bg: "bg-green-500/10",
          sign: "+",
          desc: "用户历史累计上分总额",
        },
        {
          label: "平台总下分（提现）",
          value: data.totalWithdrawals,
          icon: <TrendingDown className="w-5 h-5" />,
          color: "text-red-400",
          bg: "bg-red-500/10",
          sign: "-",
          desc: "用户历史累计提现总额",
        },
        {
          label: "平台净流入",
          value: data.platformNetCash,
          icon: <Coins className="w-5 h-5" />,
          color: data.platformNetCash >= 0 ? "text-green-500" : "text-red-400",
          bg: data.platformNetCash >= 0 ? "bg-green-500/10" : "bg-red-500/10",
          sign: data.platformNetCash >= 0 ? "+" : "",
          desc: "总上分 − 总下分",
        },
        {
          label: "游戏抽水累计",
          value: data.pumpCollected,
          icon: <BarChart2 className="w-5 h-5" />,
          color: data.pumpCollected >= 0 ? "text-amber-400" : "text-red-400",
          bg: "bg-amber-500/10",
          sign: data.pumpCollected >= 0 ? "+" : "",
          desc: "净流入 − 用户当前总持有 = 平台游戏抽水",
        },
        {
          label: "用户当前总持有",
          value: data.totalUserBalances,
          icon: <Wallet className="w-5 h-5" />,
          color: "text-blue-400",
          bg: "bg-blue-500/10",
          sign: "",
          desc: "当前所有用户账户余额之和（平台负债）",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            平台财务概览
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">仅 @DONG798 可见</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-refresh-stats"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {/* Date filter row */}
      <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          游戏抽水期间筛选
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">开始日期</Label>
            <Input data-testid="input-stats-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-background text-sm h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">结束日期</Label>
            <Input data-testid="input-stats-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-background text-sm h-9" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" data-testid="button-apply-stats-filter" onClick={applyFilter} disabled={isFetching} className="gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" />
            查询
          </Button>
          {(appliedFrom || appliedTo) && (
            <Button size="sm" variant="outline" data-testid="button-clear-stats-filter" onClick={clearFilter}>
              清除筛选
            </Button>
          )}
        </div>
        {(appliedFrom || appliedTo) && (
          <p className="text-xs text-muted-foreground">
            当前查询：{appliedFrom || "最早"} 至 {appliedTo || "最新"}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Period pump — only shown when date filter active */}
          {data.hasDateFilter && (
            <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <span className="font-medium">期间游戏抽水</span>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto">
                  {appliedFrom || "最早"} ~ {appliedTo || "最新"}
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-primary">
                +{fmt(data.periodPump)}
              </p>
              <p className="text-xs text-muted-foreground">
                期间共 {data.periodRounds} 轮 · {data.periodBets} 笔下注 · 抽水按实际出庄率计算
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {cards.map((card) => (
              <div
                key={card.label}
                data-testid={`stat-${card.label}`}
                className="bg-card border border-card-border rounded-xl p-5 space-y-2"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className={`w-8 h-8 rounded-lg ${card.bg} ${card.color} flex items-center justify-center shrink-0`}>
                    {card.icon}
                  </div>
                  <span className="font-medium">{card.label}</span>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${card.color}`}>
                  {card.sign}{fmt(card.value)}
                </p>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8 text-sm">加载失败，请刷新重试</div>
      )}
    </div>
  );
}
