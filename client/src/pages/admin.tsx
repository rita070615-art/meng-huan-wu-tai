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
import {
  Plus, Trash2, Edit2, Play, Square, Coins, Users,
  Settings, MessageSquare, ChevronRight, Check, X, Ban, ShieldCheck, Bot, ToggleLeft, ToggleRight, Link, Gamepad2
} from "lucide-react";
import type { Room, BetRound, BetOption, BotSettings } from "@shared/schema";

type AdminUser = { id: string; username: string; nickname: string | null; balance: number; role: string; notes: string; banned: boolean; isShill: boolean };
type RoomWithBet = Room & { hasActiveBet: boolean };
type BetRoundWithBets = BetRound & { bets: any[]; options: BetOption[] };

export default function AdminPage() {
  const { isAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (!isLoading && !isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title="管理后台" showBack />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Tabs defaultValue="rooms">
          <TabsList className="mb-6 w-full sm:w-auto">
            <TabsTrigger value="rooms" data-testid="tab-rooms" className="flex-1 sm:flex-none">
              <MessageSquare className="w-4 h-4 mr-1.5" />
              游戏厅管理
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users" className="flex-1 sm:flex-none">
              <Users className="w-4 h-4 mr-1.5" />
              用户管理
            </TabsTrigger>
            <TabsTrigger value="bot" data-testid="tab-bot" className="flex-1 sm:flex-none">
              <Bot className="w-4 h-4 mr-1.5" />
              托管设置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rooms">
            <RoomsAdmin />
          </TabsContent>
          <TabsContent value="users">
            <UsersAdmin />
          </TabsContent>
          <TabsContent value="bot">
            <BotAdmin />
          </TabsContent>
        </Tabs>
      </main>
    </div>
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
      toast({ title: "游戏厅创建成功！" });
    },
    onError: (e: Error) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rooms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "游戏厅已删除" });
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
          创建游戏厅
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
            {createRoomMutation.isPending ? "创建中..." : "创建游戏厅"}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          游戏厅列表
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
                        投注中
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
                    <GameUrlManager room={room} />
                    <BetRoundManager roomId={room.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-8 text-center text-muted-foreground text-sm">
            暂无游戏厅，请先创建
          </div>
        )}
      </div>
    </div>
  );
}

function GameUrlManager({ room }: { room: RoomWithBet }) {
  const { toast } = useToast();
  const [url, setUrl] = useState(room.gameUrl || "");
  const [editing, setEditing] = useState(false);

  const saveUrlMutation = useMutation({
    mutationFn: (gameUrl: string) =>
      apiRequest("PATCH", `/api/admin/rooms/${room.id}/game-url`, { gameUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${room.id}`] });
      setEditing(false);
      toast({ title: "游戏链接已保存" });
    },
    onError: (e: Error) => toast({ title: "保存失败", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gamepad2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">AG Gaming 游戏链接</h3>
        {room.gameUrl && (
          <span className="text-xs text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            已配置
          </span>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Input
            data-testid={`input-game-url-${room.id}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="输入 AG Gaming 游戏 iframe 地址..."
            className="bg-background text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              data-testid={`button-save-game-url-${room.id}`}
              onClick={() => saveUrlMutation.mutate(url)}
              disabled={saveUrlMutation.isPending}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setUrl(room.gameUrl || ""); setEditing(false); }}>
              取消
            </Button>
            {url && (
              <Button
                size="sm"
                variant="outline"
                className="hover:border-destructive hover:text-destructive ml-auto"
                onClick={() => { setUrl(""); saveUrlMutation.mutate(""); }}
                disabled={saveUrlMutation.isPending}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                移除
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => setEditing(true)}
        >
          {room.gameUrl ? (
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-muted/40 rounded-md px-3 py-2">
              <Link className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground truncate flex-1">{room.gameUrl}</span>
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-xs border border-dashed border-border rounded-md px-3 py-1.5 group-hover:border-primary/50 group-hover:text-primary transition-colors w-full">
              <Link className="w-3 h-3" />
              点击配置 AG Gaming 游戏链接...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BetRoundManager({ roomId }: { roomId: string }) {
  const { toast } = useToast();
  const [options, setOptions] = useState<BetOption[]>([
    { key: "A", label: "A", color: "#f97316" },
    { key: "B", label: "B", color: "#6366f1" },
    { key: "C", label: "C", color: "#10b981" },
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
    onSuccess: () => { refetch(); toast({ title: "投注已开启！" }); },
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
    onSuccess: () => { refetch(); toast({ title: "投注已结束，奖励已发放！" }); },
    onError: (e: Error) => toast({ title: "结束失败", description: e.message, variant: "destructive" }),
  });

  const COLORS = ["#f97316", "#6366f1", "#10b981", "#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899"];

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
      <div className="bg-background border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">投注选项配置</h4>
          {betRound && !editingOptions && (
            <button
              data-testid="button-edit-options"
              onClick={handleEditingToggle}
              className="text-xs text-primary flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" />
              编辑选项
            </button>
          )}
        </div>

        {(!betRound || editingOptions) ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {betRound ? "修改进行中的投注选项：" : "自定义下注选项（可添加、删除、重命名）："}
            </p>

            {options.map((opt, i) => (
              <div key={opt.key} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
                <Input
                  data-testid={`input-option-label-${opt.key}`}
                  value={opt.label}
                  onChange={(e) => updateLabel(opt.key, e.target.value)}
                  placeholder="选项名称"
                  className="flex-1 h-8 text-sm"
                />
                <button
                  data-testid={`button-remove-option-${opt.key}`}
                  onClick={() => removeOption(opt.key)}
                  disabled={options.length <= 2}
                  className="text-muted-foreground disabled:opacity-30 transition-opacity shrink-0"
                  title="删除此选项"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <div className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center bg-muted">
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <Input
                data-testid="input-new-option-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addOption()}
                placeholder="输入新选项名称，按 Enter 或点击添加"
                className="flex-1 h-8 text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                data-testid="button-add-option"
                onClick={addOption}
                disabled={!newLabel.trim()}
                className="shrink-0 h-8 px-2"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            {betRound ? (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  data-testid="button-save-options"
                  onClick={saveActiveOptions}
                  disabled={updateOptionsMutation.isPending || options.length < 2}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  保存更改
                </Button>
                <Button size="sm" variant="outline" onClick={handleEditingToggle}>
                  取消
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {activeOptions.map((opt, i) => (
              <div
                key={opt.key}
                className="flex items-center gap-1.5 bg-muted rounded-md px-2.5 py-1"
                data-testid={`option-badge-${opt.key}`}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!betRound ? (
        <Button
          size="sm"
          data-testid="button-start-bet"
          onClick={() => startBetMutation.mutate()}
          disabled={startBetMutation.isPending || options.length < 2}
          className="w-full"
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          {startBetMutation.isPending ? "开启中..." : `开启投注（${options.length} 个选项）`}
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
  const { toast } = useToast();
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateBalanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: string; balance: number }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/balance`, { balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingBalance(null);
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

  return (
    <div>
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" />
        用户列表
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : users && users.length > 0 ? (
        <div className="space-y-2">
          {users.map((u) => (
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
                    @{u.username} · {u.role === "admin" ? "管理员" : "普通用户"}
                  </p>
                </div>

                {editingBalance === u.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      data-testid={`input-balance-${u.id}`}
                      type="number"
                      min={0}
                      value={editBalance}
                      onChange={(e) => setEditBalance(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") updateBalanceMutation.mutate({ id: u.id, balance: parseInt(editBalance) });
                        if (e.key === "Escape") setEditingBalance(null);
                      }}
                      className="w-28 h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="default"
                      data-testid={`button-save-balance-${u.id}`}
                      onClick={() => updateBalanceMutation.mutate({ id: u.id, balance: parseInt(editBalance) })}
                      disabled={updateBalanceMutation.isPending}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingBalance(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-sm font-semibold flex items-center gap-1"
                      data-testid={`text-user-balance-${u.id}`}
                    >
                      <Coins className="w-3.5 h-3.5 text-yellow-500" />
                      {u.balance.toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-edit-balance-${u.id}`}
                      onClick={() => { setEditingBalance(u.id); setEditBalance(String(u.balance)); }}
                      title="修改余额"
                    >
                      <Coins className="w-3.5 h-3.5" />
                    </Button>
                    {u.role !== "admin" && (
                      <Button
                        size="sm"
                        data-testid={`button-shill-${u.id}`}
                        onClick={() => shillMutation.mutate({ id: u.id, isShill: !u.isShill })}
                        disabled={shillMutation.isPending}
                        title={u.isShill ? "点击关闭（当前托·开启）" : "点击开启托身份"}
                        className={u.isShill
                          ? "bg-green-500/20 border border-green-500 text-green-400 hover:bg-green-500/30"
                          : "bg-transparent border border-border text-muted-foreground hover:border-green-500/60 hover:text-green-400"
                        }
                      >
                        <Bot className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {u.role !== "admin" && (
                      <Button
                        size="sm"
                        variant={u.banned ? "secondary" : "outline"}
                        data-testid={`button-ban-${u.id}`}
                        onClick={() => banMutation.mutate({ id: u.id, banned: !u.banned })}
                        disabled={banMutation.isPending}
                        title={u.banned ? "解除封禁" : "封禁账号"}
                        className={u.banned ? "" : "hover:border-destructive hover:text-destructive"}
                      >
                        {u.banned ? <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> : <Ban className="w-3.5 h-3.5" />}
                      </Button>
                    )}
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
          暂无用户
        </div>
      )}
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

  const shills = users?.filter((u) => u.isShill) ?? [];

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
                  开启后，投注轮开始时托账号将自动随机下注
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Coins className="w-3 h-3 text-yellow-500" />
                    {u.balance.toLocaleString()} 积分
                  </p>
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
    </div>
  );
}
