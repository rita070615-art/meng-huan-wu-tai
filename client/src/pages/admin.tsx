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
  Settings, MessageSquare, ChevronRight, Check, X
} from "lucide-react";
import type { Room, BetRound, BetOption } from "@shared/schema";

type AdminUser = { id: string; username: string; balance: number; role: string };
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
          <TabsList className="mb-6">
            <TabsTrigger value="rooms" data-testid="tab-rooms">
              <MessageSquare className="w-4 h-4 mr-1.5" />
              游戏厅管理
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="w-4 h-4 mr-1.5" />
              用户管理
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rooms">
            <RoomsAdmin />
          </TabsContent>
          <TabsContent value="users">
            <UsersAdmin />
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
                  <div className="mt-1 ml-4 border-l-2 border-primary/30 pl-4">
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

function BetRoundManager({ roomId }: { roomId: string }) {
  const { toast } = useToast();
  const [options, setOptions] = useState<BetOption[]>([
    { key: "A", label: "A", color: "#f97316" },
    { key: "B", label: "B", color: "#6366f1" },
    { key: "C", label: "C", color: "#10b981" },
  ]);
  const [editingOptions, setEditingOptions] = useState(false);

  const { data: betRound, refetch } = useQuery<BetRoundWithBets | null>({
    queryKey: [`/api/rooms/${roomId}/bet-round`],
    refetchInterval: 10000,
  });

  const startBetMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rooms/${roomId}/bet-round`, { options }),
    onSuccess: () => {
      refetch();
      toast({ title: "投注已开启！" });
    },
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
    onSuccess: () => {
      refetch();
      toast({ title: "投注已结束，奖励已发放！" });
    },
    onError: (e: Error) => toast({ title: "结束失败", description: e.message, variant: "destructive" }),
  });

  const currentOptions = (betRound?.options as BetOption[]) || options;

  const updateOptionLabel = (key: string, label: string) => {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, label } : o)));
  };

  const COLORS = ["#f97316", "#6366f1", "#10b981", "#ef4444", "#f59e0b", "#3b82f6"];

  return (
    <div className="py-3 space-y-3">
      <div className="bg-background border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">投注选项配置</h4>
          {betRound && (
            <button
              data-testid="button-edit-options"
              onClick={() => setEditingOptions(!editingOptions)}
              className="text-xs text-primary flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" />
              {editingOptions ? "取消" : "编辑选项"}
            </button>
          )}
        </div>

        {editingOptions && betRound ? (
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={opt.key} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <Input
                  data-testid={`input-option-label-${opt.key}`}
                  value={opt.label}
                  onChange={(e) => updateOptionLabel(opt.key, e.target.value)}
                  placeholder={`选项 ${opt.key}`}
                  className="flex-1 h-8 text-sm"
                />
              </div>
            ))}
            <Button
              size="sm"
              data-testid="button-save-options"
              onClick={() => updateOptionsMutation.mutate(options.map((o, i) => ({ ...o, color: COLORS[i % COLORS.length] })))}
              disabled={updateOptionsMutation.isPending}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              保存选项
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {(betRound ? currentOptions : options).map((opt, i) => (
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

        {!betRound && (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">开启投注前可自定义选项标签：</p>
            {options.map((opt, i) => (
              <div key={opt.key} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <Input
                  data-testid={`input-new-option-${opt.key}`}
                  value={opt.label}
                  onChange={(e) => updateOptionLabel(opt.key, e.target.value)}
                  placeholder={`选项 ${opt.key}`}
                  className="flex-1 h-8 text-sm"
                />
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
          disabled={startBetMutation.isPending}
          className="w-full"
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          {startBetMutation.isPending ? "开启中..." : "开启投注"}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">选择获胜选项并结束本轮：</p>
          <div className="flex flex-wrap gap-2">
            {currentOptions.map((opt, i) => (
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
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState("");

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateBalanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: string; balance: number }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/balance`, { balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "余额已更新" });
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : users && users.length > 0 ? (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              data-testid={`admin-user-${u.id}`}
              className="bg-card border border-card-border rounded-lg p-4 flex items-center gap-4"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {u.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{u.username}</p>
                <p className="text-xs text-muted-foreground">
                  {u.role === "admin" ? "管理员" : "普通用户"}
                </p>
              </div>

              {editingUser === u.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    data-testid={`input-balance-${u.id}`}
                    type="number"
                    min={0}
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingUser(null)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
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
                    onClick={() => {
                      setEditingUser(u.id);
                      setEditBalance(String(u.balance));
                    }}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
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
