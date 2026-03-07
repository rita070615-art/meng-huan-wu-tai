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
import { Send, Coins, Trash2, MicOff, Ban, Settings, Play, Pause, ChevronDown, ChevronUp, ShieldAlert, LayoutDashboard, TrendingUp, Trophy, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import type { Message, Bet, BetRound, BetOption, Room } from "@shared/schema";

type BetRoundWithBets = BetRound & { bets: Bet[]; options: BetOption[] };

export default function RoomPage() {
  const [, params] = useRoute("/room/:id");
  const roomId = params?.id || "";
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [messageText, setMessageText] = useState("");
  const [betAmount, setBetAmount] = useState("100");
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [liveBets, setLiveBets] = useState<Bet[]>([]);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [liveRound, setLiveRound] = useState<BetRoundWithBets | null | undefined>(undefined);
  const [chatMuted, setChatMuted] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [optionPoints, setOptionPoints] = useState<Record<string, string>>({});
  const [pendingBet, setPendingBet] = useState<{ option: string; amount: number } | null>(null);
  const [bankerUserId, setBankerUserId] = useState("");
  const [bankerOption, setBankerOption] = useState("");
  const [bankerMaxBet, setBankerMaxBet] = useState("");
  const [carryOver, setCarryOver] = useState("");
  const [pumpRate, setPumpRate] = useState("");
  const [playerPumpRate, setPlayerPumpRate] = useState("");
  const [optionRatios, setOptionRatios] = useState<Record<string, string>>({ A: "", B: "", C: "", D: "" });
  const [cancelRoundConfirm, setCancelRoundConfirm] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsDestroyedRef = useRef(false);

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

  const { data: adminUsers, refetch: refetchAdminUsers } = useQuery<Array<{ id: string; username: string; nickname: string | null; balance: number; muted: boolean; isShill: boolean }>>({
    queryKey: ["/api/admin/users"],
    enabled: !!isAdmin,
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: onlineUsers, refetch: refetchOnlineUsers } = useQuery<Array<{ id: string; username: string; nickname: string | null; balance: number }>>({
    queryKey: [`/api/rooms/${roomId}/online-users`],
    enabled: !!isAdmin && !!roomId,
    refetchInterval: 20000,
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
    wsDestroyedRef.current = false;

    let retryDelay = 1000;

    const handleMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "MESSAGE" && data.message) {
          setLiveMessages((prev) => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
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
        if (data.type === "BETS_UPDATED" && data.bets) {
          setLiveBets(data.bets.slice(0, 50));
        }
        if (data.type === "BET_ROUND_STARTED") {
          setLiveRound({ ...data.round, bets: [] });
          setLiveBets([]);
          setSelectedOptions(new Set());
          setOptionPoints({});
          setDoubleMode(false);
          if (data.message) setLiveMessages((prev) => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }
        if (data.type === "BET_ROUND_CLOSED") {
          setLiveRound(null);
          setOptionPoints({});
          setSelectedOptions(new Set());
          setDoubleMode(false);
          if (data.message) setLiveMessages((prev) => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        }
        if (data.type === "BET_OPTIONS_UPDATED" && data.round) {
          setLiveRound((prev) => prev ? { ...prev, options: data.round.options } : null);
        }
        if (data.type === "BET_ROUND_PAUSED") {
          setLiveRound((prev) => prev ? { ...prev, status: "paused" } : null);
        }
        if (data.type === "BET_ROUND_RESUMED") {
          setLiveRound((prev) => prev ? { ...prev, status: "open" } : null);
        }
        if (data.type === "ROOM_CHAT_MUTED") {
          setChatMuted(data.chatMuted);
        }
      } catch {}
    };

    const connect = () => {
      if (wsDestroyedRef.current) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${proto}//${window.location.host}/ws?roomId=${roomId}&userId=${user.id}&username=${encodeURIComponent(user.username)}`
      );
      wsRef.current = ws;

      ws.onopen = () => { retryDelay = 1000; };
      ws.onmessage = handleMessage;
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (wsDestroyedRef.current) return;
        wsReconnectTimer.current = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.5, 10000);
          connect();
        }, retryDelay);
      };
    };

    connect();

    return () => {
      wsDestroyedRef.current = true;
      if (wsReconnectTimer.current) clearTimeout(wsReconnectTimer.current);
      wsRef.current?.close();
    };
  }, [roomId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveMessages]);

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

  const cancelBetMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/rooms/${roomId}/bets`),
    onSuccess: (data: any) => {
      toast({ title: "已取消点餐", description: `已退还 ${data.refund?.toLocaleString() ?? ""} 积分` });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
    },
    onError: (e: Error) => toast({ title: "取消失败", description: e.message, variant: "destructive" }),
  });

  const muteChatMutation = useMutation({
    mutationFn: (muted: boolean) => apiRequest("PATCH", `/api/admin/rooms/${roomId}/chat-mute`, { chatMuted: muted }),
    onSuccess: (_, muted) => toast({ title: muted ? "聊天室已全体禁言" : "已解除全体禁言" }),
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const startRoundMutation = useMutation({
    mutationFn: (params?: { bankerUserId?: string; bankerNickname?: string; bankerOption?: string; bankerMaxBet?: number; carryOver?: number; pumpRate?: number; playerPumpRate?: number; options?: object }) =>
      apiRequest("POST", `/api/rooms/${roomId}/bet-round`, params || {}),
    onSuccess: () => { setBankerUserId(""); setBankerOption(""); setBankerMaxBet(""); setCarryOver(""); },
    onError: (e: Error) => toast({ title: "开始失败", description: e.message, variant: "destructive" }),
  });

  const [doubleMode, setDoubleMode] = useState(false);

  const closeRoundMutation = useMutation({
    mutationFn: ({ optionPoints: pts, double: dbl }: { optionPoints: Record<string, number>; double: boolean }) =>
      apiRequest("POST", `/api/rooms/${roomId}/bet-round/close`, { optionPoints: pts, double: dbl }),
    onError: (e: Error) => toast({ title: "结束失败", description: e.message, variant: "destructive" }),
  });

  const pauseRoundMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rooms/${roomId}/bet-round/pause`, {}),
    onSuccess: (data: BetRound) => setLiveRound((prev) => prev ? { ...prev, status: "paused" } : null),
    onError: (e: Error) => toast({ title: "暂停失败", description: e.message, variant: "destructive" }),
  });

  const resumeRoundMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rooms/${roomId}/bet-round/resume`, {}),
    onSuccess: (data: BetRound) => setLiveRound((prev) => prev ? { ...prev, status: "open" } : null),
    onError: (e: Error) => toast({ title: "恢复失败", description: e.message, variant: "destructive" }),
  });

  const cancelRoundMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rooms/${roomId}/bet-round/cancel`, {}),
    onSuccess: () => {
      setLiveRound(null);
      setOptionPoints({});
      setDoubleMode(false);
      setCancelRoundConfirm(false);
      toast({ title: "点餐已取消，积分已退还" });
    },
    onError: (e: Error) => { setCancelRoundConfirm(false); toast({ title: "取消失败", description: e.message, variant: "destructive" }); },
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
    if (selectedOptions.size === 0) return toast({ title: "请选择菜单选项", variant: "destructive" });
    const amt = parseInt(betAmount);
    if (!amt || amt < 1) return toast({ title: "请输入有效金额", variant: "destructive" });
    if (selectedOptions.size === 1) {
      setPendingBet({ option: [...selectedOptions][0], amount: amt });
    } else {
      // Multi-option: submit all at once without confirmation dialog
      const keys = [...selectedOptions];
      const first = keys[0];
      betMutation.mutate({ option: first, amount: amt }, {
        onSuccess: () => {
          // Submit remaining bets sequentially
          const rest = keys.slice(1);
          const submitNext = (idx: number) => {
            if (idx >= rest.length) return;
            apiRequest("POST", `/api/rooms/${roomId}/bets`, { option: rest[idx], amount: amt })
              .then(() => submitNext(idx + 1))
              .catch(() => {});
          };
          submitNext(0);
          setSelectedOptions(new Set());
        },
      });
    }
  };

  const confirmBet = () => {
    if (!pendingBet) return;
    betMutation.mutate(pendingBet, { onSettled: () => { setPendingBet(null); setSelectedOptions(new Set()); } });
  };

  const currentRound = liveRound !== undefined ? liveRound : betRoundData;
  const options: BetOption[] = (currentRound?.options as BetOption[]) || [];
  const displayBets = liveBets.length > 0 ? liveBets : (roomBetsData || []);
  const displayMessages = liveMessages.length > 0 ? liveMessages : (messages || []);

  const userBetsInRound = currentRound
    ? displayBets.filter((b) => b.roundId === currentRound.id && b.userId === user?.id)
    : [];
  const userBetOptions = new Set(userBetsInRound.map(b => b.option));
  const banker = currentRound as any;
  const bankerOptionKey = banker?.bankerOption || "";
  const bankerName = banker?.bankerNickname || "";
  const bankerCap = banker?.bankerMaxBet || 0;
  const totalPool = displayBets
    .filter((b) => currentRound && b.roundId === currentRound.id)
    .reduce((s, b) => s + b.amount, 0);

  const optionTotals = options.reduce((acc, opt) => {
    acc[opt.key] = displayBets
      .filter((b) => currentRound && b.roundId === currentRound.id && b.option === opt.key)
      .reduce((s, b) => s + b.amount, 0);
    return acc;
  }, {} as Record<string, number>);

  // Balance map for admins: userId → balance
  const balanceMap = (adminUsers || []).reduce((acc, u) => {
    acc[u.id] = u.balance;
    return acc;
  }, {} as Record<string, number>);

  // Muted map for admins: userId → muted status
  const mutedMap = (adminUsers || []).reduce((acc, u) => {
    acc[u.id] = u.muted ?? false;
    return acc;
  }, {} as Record<string, boolean>);

  // All nicknames/usernames visible in room for @mention autocomplete
  const mentionableUsers = adminUsers || [];

  const handleMessageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessageText(val);
    const atIndex = val.lastIndexOf("@");
    if (atIndex >= 0 && (atIndex === 0 || val[atIndex - 1] === " ")) {
      setMentionQuery(val.slice(atIndex + 1).toLowerCase());
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (nick: string) => {
    const val = messageText;
    const atIndex = val.lastIndexOf("@");
    const newVal = val.slice(0, atIndex) + "@" + nick + " ";
    setMessageText(newVal);
    setMentionQuery(null);
    messageInputRef.current?.focus();
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header showBack title={room?.name} />

      {isAdmin && (
        <div className="border-b border-border bg-primary/5">
          {/* Admin top bar */}
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
              {currentRound && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="button-admin-pause-resume"
                    disabled={pauseRoundMutation.isPending || resumeRoundMutation.isPending}
                    className={`h-6 px-2 text-xs ${currentRound.status === "paused" ? "border-green-500 text-green-500 hover:bg-green-500/10" : "border-amber-500 text-amber-500 hover:bg-amber-500/10"}`}
                    onClick={() => currentRound.status === "paused" ? resumeRoundMutation.mutate() : pauseRoundMutation.mutate()}
                  >
                    {currentRound.status === "paused"
                      ? <><Play className="w-3 h-3 mr-1" />继续点餐</>
                      : <><Pause className="w-3 h-3 mr-1" />暂停点餐</>
                    }
                  </Button>
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
                </>
              )}
              <Link href="/admin">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" data-testid="button-admin-panel-link">
                  <LayoutDashboard className="w-3 h-3 mr-1" />
                  后台
                </Button>
              </Link>
            </div>
          </div>

          {/* Pre-round: banker setup always visible */}
          {isAdmin && !currentRound && (
            <div className="px-3 py-3 border-t border-border/50 bg-primary/3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-primary">开局设置（必须选主厨）</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    选主厨 <span className="text-red-500">*</span>
                    <button type="button" onClick={() => refetchOnlineUsers()} className="text-[10px] text-primary hover:underline">刷新</button>
                  </label>
                  <select
                    data-testid="select-banker-user"
                    value={bankerUserId}
                    onChange={e => { setBankerUserId(e.target.value); if (!e.target.value) { setBankerOption(""); setBankerMaxBet(""); setCarryOver(""); } }}
                    className="w-full min-w-0 mt-0.5 text-xs bg-background border border-border rounded px-2 py-1 text-foreground truncate"
                  >
                    <option value="">— 请选择主厨 —</option>
                    {(onlineUsers || []).map(u => (
                      <option key={u.id} value={u.id}>{u.nickname || u.username}（{u.balance.toLocaleString()}）</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground">主厨属性 <span className="text-red-500">*</span></label>
                  <select
                    data-testid="select-banker-option"
                    value={bankerOption}
                    onChange={e => setBankerOption(e.target.value)}
                    disabled={!bankerUserId}
                    className="w-full min-w-0 mt-0.5 text-xs bg-background border border-border rounded px-2 py-1 text-foreground disabled:opacity-50"
                  >
                    <option value="">选择属性</option>
                    {[{key:"B",label:"体力"},{key:"C",label:"法力"},{key:"A",label:"力量"},{key:"D",label:"耐力"}].map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground">主厨上限 <span className="text-red-500">*</span></label>
                  <Input
                    data-testid="input-banker-max-bet"
                    type="number"
                    min={1}
                    value={bankerMaxBet}
                    onChange={e => setBankerMaxBet(e.target.value)}
                    disabled={!bankerUserId}
                    placeholder="如 10000"
                    className="mt-0.5 h-7 text-xs"
                  />
                </div>
              </div>
              {bankerUserId && (
                <div className="mb-2">
                  <label className="text-xs text-muted-foreground">续庄携带（上轮余额，不重复扣款）</label>
                  <Input
                    data-testid="input-carry-over"
                    type="number"
                    min={0}
                    value={carryOver}
                    onChange={e => setCarryOver(e.target.value)}
                    placeholder="0（新局填0）"
                    className="mt-0.5 h-7 text-xs w-40"
                  />
                </div>
              )}
              {/* Odds & pump rate */}
              <div className="border border-border/40 rounded-md p-2 mb-2 bg-background/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-muted-foreground">赔率设置 <span className="text-[10px] font-normal">（留空 = 按比例分池）</span></span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">厨房服务费%</span>
                      <Input
                        data-testid="input-pump-rate"
                        type="number"
                        min={0}
                        max={50}
                        value={pumpRate}
                        onChange={e => setPumpRate(e.target.value)}
                        placeholder="0"
                        className="h-6 text-xs w-12 px-1.5"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">平台服务费%</span>
                      <Input
                        data-testid="input-player-pump-rate"
                        type="number"
                        min={0}
                        max={50}
                        value={playerPumpRate}
                        onChange={e => setPlayerPumpRate(e.target.value)}
                        placeholder="0"
                        className="h-6 text-xs w-12 px-1.5"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[{key:"B",label:"体力",color:"#22c55e"},{key:"C",label:"法力",color:"#a855f7"},{key:"A",label:"力量",color:"#ef4444"},{key:"D",label:"耐力",color:"#3b82f6"}].map(o => (
                    <div key={o.key}>
                      <label className="text-[10px] font-medium" style={{ color: o.color }}>{o.label}</label>
                      <Input
                        data-testid={`input-ratio-${o.key}`}
                        type="number"
                        min={0}
                        step={0.1}
                        value={optionRatios[o.key]}
                        onChange={e => setOptionRatios(r => ({ ...r, [o.key]: e.target.value }))}
                        placeholder="赔率"
                        className="h-6 text-xs mt-0.5 px-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                className="h-7 px-4 text-xs bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                data-testid="button-admin-start-round"
                disabled={startRoundMutation.isPending || !bankerUserId || !bankerOption || !bankerMaxBet}
                title={!bankerUserId || !bankerOption || !bankerMaxBet ? "必须选择主厨、主厨属性并设置上限" : ""}
                onClick={() => {
                  if (!bankerUserId || !bankerOption || !bankerMaxBet) {
                    toast({ title: "请先选择主厨、主厨属性并设置上限", variant: "destructive" });
                    return;
                  }
                  const bu = onlineUsers?.find(x => x.id === bankerUserId) || adminUsers?.find(x => x.id === bankerUserId);
                  const carryOverNum = carryOver ? Number(carryOver) : 0;
                  if (bu) {
                    const cap = Number(bankerMaxBet);
                    const needed = Math.max(0, cap - carryOverNum);
                    if (bu.balance < needed) {
                      toast({ title: `${bu.nickname || bu.username}积分不足`, description: `当前：${bu.balance.toLocaleString()}，需要追加：${needed.toLocaleString()}`, variant: "destructive" });
                      return;
                    }
                  }
                  const defaultOpts = [
                    { key: "B", label: "体力", color: "#22c55e" },
                    { key: "C", label: "法力", color: "#a855f7" },
                    { key: "A", label: "力量", color: "#ef4444" },
                    { key: "D", label: "耐力", color: "#3b82f6" },
                  ].map(o => ({
                    ...o,
                    ...(optionRatios[o.key] ? { ratio: Number(optionRatios[o.key]) } : {}),
                  }));
                  startRoundMutation.mutate({
                    bankerUserId: bankerUserId || undefined,
                    bankerNickname: bu ? (bu.nickname || bu.username) : undefined,
                    bankerOption: bankerOption || undefined,
                    bankerMaxBet: (bankerUserId && bankerMaxBet) ? Number(bankerMaxBet) : undefined,
                    carryOver: carryOverNum,
                    pumpRate: pumpRate ? Number(pumpRate) : undefined,
                    playerPumpRate: playerPumpRate ? Number(playerPumpRate) : undefined,
                    options: defaultOpts,
                  });
                  setOptionRatios({ A: "", B: "", C: "", D: "" });
                  setCarryOver("");
                  setPumpRate("");
                  setPlayerPumpRate("");
                }}
              >
                <Play className="w-3 h-3 mr-1" />
                开启点餐
              </Button>
            </div>
          )}

          {/* During round: points entry for winner calculation */}
          {isAdmin && currentRound && adminPanelOpen && (
            <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
              <span className="text-xs text-muted-foreground">填写各属性点数（超过主厨属性点数胜；9点三倍，其余一赔一；同点庄赢）：</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {(currentRound.options as BetOption[]).map((opt) => {
                  const pts = optionPoints[opt.key] ?? "";
                  const allFilled = (currentRound.options as BetOption[]).every(o => {
                    const v = optionPoints[o.key];
                    return v !== undefined && v !== "" && !isNaN(Number(v));
                  });
                  // Win condition: this option's score > banker's option score (strict greater)
                  const bankerKey = (currentRound as any).bankerOption || "";
                  const bankerPts = allFilled && bankerKey ? Number(optionPoints[bankerKey] ?? 0) : null;
                  const isBankerOption = opt.key === bankerKey;
                  const isWinner = allFilled && bankerPts !== null && !isBankerOption && Number(pts) > bankerPts;
                  return (
                    <div key={opt.key} className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-medium w-10 shrink-0"
                        style={{ color: opt.color }}
                      >
                        {opt.label}
                      </span>
                      <input
                        data-testid={`input-points-${opt.key}`}
                        type="number"
                        min={0}
                        value={pts}
                        onChange={e => setOptionPoints(prev => ({ ...prev, [opt.key]: e.target.value }))}
                        placeholder="点"
                        className={`w-16 h-6 text-xs px-1.5 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${isWinner ? "border-green-500 ring-1 ring-green-500" : "border-border"}`}
                      />
                      {isBankerOption && <span className="text-[10px] text-amber-500 font-bold">庄</span>}
                      {isWinner && <span className="text-[10px] text-green-500 font-bold">胜</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {currentRound.bankerUserId && (
                  <button
                    type="button"
                    data-testid="button-admin-toggle-double"
                    onClick={() => setDoubleMode(v => !v)}
                    className={`h-6 px-2 text-xs rounded border transition-colors font-medium ${doubleMode ? "bg-orange-500 border-orange-500 text-white" : "border-orange-400 text-orange-400 hover:bg-orange-400/10"}`}
                  >
                    {doubleMode ? "✓ 庄翻倍" : "庄翻倍"}
                  </button>
                )}
                <Button
                  size="sm"
                  className="h-6 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                  disabled={
                    closeRoundMutation.isPending ||
                    !(currentRound.options as BetOption[]).every(o => {
                      const v = optionPoints[o.key];
                      return v !== undefined && v !== "" && !isNaN(Number(v));
                    })
                  }
                  onClick={() => {
                    const pts: Record<string, number> = {};
                    (currentRound.options as BetOption[]).forEach(o => {
                      pts[o.key] = Number(optionPoints[o.key]);
                    });
                    closeRoundMutation.mutate({ optionPoints: pts, double: doubleMode });
                    setOptionPoints({});
                    setDoubleMode(false);
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
                  onClick={() => { setOptionPoints({}); setDoubleMode(false); }}
                  data-testid="button-admin-reset-points"
                >
                  清空
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-xs ml-auto"
                  onClick={() => setCancelRoundConfirm(true)}
                  data-testid="button-admin-cancel-round"
                >
                  取消本轮
                </Button>
              </div>
              {cancelRoundConfirm && (
                <div className="mt-2 border border-destructive/40 bg-destructive/5 rounded p-2 flex flex-col gap-1.5">
                  <span className="text-xs text-destructive font-semibold">确认取消本轮点餐？所有积分将退还。</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" className="h-6 text-xs px-3" onClick={() => cancelRoundMutation.mutate()} disabled={cancelRoundMutation.isPending}>
                      {cancelRoundMutation.isPending ? "取消中..." : "确认取消"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setCancelRoundConfirm(false)}>
                      返回
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex overflow-hidden flex-1">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
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
                  currentUserNickname={user?.nickname || user?.username}
                  isAdmin={isAdmin}
                  balanceMap={isAdmin ? balanceMap : undefined}
                  mutedMap={isAdmin ? mutedMap : undefined}
                  onDelete={isAdmin ? (id) => deleteMessageMutation.mutate(id) : undefined}
                  onMuteUser={isAdmin ? (id, muted) => muteUserMutation.mutate({ id, muted }) : undefined}
                  onBanUser={isAdmin ? (id) => banUserMutation.mutate({ id, banned: true }) : undefined}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat input (all users) */}
          <div className="border-t border-border relative">
            {/* @mention dropdown (admin only) */}
            {isAdmin && mentionQuery !== null && (
              <div className="absolute bottom-full left-3 right-3 mb-1 bg-card border border-border rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                {mentionableUsers
                  .filter(u => !u.isShill && ((u.nickname || u.username).toLowerCase().includes(mentionQuery)))
                  .slice(0, 8)
                  .map(u => (
                    <button
                      key={u.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
                      onMouseDown={(e) => { e.preventDefault(); insertMention(u.nickname || u.username); }}
                    >
                      <span>{u.nickname || u.username}</span>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                    </button>
                  ))
                }
                {mentionableUsers.filter(u => !u.isShill && ((u.nickname || u.username).toLowerCase().includes(mentionQuery))).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">无匹配用户</div>
                )}
              </div>
            )}
            <form onSubmit={handleSend} className="p-3 flex gap-2">
              <Input
                ref={messageInputRef}
                data-testid="input-message"
                value={messageText}
                onChange={handleMessageInput}
                onKeyDown={(e) => { if (e.key === "Escape") setMentionQuery(null); }}
                placeholder={chatMuted && !isAdmin ? "聊天室已禁言" : isAdmin ? "输入消息，@ 提及用户..." : "输入消息（最多30字）..."}
                disabled={!isAdmin && chatMuted}
                maxLength={isAdmin ? 5000 : 30}
                className="flex-1 bg-card border-card-border"
                autoComplete="off"
              />
              <Button
                type="submit"
                size="icon"
                data-testid="button-send"
                disabled={sendMutation.isPending || !messageText.trim() || (!isAdmin && chatMuted)}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {/* Non-admin: betting panel in chat when round active */}
          {!isAdmin && currentRound && (
            <div className="border-t border-border p-3 space-y-2.5 bg-card/40">
              {/* 菜单状态 strip (mobile-friendly, always visible) */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {currentRound.status === "paused"
                    ? <span className="font-semibold text-amber-500">已暂停点餐</span>
                    : <span className="font-semibold text-primary">菜单进行中</span>
                  }
                  {bankerName && (
                    <span className="text-amber-500 font-medium flex items-center gap-1">
                      主厨{bankerName}<span className="text-muted-foreground text-[10px]">（桩）</span>
                      {bankerOptionKey && (() => {
                        const opt = options.find(o => o.key === bankerOptionKey);
                        return opt ? (
                          <span className="text-[10px] font-semibold px-1 rounded" style={{ color: opt.color, border: `1px solid ${opt.color}` }}>
                            {opt.label}
                          </span>
                        ) : null;
                      })()}
                    </span>
                  )}
                </div>
                {totalPool > 0 && (
                  <span className="text-muted-foreground flex items-center gap-1">
                    总餐量 <span className="font-semibold text-foreground">{totalPool.toLocaleString()}</span>
                  </span>
                )}
              </div>
              {/* Banker is exempt */}
              {user?.id === (currentRound as any)?.bankerUserId ? (
                <div className="text-center text-xs text-amber-500 py-2 font-medium">
                  您是本轮主厨（桩），无需点餐
                </div>
              ) : pendingBet ? (
                <div className="rounded-md border-2 border-primary/50 bg-primary/5 p-3 space-y-2">
                  <p className="text-sm font-medium text-center">确认您的点餐？</p>
                  <div className="flex items-center justify-center gap-3 text-sm">
                    <span className="font-bold" style={{ color: options.find(o => o.key === pendingBet.option)?.color }}>
                      {options.find(o => o.key === pendingBet.option)?.label}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="font-semibold">{pendingBet.amount.toLocaleString()}</span>
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
              ) : currentRound.status === "paused" ? (
                <div className="text-center text-xs text-amber-500 py-2 font-medium">
                  点餐暂停中，请稍候...
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, 1fr)` }}
                  >
                    {options.map((opt) => {
                      const isBankerOpt = bankerOptionKey === opt.key && user?.id !== (currentRound as any)?.bankerUserId;
                      const alreadyBet = userBetOptions.has(opt.key);
                      const isSelected = selectedOptions.has(opt.key);
                      return (
                        <button
                          key={opt.key}
                          data-testid={`button-bet-option-${opt.key}`}
                          onClick={() => {
                            if (isBankerOpt) return;
                            setSelectedOptions(prev => {
                              const next = new Set(prev);
                              if (next.has(opt.key)) next.delete(opt.key);
                              else next.add(opt.key);
                              return next;
                            });
                          }}
                          disabled={isBankerOpt}
                          className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-md border-2 transition-all relative ${
                            isBankerOpt
                              ? "border-border/40 bg-background/30 opacity-50 cursor-not-allowed"
                              : isSelected
                              ? "border-primary bg-primary/15 cursor-pointer"
                              : "border-border bg-background/60 cursor-pointer"
                          }`}
                        >
                          {alreadyBet && !isBankerOpt && <span className="absolute top-0.5 right-0.5 text-green-500 text-xs">✓</span>}
                          {isBankerOpt && <span className="absolute top-0.5 right-0.5 text-amber-500 text-xs">桩</span>}
                          <span className="text-base font-bold" style={{ color: opt.color }}>{opt.label}</span>
                          {opt.ratio != null && opt.ratio > 0 && (
                            <span className="text-[10px] text-muted-foreground mt-0.5">{opt.ratio}×</span>
                          )}
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
                      disabled={betMutation.isPending || selectedOptions.size === 0}
                      size="sm"
                      className="h-9 px-4 shrink-0"
                    >
                      {selectedOptions.size > 1 ? `点餐 ×${selectedOptions.size}` : "点餐"}
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
                  {userBetsInRound.length > 0 && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-green-500 text-xs">✓</span>
                        <span className="text-xs text-muted-foreground">已点：</span>
                        {userBetsInRound.map((b, i) => (
                          <span key={i} className="text-xs flex items-center gap-1">
                            <span className="font-semibold" style={{ color: options.find(o => o.key === b.option)?.color }}>
                              {options.find(o => o.key === b.option)?.label}
                            </span>
                            <span className="text-muted-foreground">×</span>
                            <span className="font-medium">{b.amount.toLocaleString()}</span>
                            {i < userBetsInRound.length - 1 && <span className="text-muted-foreground/50">·</span>}
                          </span>
                        ))}
                      </div>
                      {currentRound.status === "open" && (
                        <button
                          data-testid="button-cancel-bet"
                          onClick={() => cancelBetMutation.mutate()}
                          disabled={cancelBetMutation.isPending}
                          className="text-xs text-destructive hover:text-destructive/80 underline underline-offset-2 transition-colors shrink-0 ml-2"
                        >
                          {cancelBetMutation.isPending ? "撤回中..." : "撤回点餐"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar: round status (desktop only) */}
        <div className="hidden md:flex md:w-64 flex-shrink-0 flex-col overflow-hidden border-l border-border bg-card/30">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">菜单状态</h3>
            </div>
            {currentRound ? (
              <Badge variant="default" className="text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground mr-1 animate-pulse inline-block" />
                {currentRound.status === "paused" ? "已暂停" : "进行中"}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <Lock className="w-2.5 h-2.5 mr-1" />
                未开放
              </Badge>
            )}
          </div>

          {currentRound && bankerName && (
            <div className="px-3 py-2 border-b border-border bg-amber-500/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> 主厨（桩）
                </span>
                <span className="font-medium text-foreground">{bankerName}</span>
              </div>
              {bankerOptionKey && options.find(o => o.key === bankerOptionKey) && (
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>主厨选项</span>
                  <span style={{ color: options.find(o => o.key === bankerOptionKey)?.color }} className="font-semibold">
                    {options.find(o => o.key === bankerOptionKey)?.label}
                  </span>
                </div>
              )}
              {bankerCap > 0 && (
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>主厨上限</span>
                  <span className="font-medium">{bankerCap.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {currentRound && totalPool > 0 && (
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>总餐量</span>
                <span className="font-semibold flex items-center gap-1 text-foreground">
                  <Coins className="w-3 h-3 text-yellow-500" />
                  {totalPool.toLocaleString()}
                </span>
              </div>
              {options.length > 0 && (
                <div className="space-y-1">
                  {options.map(opt => {
                    const total = optionTotals[opt.key] || 0;
                    const pct = totalPool > 0 ? Math.round((total / totalPool) * 100) : 0;
                    return (
                      <div key={opt.key} className="flex items-center gap-2 text-xs">
                        <span className="w-10 font-medium truncate" style={{ color: opt.color }}>{opt.label}</span>
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
            <div className="px-3 py-2 border-b border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Trophy className="w-3 h-3" />
                实时点餐记录
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto" data-testid="live-action-feed">
              {liveBets.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">暂无点餐记录</div>
              ) : (
                liveBets.map((bet) => {
                  const opt = options.find((o) => o.key === bet.option);
                  const color = opt?.color || "#6366f1";
                  return (
                    <div
                      key={bet.id}
                      data-testid={`bet-item-${bet.id}`}
                      className="flex items-center gap-2 px-3 py-2 border-b border-border/50"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {opt?.label?.[0] || bet.option}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{bet.nickname || bet.username}</p>
                      </div>
                      <span className="text-xs font-semibold flex items-center gap-0.5 shrink-0">
                        <Coins className="w-3 h-3 text-yellow-500" />
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

function renderMentionContent(content: string, currentUserNickname?: string) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const mentioned = part.slice(1);
      const isMe = currentUserNickname && (
        mentioned.toLowerCase() === currentUserNickname.toLowerCase()
      );
      return (
        <span
          key={i}
          className={isMe
            ? "font-semibold text-amber-500 dark:text-amber-400"
            : "font-semibold text-primary"}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function ChatMessage({
  msg,
  currentUserId,
  currentUserNickname,
  isAdmin,
  balanceMap,
  mutedMap,
  onDelete,
  onMuteUser,
  onBanUser,
}: {
  msg: Message;
  currentUserId?: string;
  currentUserNickname?: string;
  isAdmin?: boolean;
  balanceMap?: Record<string, number>;
  mutedMap?: Record<string, boolean>;
  onDelete?: (id: string) => void;
  onMuteUser?: (userId: string, muted: boolean) => void;
  onBanUser?: (userId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSystem = msg.type === "system";
  const isBet = msg.type === "bet" || (msg.type !== "system" && msg.username != null && (msg.content.startsWith(`${msg.username}:`) || msg.content.startsWith(`${msg.username}：`)));
  const isOwn = msg.userId === currentUserId;
  const hasMention = msg.content.includes("@");
  const mentionsMe = currentUserNickname && msg.content.toLowerCase().includes(`@${currentUserNickname.toLowerCase()}`);

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
    const isMultiLine = lines.length > 1;
    return (
      <div className="flex justify-center my-1.5 px-2">
        <div className={`bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs text-center w-full max-w-sm ${isMultiLine ? "px-4 py-2.5 rounded-xl" : "px-3 py-1 rounded-full"}`}>
          {lines.map((line, i) => (
            <span key={i} className="block leading-snug">
              {line || "\u00A0"}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (isBet) {
    const colonIdx = msg.content.search(/[:：]/);
    const namePart = colonIdx >= 0 ? msg.content.slice(0, colonIdx) : null;
    const restPart = colonIdx >= 0 ? msg.content.slice(colonIdx + 1) : msg.content;
    return (
      <div className="flex items-start">
        <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-muted/60 border border-border/40 text-sm font-semibold leading-snug" style={{ maxWidth: "75%" }}>
          {namePart && <span className="text-yellow-400">{namePart}</span>}
          {namePart && ":"}
          {restPart}
        </div>
      </div>
    );
  }

  const senderBalance = balanceMap && msg.userId ? balanceMap[msg.userId] : undefined;

  return (
    <div className={`group flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      {!isOwn && (
        <div className="relative">
          <button
            className="text-xs text-muted-foreground mb-0.5 ml-1 hover:text-foreground transition-colors flex items-center gap-1"
            onClick={() => isAdmin && setShowMenu(v => !v)}
            data-testid={`username-${msg.userId}`}
          >
            {msg.username}
            {isAdmin && senderBalance !== undefined && (
              <span className="text-[10px] text-green-500 font-medium">（{senderBalance.toLocaleString()}）</span>
            )}
            {isAdmin && <span className="ml-0.5 opacity-40">▾</span>}
          </button>
          {showMenu && isAdmin && msg.userId && (
            <div
              ref={menuRef}
              className="absolute left-0 top-5 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
            >
              {(() => {
                const isMuted = mutedMap?.[msg.userId!] ?? false;
                return (
                  <button
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors ${isMuted ? "text-green-500" : "text-amber-500"}`}
                    onClick={() => { onMuteUser?.(msg.userId!, !isMuted); setShowMenu(false); }}
                    data-testid={`menu-mute-${msg.userId}`}
                  >
                    <MicOff className="w-3 h-3" /> {isMuted ? "解除禁言" : "禁言"}
                  </button>
                );
              })()}
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
            mentionsMe
              ? "bg-amber-500/15 border border-amber-500/40 rounded-bl-sm"
              : isOwn
                ? hasMention
                  ? "bg-primary/90 text-primary-foreground border border-primary/50 rounded-br-sm"
                  : "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-card border border-card-border rounded-bl-sm"
          }`}
        >
          {hasMention
            ? renderMentionContent(msg.content, currentUserNickname)
            : msg.content}
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
