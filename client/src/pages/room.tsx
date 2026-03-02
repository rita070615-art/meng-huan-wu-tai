import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Send, Coins, TrendingUp, Lock, Trophy, Trash2, MicOff, Ban, Settings, Play, ChevronDown, ChevronUp, ShieldAlert, LayoutDashboard } from "lucide-react";
import { Link } from "wouter";
import type { Message, Bet, BetRound, BetOption, Room } from "@shared/schema";

type BetRoundWithBets = BetRound & { bets: Bet[]; options: BetOption[] };

export default function RoomPage() {
  const [, params] = useRoute("/room/:id");
  const roomId = params?.id || "";
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [messageText, setMessageText] = useState("");
  const [betAmount, setBetAmount] = useState("100");
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [liveBets, setLiveBets] = useState<Bet[]>([]);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [liveRound, setLiveRound] = useState<BetRoundWithBets | null | undefined>(undefined);
  const [chatMuted, setChatMuted] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [pendingWinner, setPendingWinner] = useState<string | null>(null);
  const [pendingBet, setPendingBet] = useState<{ option: string; amount: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: room } = useQuery<Room>({ queryKey: [`/api/rooms/${roomId}`], enabled: !!roomId });
  const { data: messages, isLoading: msgsLoading, error: msgsError } = useQuery<Message[]>({
    queryKey: [`/api/rooms/${roomId}/messages`],
    enabled: !!roomId,
  });

  useEffect(() => {
    if (msgsError && (msgsError as Error).message === "需要输入密码") {
      toast({ title: "需要密码", description: "请从大厅输入房间密码后进入", variant: "destructive" });
      setLocation("/");
    }
  }, [msgsError]);

  const { data: betRoundData } = useQuery<BetRoundWithBets | null>({
    queryKey: [`/api/rooms/${roomId}/bet-round`],
    enabled: !!roomId,
    refetchInterval: 15000,
  });
  const { data: roomBetsData } = useQuery<Bet[]>({
    queryKey: [`/api/rooms/${roomId}/bets`],
    enabled: !!roomId,
  });

  useEffect(() => {
    if (messages) setLiveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (room) setChatMuted(!!(room as any).chatMuted);
  }, [room]);

  useEffect(() => {
    if (betRoundData !== undefined) {
      setLiveRound(betRoundData);
      if (betRoundData?.bets) setLiveBets(betRoundData.bets);
    }
  }, [betRoundData]);

  useEffect(() => {
    if (roomBetsData) setLiveBets(roomBetsData);
  }, [roomBetsData]);

  useEffect(() => {
    if (!roomId || !user) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/ws?roomId=${roomId}&userId=${user.id}&username=${encodeURIComponent(user.username)}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "MESSAGE" && data.message) {
          setLiveMessages((prev) => [...prev, data.message]);
        }
        if (data.type === "MESSAGE_DELETED" && data.messageId) {
          setLiveMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        }
        if (data.type === "MESSAGES_CLEARED") {
          setLiveMessages([]);
        }
        if (data.type === "NEW_BET" && data.bet) {
          setLiveBets((prev) => [data.bet, ...prev].slice(0, 50));
        }
        if (data.type === "BET_ROUND_STARTED") {
          setLiveRound({ ...data.round, bets: [] });
          setLiveBets([]);
          if (data.message) setLiveMessages((prev) => [...prev, data.message]);
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }
        if (data.type === "BET_ROUND_CLOSED") {
          setLiveRound(null);
          setPendingWinner(null);
          if (data.message) setLiveMessages((prev) => [...prev, data.message]);
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }
        if (data.type === "BET_OPTIONS_UPDATED" && data.round) {
          setLiveRound((prev) => prev ? { ...prev, options: data.round.options } : null);
        }
        if (data.type === "ROOM_CHAT_MUTED") {
          setChatMuted(data.chatMuted);
        }
      } catch {}
    };

    return () => ws.close();
  }, [roomId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveMessages]);

  const { isAdmin } = useAuth();

  const sendMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", `/api/rooms/${roomId}/messages`, { content }),
    onSuccess: () => setMessageText(""),
    onError: (e: Error) => toast({ title: "发送失败", description: e.message, variant: "destructive" }),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => apiRequest("DELETE", `/api/rooms/${roomId}/messages/${messageId}`),
    onError: (e: Error) => toast({ title: "删除失败", description: e.message, variant: "destructive" }),
  });

  const betMutation = useMutation({
    mutationFn: (data: { option: string; amount: number }) =>
      apiRequest("POST", `/api/rooms/${roomId}/bets`, data),
    onSuccess: () => {
      toast({ title: "点餐成功！" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
    },
    onError: (e: Error) => toast({ title: "点餐失败", description: e.message, variant: "destructive" }),
  });

  const muteChatMutation = useMutation({
    mutationFn: (muted: boolean) => apiRequest("PATCH", `/api/admin/rooms/${roomId}/chat-mute`, { chatMuted: muted }),
    onSuccess: (_, muted) => toast({ title: muted ? "聊天室已全体禁言" : "已解除全体禁言" }),
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const startRoundMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rooms/${roomId}/bet-round`, {}),
    onError: (e: Error) => toast({ title: "开始失败", description: e.message, variant: "destructive" }),
  });

  const closeRoundMutation = useMutation({
    mutationFn: (winnerOption: string) => apiRequest("POST", `/api/rooms/${roomId}/bet-round/close`, { winnerOption }),
    onError: (e: Error) => toast({ title: "结束失败", description: e.message, variant: "destructive" }),
  });

  const muteUserMutation = useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/mute`, { muted }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: v.muted ? "已禁言该用户" : "已解除禁言" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const banUserMutation = useMutation({
    mutationFn: ({ id, banned }: { id: string; banned: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/ban`, { banned }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: v.banned ? "已封禁该用户" : "已解封该用户" });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    sendMutation.mutate(messageText.trim());
  };

  const handleBet = () => {
    if (!selectedOption) return toast({ title: "请选择菜单选项", variant: "destructive" });
    const amt = parseInt(betAmount);
    if (!amt || amt < 1) return toast({ title: "请输入有效金额", variant: "destructive" });
    setPendingBet({ option: selectedOption, amount: amt });
  };

  const confirmBet = () => {
    if (!pendingBet) return;
    betMutation.mutate(pendingBet, { onSettled: () => setPendingBet(null) });
  };

  const currentRound = liveRound !== undefined ? liveRound : betRoundData;
  const options: BetOption[] = (currentRound?.options as BetOption[]) || [];
  const displayBets = liveBets.length > 0 ? liveBets : (roomBetsData || []);
  const displayMessages = liveMessages.length > 0 ? liveMessages : (messages || []);

  const userAlreadyBet = currentRound
    ? displayBets.some((b) => b.roundId === currentRound.id && b.userId === user?.id)
    : false;

  const totalPool = displayBets
    .filter((b) => currentRound && b.roundId === currentRound.id)
    .reduce((s, b) => s + b.amount, 0);

  const optionTotals = options.reduce((acc, opt) => {
    acc[opt.key] = displayBets
      .filter((b) => currentRound && b.roundId === currentRound.id && b.option === opt.key)
      .reduce((s, b) => s + b.amount, 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header showBack title={room?.name} />

      {isAdmin && (
        <div className="border-b border-border bg-primary/5">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-primary">管理控制台</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                size="sm"
                variant={chatMuted ? "destructive" : "outline"}
                className="h-6 px-2 text-xs"
                data-testid="button-admin-chat-mute"
                disabled={muteChatMutation.isPending}
                onClick={() => muteChatMutation.mutate(!chatMuted)}
              >
                <MicOff className="w-3 h-3 mr-1" />
                {chatMuted ? "解除禁言" : "全体禁言"}
              </Button>
              {currentRound ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs hover:border-amber-500 hover:text-amber-500"
                  data-testid="button-admin-toggle-panel"
                  onClick={() => setAdminPanelOpen(v => !v)}
                >
                  <Settings className="w-3 h-3 mr-1" />
                  {adminPanelOpen ? "收起" : "点餐设置"}
                  {adminPanelOpen ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs hover:border-green-500 hover:text-green-500"
                  data-testid="button-admin-start-round"
                  disabled={startRoundMutation.isPending}
                  onClick={() => startRoundMutation.mutate()}
                >
                  <Play className="w-3 h-3 mr-1" />
                  开启点餐
                </Button>
              )}
              <Link href="/admin">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" data-testid="button-admin-panel-link">
                  <LayoutDashboard className="w-3 h-3 mr-1" />
                  后台
                </Button>
              </Link>
            </div>
          </div>
          {isAdmin && adminPanelOpen && currentRound && (
            <div className="px-3 pb-2 border-t border-border/50">
              {!pendingWinner ? (
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <span className="text-xs text-muted-foreground">选择获胜选项（第一步）：</span>
                  {(currentRound.options as BetOption[]).map((opt) => (
                    <Button
                      key={opt.key}
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      style={{ borderColor: opt.color, color: opt.color }}
                      onClick={() => setPendingWinner(opt.key)}
                      data-testid={`button-admin-select-winner-${opt.key}`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  {(() => {
                    const winOpt = (currentRound.options as BetOption[]).find(o => o.key === pendingWinner);
                    return (
                      <>
                        <span className="text-xs font-semibold" style={{ color: winOpt?.color }}>
                          确认开奖：{winOpt?.label} 获胜？
                        </span>
                        <Button
                          size="sm"
                          className="h-6 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={closeRoundMutation.isPending}
                          onClick={() => {
                            closeRoundMutation.mutate(pendingWinner);
                            setPendingWinner(null);
                            setAdminPanelOpen(false);
                          }}
                          data-testid="button-admin-confirm-winner"
                        >
                          ✓ 确认开奖
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-muted-foreground"
                          onClick={() => setPendingWinner(null)}
                          data-testid="button-admin-cancel-winner"
                        >
                          取消
                        </Button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex overflow-hidden flex-1">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {chatMuted && !isAdmin && (
            <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 text-center flex items-center justify-center gap-1.5">
              <MicOff className="w-3.5 h-3.5" />
              管理员已开启全体禁言
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="chat-messages">
            {msgsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : (
              displayMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  msg={msg}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  onDelete={isAdmin ? (id) => deleteMessageMutation.mutate(id) : undefined}
                  onMuteUser={isAdmin ? (id) => muteUserMutation.mutate({ id, muted: true }) : undefined}
                  onBanUser={isAdmin ? (id) => banUserMutation.mutate({ id, banned: true }) : undefined}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Admin: chat input */}
          {isAdmin && (
            <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2">
              <Input
                data-testid="input-message"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="输入消息..."
                className="flex-1 bg-card border-card-border"
                autoComplete="off"
              />
              <Button
                type="submit"
                size="icon"
                data-testid="button-send"
                disabled={sendMutation.isPending || !messageText.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          )}

          {/* Non-admin: betting panel in chat when round active */}
          {!isAdmin && currentRound && (
            <div className="border-t border-border p-3 space-y-2.5 bg-card/40">
              {pendingBet ? (
                <div className="rounded-md border-2 border-primary/50 bg-primary/5 p-3 space-y-2">
                  <p className="text-sm font-medium text-center">确认您的点餐？</p>
                  <div className="flex items-center justify-center gap-3 text-sm">
                    <span className="font-bold" style={{ color: options.find(o => o.key === pendingBet.option)?.color }}>
                      {options.find(o => o.key === pendingBet.option)?.label}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="font-semibold">{pendingBet.amount.toLocaleString()} 分</span>
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      data-testid="button-cancel-bet"
                      onClick={() => setPendingBet(null)}
                      disabled={betMutation.isPending}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-confirm-bet"
                      onClick={confirmBet}
                      disabled={betMutation.isPending}
                    >
                      {betMutation.isPending ? "提交中..." : "✓ 确认点餐"}
                    </Button>
                  </div>
                </div>
              ) : userAlreadyBet ? (
                <div className="text-center text-xs text-muted-foreground py-2 flex items-center justify-center gap-1.5">
                  <span className="text-green-500">✓</span> 已完成点餐，等待结果
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, 1fr)` }}
                  >
                    {options.map((opt) => {
                      const total = optionTotals[opt.key] || 0;
                      const pct = totalPool > 0 ? Math.round((total / totalPool) * 100) : 0;
                      return (
                        <button
                          key={opt.key}
                          data-testid={`button-bet-option-${opt.key}`}
                          onClick={() => setSelectedOption(opt.key)}
                          className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-md border-2 transition-all cursor-pointer ${
                            selectedOption === opt.key
                              ? "border-primary bg-primary/15"
                              : "border-border bg-background/60"
                          }`}
                        >
                          <span className="text-base font-bold" style={{ color: opt.color }}>{opt.label}</span>
                          <span className="text-xs text-muted-foreground mt-0.5">{pct}%</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Coins className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        data-testid="input-bet-amount"
                        type="number"
                        min={1}
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        className="pl-8 bg-background border-border text-sm h-9"
                      />
                    </div>
                    <Button
                      data-testid="button-place-bet"
                      onClick={handleBet}
                      disabled={betMutation.isPending || !selectedOption}
                      size="sm"
                      className="h-9 px-4 shrink-0"
                    >
                      点餐
                    </Button>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[50, 100, 500, 1000].map((v) => (
                      <button
                        key={v}
                        data-testid={`button-quick-bet-${v}`}
                        onClick={() => setBetAmount(String(v))}
                        className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar: live bets (desktop only) */}
        <div className="hidden md:flex md:w-72 flex-shrink-0 flex-col overflow-hidden bg-card/30">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">菜单状态</h3>
            </div>
            {currentRound ? (
              <Badge variant="default" className="text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground mr-1 animate-pulse inline-block" />
                进行中
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <Lock className="w-2.5 h-2.5 mr-1" />
                未开放
              </Badge>
            )}
          </div>

          {currentRound && totalPool > 0 && (
            <div className="px-4 py-2 border-b border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>总奖池</span>
                <span className="font-semibold flex items-center gap-1">
                  <Coins className="w-3 h-3 text-yellow-500" />
                  {totalPool.toLocaleString()}
                </span>
              </div>
              {options.length > 0 && (
                <div className="mt-2 space-y-1">
                  {options.map(opt => {
                    const total = optionTotals[opt.key] || 0;
                    const pct = totalPool > 0 ? Math.round((total / totalPool) * 100) : 0;
                    return (
                      <div key={opt.key} className="flex items-center gap-2 text-xs">
                        <span className="w-12 font-medium truncate" style={{ color: opt.color }}>{opt.label}</span>
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: opt.color }} />
                        </div>
                        <span className="text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                实时点餐记录
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto" data-testid="live-action-feed">
              {displayBets.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">暂无点餐记录</div>
              ) : (
                displayBets.map((bet) => {
                  const opt = options.find((o) => o.key === bet.option);
                  const COLOR_MAP: Record<string, string> = { A: "#f97316", B: "#6366f1", C: "#10b981" };
                  const color = opt?.color || COLOR_MAP[bet.option] || "#6366f1";
                  return (
                    <div
                      key={bet.id}
                      data-testid={`bet-item-${bet.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50"
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {opt?.label?.[0] || bet.option}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{bet.nickname || "匿名用户"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(bet.createdAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold flex items-center gap-1 shrink-0">
                        <Coins className="w-3.5 h-3.5 text-yellow-500" />
                        {bet.amount.toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  msg,
  currentUserId,
  isAdmin,
  onDelete,
  onMuteUser,
  onBanUser,
}: {
  msg: Message;
  currentUserId?: string;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  onMuteUser?: (userId: string) => void;
  onBanUser?: (userId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSystem = msg.type === "system";
  const isOwn = msg.userId === currentUserId;

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  if (isSystem) {
    const lines = msg.content.split("\n");
    return (
      <div className="flex flex-col items-start">
        <span className="text-xs text-muted-foreground mb-0.5 ml-1">系统</span>
        <div className="bg-muted/70 border border-border/50 px-3 py-2 rounded-lg rounded-bl-sm text-sm text-foreground max-w-xs lg:max-w-sm">
          {lines.map((line, i) => (
            <span key={i}>
              {line}
              {i < lines.length - 1 && <br />}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      {!isOwn && (
        <div className="relative">
          <button
            className="text-xs text-muted-foreground mb-0.5 ml-1 hover:text-foreground transition-colors"
            onClick={() => isAdmin && setShowMenu(v => !v)}
            data-testid={`username-${msg.userId}`}
          >
            {msg.username}
            {isAdmin && <span className="ml-0.5 opacity-40">▾</span>}
          </button>
          {showMenu && isAdmin && msg.userId && (
            <div
              ref={menuRef}
              className="absolute left-0 top-5 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-amber-500"
                onClick={() => { onMuteUser?.(msg.userId!); setShowMenu(false); }}
                data-testid={`menu-mute-${msg.userId}`}
              >
                <MicOff className="w-3 h-3" /> 禁言
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-destructive"
                onClick={() => { onBanUser?.(msg.userId!); setShowMenu(false); }}
                data-testid={`menu-ban-${msg.userId}`}
              >
                <Ban className="w-3 h-3" /> 封号
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-muted-foreground"
                onClick={() => { onDelete?.(msg.id); setShowMenu(false); }}
                data-testid={`menu-delete-${msg.id}`}
              >
                <Trash2 className="w-3 h-3" /> 删除消息
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {isAdmin && isOwn && (
          <button
            data-testid={`button-delete-message-${msg.id}`}
            onClick={() => onDelete?.(msg.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 mb-1"
            title="删除消息"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <div
          data-testid={`message-${msg.id}`}
          className={`max-w-xs lg:max-w-sm px-3 py-2 rounded-lg text-sm leading-relaxed ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card border border-card-border rounded-bl-sm"
          }`}
        >
          {msg.content}
        </div>
        {isAdmin && !isOwn && (
          <button
            data-testid={`button-delete-message-${msg.id}`}
            onClick={() => onDelete?.(msg.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 mb-1"
            title="删除消息"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
