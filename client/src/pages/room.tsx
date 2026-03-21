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
import { Send, Coins, Trash2, MicOff, Ban, Settings, Play, Pause, ChevronDown, ChevronUp, ShieldAlert, LayoutDashboard, TrendingUp, Trophy, Lock, LockOpen, ImageIcon, Users } from "lucide-react";
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
  const [roomLocked, setRoomLocked] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [optionPoints, setOptionPoints] = useState<Record<string, string>>({});
  const [pendingBet, setPendingBet] = useState<{ option: string; amount: number } | null>(null);
  const [bankerUserId, setBankerUserId] = useState("");
  const [bankerOption, setBankerOption] = useState("");
  const [bankerMaxBet, setBankerMaxBet] = useState("");
  const [carryOver, setCarryOver] = useState("");
  const [addToLimit, setAddToLimit] = useState("");
  const [persistedBanker, setPersistedBanker] = useState<{
    userId: string; nickname: string; option: string; bankerReturn: number; pumpRate: string; playerPumpRate: string; exitPumpRate: string;
  } | null>(null);
  const [pumpRate, setPumpRate] = useState("");
  const [playerPumpRate, setPlayerPumpRate] = useState("");
  const [exitPumpRate, setExitPumpRate] = useState("");
  const [optionRatios, setOptionRatios] = useState<Record<string, string>>({ A: "", B: "", C: "", D: "" });
  const [cancelRoundConfirm, setCancelRoundConfirm] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsDestroyedRef = useRef(false);
  const bankerDismissedRef = useRef(false);

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

  const { data: onlineUsers, refetch: refetchOnlineUsers } = useQuery<Array<{ id: string; username: string; nickname: string | null; balance: number; isShill: boolean }>>({
    queryKey: [`/api/rooms/${roomId}/online-users`],
    enabled: !!isAdmin && !!roomId,
    refetchInterval: 8000,
  });

  const { data: lowBalanceBotsData, refetch: refetchLowBalanceBots } = useQuery<Array<{ username: string; balance: number; required: number }>>({
    queryKey: ["/api/admin/low-balance-bots"],
    enabled: !!isAdmin,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (lowBalanceBotsData) {
      setLowBalanceBots(lowBalanceBotsData);
      if (lowBalanceBotsData.length > 0) setBotAlertDismissed(false);
    }
  }, [lowBalanceBotsData]);

  useEffect(() => {
    if (messages) setLiveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (room) {
      setChatMuted(!!(room as any).chatMuted);
      setRoomLocked(!!(room as any).isLocked);
    }
  }, [room]);

  // Restore persistedBanker from server when component mounts (survives page navigation)
  useEffect(() => {
    if (room && liveRound === null && persistedBanker === null && !bankerDismissedRef.current) {
      const pb = (room as any).pendingBanker;
      if (pb && pb.userId && pb.option) {
        setPersistedBanker({
          userId: pb.userId,
          nickname: pb.nickname || pb.userId,
          option: pb.option,
          bankerReturn: pb.bankerReturn ?? 0,
          pumpRate: pb.pumpRate != null ? String(pb.pumpRate) : "",
          playerPumpRate: pb.playerPumpRate != null ? String(pb.playerPumpRate) : "",
          exitPumpRate: pb.exitPumpRate != null ? String(pb.exitPumpRate) : "",
        });
      }
    }
  }, [room, liveRound]);

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
          bankerDismissedRef.current = false;
          // Auto-persist banker for next round
          if (data.round?.bankerUserId && data.round?.bankerOption) {
            setPersistedBanker({
              userId: data.round.bankerUserId,
              nickname: data.round.bankerNickname || data.round.bankerUserId,
              option: data.round.bankerOption,
              bankerReturn: data.bankerReturn ?? 0,
              pumpRate: data.pumpRate != null ? String(data.pumpRate) : "",
              playerPumpRate: data.playerPumpRate != null ? String(data.playerPumpRate) : "",
              exitPumpRate: data.exitPumpRate != null ? String(data.exitPumpRate) : "",
            });
            setAddToLimit("");
          }
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
        if (data.type === "BET_ROUND_CANCELLED") {
          setLiveRound(null);
          setLiveBets([]);
          setOptionPoints({});
          setDoubleMode(false);
          if (data.message) setLiveMessages((prev) => {
            if (prev.some((m: any) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        }
        if (data.type === "BET_ROUND_PAUSED") {
          setLiveRound((prev) => prev ? { ...prev, status: "paused" } : null);
          setPendingBet(null);
        }
        if (data.type === "BET_ROUND_RESUMED") {
          setLiveRound((prev) => prev ? { ...prev, status: "open" } : null);
        }
        if (data.type === "PENDING_BANKER_CLEARED") {
          bankerDismissedRef.current = true;
          setPersistedBanker(null);
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}`] });
        }
        if (data.type === "ROOM_CHAT_MUTED") {
          setChatMuted(data.chatMuted);
        }
        if (data.type === "ROOM_LOCKED") {
          setRoomLocked(data.isLocked);
        }
        if (data.type === "BOT_LOW_BALANCE") {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/low-balance-bots"] });
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

  const lockRoomMutation = useMutation({
    mutationFn: (locked: boolean) => apiRequest("PATCH", `/api/admin/rooms/${roomId}/lock`, { isLocked: locked }),
    onSuccess: (_, locked) => toast({ title: locked ? "房间已封盘" : "房间已开盘" }),
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const startRoundMutation = useMutation({
    mutationFn: (params?: { bankerUserId?: string; bankerNickname?: string; bankerOption?: string; bankerMaxBet?: number; carryOver?: number; pumpRate?: number; playerPumpRate?: number; exitPumpRate?: number; options?: object }) =>
      apiRequest("POST", `/api/rooms/${roomId}/bet-round`, params || {}),
    onSuccess: () => { setBankerUserId(""); setBankerOption(""); setBankerMaxBet(""); setCarryOver(""); setAddToLimit(""); },
    onError: (e: Error) => toast({ title: "开始失败", description: e.message, variant: "destructive" }),
  });

  const [doubleMode, setDoubleMode] = useState(false);
  const [lowBalanceBots, setLowBalanceBots] = useState<Array<{ id: string; username: string; balance: number; required: number }>>([]);
  const [botAlertDismissed, setBotAlertDismissed] = useState(false);
  const [botTopUpAmounts, setBotTopUpAmounts] = useState<Record<string, string>>({});

  const botTopUpMutation = useMutation({
    mutationFn: ({ id, balance }: { id: string; balance: number }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/balance`, { balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/low-balance-bots"] });
      toast({ title: "积分已充值" });
    },
    onError: (e: Error) => toast({ title: "充值失败", description: e.message, variant: "destructive" }),
  });

  const closeRoundMutation = useMutation({
    mutationFn: ({ optionPoints: pts, double: dbl }: { optionPoints: Record<string, number>; double: boolean }) =>
      apiRequest("POST", `/api/rooms/${roomId}/bet-round/close`, { optionPoints: pts, double: dbl }),
    onError: (e: Error) => toast({ title: "结束失败", description: e.message, variant: "destructive" }),
  });

  const dismissBankerMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/rooms/${roomId}/pending-banker`),
    onSuccess: () => {
      bankerDismissedRef.current = true;
      setPersistedBanker(null);
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}`] });
    },
    onError: (e: Error) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
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
      setLiveBets([]);
      setOptionPoints({});
      setDoubleMode(false);
      setCancelRoundConfirm(false);
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "点餐已取消，餐费已退还" });
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

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;
    setMediaUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/rooms/${roomId}/upload-media`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || "上传失败", variant: "destructive" });
      }
    } catch {
      toast({ title: "上传失败，请稍后重试", variant: "destructive" });
    } finally {
      setMediaUploading(false);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  };

  const handleBet = () => {
    if (selectedOptions.size === 0) return toast({ title: "请选择菜单选项", variant: "destructive" });
    const amt = parseInt(betAmount);
    if (!amt || amt < 1) return toast({ title: "请输入有效金额", variant: "destructive" });
    const totalRequired = amt * selectedOptions.size;
    if ((user?.balance ?? 0) < totalRequired) {
      return toast({
        title: "余额不足",
        description: `选了 ${selectedOptions.size} 个选项共需 ${totalRequired.toLocaleString()} 积分，当前余额 ${(user?.balance ?? 0).toLocaleString()}`,
        variant: "destructive",
      });
    }
    if (selectedOptions.size === 1) {
      setPendingBet({ option: [...selectedOptions][0], amount: amt });
    } else {
      // Multi-option: submit all sequentially
      const keys = [...selectedOptions];
      const first = keys[0];
      betMutation.mutate({ option: first, amount: amt }, {
        onSuccess: () => {
          const rest = keys.slice(1);
          const submitNext = (idx: number) => {
            if (idx >= rest.length) return;
            apiRequest("POST", `/api/rooms/${roomId}/bets`, { option: rest[idx], amount: amt })
              .then(() => submitNext(idx + 1))
              .catch((e: Error) => toast({ title: "部分点餐失败", description: e.message, variant: "destructive" }));
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

  // Effective cap = pump-adjusted (pump only on new portion, not carryOver)
  const effectiveRoundCap = (() => {
    if (!currentRound?.bankerMaxBet) return 0;
    const rCarry = (currentRound as any).carryOver ?? 0;
    const rNew = Math.max(0, (currentRound.bankerMaxBet as number) - rCarry);
    const rPump = (currentRound as any).pumpRate ?? 0;
    return Math.floor(rNew * (1 - rPump / 100)) + rCarry;
  })();
  // Cap is reached when round is paused AND total bets >= effective cap (works on page load too)
  const capReached = !!(
    currentRound?.status === "paused" &&
    currentRound?.bankerMaxBet &&
    totalPool >= effectiveRoundCap
  );

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

      {isAdmin && lowBalanceBots.length > 0 && !botAlertDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background border-2 border-yellow-500 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h3 className="text-sm font-bold text-yellow-500">托管账号积分不足</h3>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">以下托管账号余额不足，无法参与下注。充值后弹窗将自动消失。</p>
            <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
              {lowBalanceBots.map((bot) => (
                <div key={bot.id} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">{bot.username}</span>
                    <div className="text-right">
                      <span className="text-xs text-red-400">余额：{bot.balance.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-2">需要：{bot.required.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      placeholder="充值金额"
                      value={botTopUpAmounts[bot.id] ?? ""}
                      onChange={e => setBotTopUpAmounts(prev => ({ ...prev, [bot.id]: e.target.value }))}
                      className="flex-1 h-7 text-xs px-2 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <button
                      disabled={!botTopUpAmounts[bot.id] || isNaN(parseInt(botTopUpAmounts[bot.id])) || botTopUpMutation.isPending}
                      onClick={() => {
                        const delta = parseInt(botTopUpAmounts[bot.id] ?? "");
                        if (!isNaN(delta) && delta > 0) {
                          botTopUpMutation.mutate({ id: bot.id, balance: bot.balance + delta });
                          setBotTopUpAmounts(prev => ({ ...prev, [bot.id]: "" }));
                        }
                      }}
                      className="h-7 px-3 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-40 transition-colors"
                    >
                      上分
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex-1 text-xs text-muted-foreground hover:text-foreground py-1.5 border border-border rounded-lg transition-colors"
                onClick={() => refetchLowBalanceBots()}
              >
                刷新检查
              </button>
              <button
                className="flex-1 text-xs text-yellow-500 hover:text-yellow-400 py-1.5 border border-yellow-500/40 rounded-lg transition-colors"
                onClick={() => setBotAlertDismissed(true)}
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="border-b border-border bg-primary/5">
          {/* Admin top bar */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-primary">管理控制台</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                size="sm"
                variant={roomLocked ? "destructive" : "outline"}
                className={`h-6 px-2 text-xs ${roomLocked ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : ""}`}
                data-testid="button-admin-room-lock"
                disabled={lockRoomMutation.isPending}
                onClick={() => lockRoomMutation.mutate(!roomLocked)}
              >
                {roomLocked ? <><LockOpen className="w-3 h-3 mr-1" />开盘</> : <><Lock className="w-3 h-3 mr-1" />封盘</>}
              </Button>
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
          {isAdmin && !currentRound && (() => {
            const optLabels: Record<string, string> = { B: "体力", C: "法力", A: "力量", D: "耐力" };
            const optColors: Record<string, string> = { B: "#22c55e", C: "#a855f7", A: "#ef4444", D: "#3b82f6" };
            const defaultOpts = [
              { key: "B", label: "体力", color: "#22c55e" },
              { key: "C", label: "法力", color: "#a855f7" },
              { key: "A", label: "力量", color: "#ef4444" },
              { key: "D", label: "耐力", color: "#3b82f6" },
            ].map(o => ({ ...o, ...(optionRatios[o.key] ? { ratio: Number(optionRatios[o.key]) } : {}) }));

            // CONTINUING MODE: same banker carries over from last round
            if (persistedBanker) {
              const carryAmt = persistedBanker.bankerReturn;
              const addAmt = addToLimit ? Number(addToLimit) : 0;
              const totalCap = carryAmt + addAmt; // gross — sent to server as bankerMaxBet
              const activePumpRate = pumpRate !== "" ? pumpRate : persistedBanker.pumpRate;
              const activePumpNum = activePumpRate ? Number(activePumpRate) : 0;
              // Pump is only deducted from the new portion (追加资金), not the carry-over
              const effectiveDisplayCap = carryAmt + Math.floor(addAmt * (1 - activePumpNum / 100));
              const activePlayerPumpRate = playerPumpRate !== "" ? playerPumpRate : persistedBanker.playerPumpRate;
              const activeExitPumpRate = exitPumpRate !== "" ? exitPumpRate : persistedBanker.exitPumpRate;
              const effectiveBankerOption = bankerOption || persistedBanker.option;
              return (
                <div className="px-3 py-3 border-t border-border/50 bg-amber-500/5">
                  {/* Banker info bar */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-400">继续上庄</span>
                      <span className="text-xs font-medium text-foreground">{persistedBanker.nickname}</span>
                    </div>
                    <button
                      type="button"
                      data-testid="button-dismiss-banker"
                      onClick={() => { dismissBankerMutation.mutate(); setAddToLimit(""); setBankerUserId(""); setBankerOption(""); setBankerMaxBet(""); setCarryOver(""); }}
                      className="text-[11px] text-red-400 border border-red-400/40 rounded px-2 py-0.5 hover:bg-red-400/10 transition-colors"
                    >
                      下庄
                    </button>
                  </div>

                  {/* Banker option re-select */}
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-[10px] text-muted-foreground shrink-0">庄属性</label>
                    <select
                      data-testid="select-carry-banker-option"
                      value={effectiveBankerOption}
                      onChange={e => setBankerOption(e.target.value)}
                      className="text-xs bg-background border border-border rounded px-2 py-0.5 text-foreground"
                    >
                      {[{key:"B",label:"体力"},{key:"C",label:"法力"},{key:"A",label:"力量"},{key:"D",label:"耐力"}].map(o => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                    <span className="text-[11px] px-1.5 py-0.5 rounded font-bold" style={{ color: optColors[effectiveBankerOption] || "#fff", background: `${optColors[effectiveBankerOption]}22` }}>
                      {optLabels[effectiveBankerOption] || effectiveBankerOption}
                    </span>
                  </div>

                  {/* Odds */}
                  <div className="border border-border/40 rounded-md p-2 mb-2 bg-background/40">
                    <p className="text-[10px] text-muted-foreground mb-1.5">赔率设置 <span className="text-[10px] font-normal">（留空 = 按比例分池）</span></p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[{key:"B",label:"体力",color:"#22c55e"},{key:"C",label:"法力",color:"#a855f7"},{key:"A",label:"力量",color:"#ef4444"},{key:"D",label:"耐力",color:"#3b82f6"}].map(o => (
                        <div key={o.key}>
                          <label className="text-[10px] font-medium" style={{ color: o.color }}>{o.label}</label>
                          <Input
                            data-testid={`input-carry-ratio-${o.key}`}
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

                  {/* Carry + add to limit */}
                  <div className="flex items-end gap-3 mb-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">上把余（续庄携带）</label>
                      <div className="mt-0.5 h-7 px-2 flex items-center text-xs bg-background/60 border border-border rounded font-mono text-amber-400 min-w-[80px]">
                        {carryAmt.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">加上限（追加资金）</label>
                      <Input
                        data-testid="input-add-to-limit"
                        type="number"
                        min={0}
                        value={addToLimit}
                        onChange={e => setAddToLimit(e.target.value)}
                        placeholder="0"
                        className="mt-0.5 h-7 text-xs w-24"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">本局上限</label>
                      <div className="mt-0.5 h-7 px-2 flex items-center text-xs bg-background/60 border border-border rounded font-mono text-green-400 min-w-[80px]" title={activePumpNum > 0 && addAmt > 0 ? `${carryAmt.toLocaleString()} + ${addAmt.toLocaleString()} × ${100 - activePumpNum}% = ${effectiveDisplayCap.toLocaleString()}` : undefined}>
                        {effectiveDisplayCap.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pb-0.5">
                      <span className="text-[10px] text-muted-foreground">上庄抽水%</span>
                      <Input
                        data-testid="input-pump-rate"
                        type="number" min={0} max={50}
                        value={activePumpRate}
                        onChange={e => setPumpRate(e.target.value)}
                        placeholder="0"
                        className="h-6 text-xs w-12 px-1.5"
                      />
                    </div>
                    <div className="flex items-center gap-1 pb-0.5">
                      <span className="text-[10px] text-muted-foreground">下庄抽水%</span>
                      <Input
                        data-testid="input-exit-pump-rate"
                        type="number" min={0} max={50}
                        value={activeExitPumpRate}
                        onChange={e => setExitPumpRate(e.target.value)}
                        placeholder="0"
                        className="h-6 text-xs w-12 px-1.5"
                      />
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="h-7 px-4 text-xs bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    data-testid="button-admin-start-round"
                    disabled={startRoundMutation.isPending || effectiveDisplayCap <= 0 || roomLocked}
                    title={roomLocked ? "请先开盘再开始游戏" : effectiveDisplayCap <= 0 ? "本局上限须大于0" : ""}
                    onClick={() => {
                      const defaultOptsNow = defaultOpts;
                      startRoundMutation.mutate({
                        bankerUserId: persistedBanker.userId,
                        bankerNickname: persistedBanker.nickname,
                        bankerOption: effectiveBankerOption,
                        bankerMaxBet: totalCap,
                        carryOver: carryAmt,
                        pumpRate: activePumpRate ? Number(activePumpRate) : undefined,
                        playerPumpRate: activePlayerPumpRate ? Number(activePlayerPumpRate) : undefined,
                        exitPumpRate: activeExitPumpRate ? Number(activeExitPumpRate) : undefined,
                        options: defaultOptsNow,
                      });
                      setOptionRatios({ A: "", B: "", C: "", D: "" });
                      setBankerOption("");
                    }}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    开启下一把
                  </Button>
                </div>
              );
            }

            // FRESH MODE: select banker from scratch
            return (
              <div className="px-3 py-3 border-t border-border/50 bg-primary/3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-primary">开局设置（必须选庄）</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="min-w-0">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      选庄 <span className="text-red-500">*</span>
                      <button type="button" onClick={() => refetchOnlineUsers()} className="text-[10px] text-primary hover:underline">刷新</button>
                    </label>
                    <select
                      data-testid="select-banker-user"
                      value={bankerUserId}
                      onChange={e => { setBankerUserId(e.target.value); if (!e.target.value) { setBankerOption(""); setBankerMaxBet(""); setCarryOver(""); } }}
                      className="w-full min-w-0 mt-0.5 text-xs bg-background border border-border rounded px-2 py-1 text-foreground truncate"
                    >
                      <option value="">— 请选择庄 —</option>
                      {(onlineUsers || []).map(u => (
                        <option key={u.id} value={u.id}>{u.nickname || u.username}（{u.balance.toLocaleString()}）</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs text-muted-foreground">庄属性 <span className="text-red-500">*</span></label>
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
                    <label className="text-xs text-muted-foreground">标庄金额 <span className="text-red-500">*</span></label>
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
                {/* Odds & pump rate */}
                <div className="border border-border/40 rounded-md p-2 mb-2 bg-background/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">赔率设置 <span className="text-[10px] font-normal">（留空 = 按比例分池）</span></span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">上庄抽水%</span>
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
                        <span className="text-[10px] text-muted-foreground">下庄抽水%</span>
                        <Input
                          data-testid="input-exit-pump-rate-fresh"
                          type="number"
                          min={0}
                          max={50}
                          value={exitPumpRate}
                          onChange={e => setExitPumpRate(e.target.value)}
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
                  disabled={startRoundMutation.isPending || !bankerUserId || !bankerOption || !bankerMaxBet || roomLocked}
                  title={roomLocked ? "请先开盘再开始游戏" : !bankerUserId || !bankerOption || !bankerMaxBet ? "必须选择庄、庄属性并设置标庄金额" : ""}
                  onClick={() => {
                    if (roomLocked) {
                      toast({ title: "请先开盘再开始游戏", variant: "destructive" });
                      return;
                    }
                    if (!bankerUserId || !bankerOption || !bankerMaxBet) {
                      toast({ title: "请先选择庄、庄属性并设置标庄金额", variant: "destructive" });
                      return;
                    }
                    const bu = onlineUsers?.find(x => x.id === bankerUserId) || adminUsers?.find(x => x.id === bankerUserId);
                    if (bu && bu.balance < Number(bankerMaxBet)) {
                      toast({ title: `${bu.nickname || bu.username}积分不足`, description: `当前：${bu.balance.toLocaleString()}，需要：${Number(bankerMaxBet).toLocaleString()}`, variant: "destructive" });
                      return;
                    }
                    startRoundMutation.mutate({
                      bankerUserId: bankerUserId || undefined,
                      bankerNickname: bu ? (bu.nickname || bu.username) : undefined,
                      bankerOption: bankerOption || undefined,
                      bankerMaxBet: (bankerUserId && bankerMaxBet) ? Number(bankerMaxBet) : undefined,
                      carryOver: 0,
                      pumpRate: pumpRate ? Number(pumpRate) : undefined,
                      playerPumpRate: playerPumpRate ? Number(playerPumpRate) : undefined,
                      exitPumpRate: exitPumpRate ? Number(exitPumpRate) : undefined,
                      options: defaultOpts,
                    });
                    setOptionRatios({ A: "", B: "", C: "", D: "" });
                    setPumpRate("");
                    setPlayerPumpRate("");
                    setExitPumpRate("");
                  }}
                >
                  <Play className="w-3 h-3 mr-1" />
                  开启点餐
                </Button>
              </div>
            );
          })()}

          {/* During round: points entry for winner calculation */}
          {isAdmin && currentRound && adminPanelOpen && (
            <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
              <span className="text-xs text-muted-foreground">填写各属性点数（超过庄属性点数胜；9点三倍，其余一赔一；同点庄赢）：</span>
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
                        max={9}
                        value={pts}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 1);
                          if (v === "" || (parseInt(v) >= 0 && parseInt(v) <= 9)) {
                            setOptionPoints(prev => ({ ...prev, [opt.key]: v }));
                          }
                        }}
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
          {roomLocked && !isAdmin && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-500 dark:text-red-400 text-center flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              房间已封盘，等待开盘中...
            </div>
          )}
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
              {/* Hidden file input for media upload (admin only) */}
              {isAdmin && (
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  data-testid="input-media-upload"
                  onChange={handleMediaUpload}
                />
              )}
              <Input
                ref={messageInputRef}
                data-testid="input-message"
                value={messageText}
                onChange={handleMessageInput}
                onKeyDown={(e) => { if (e.key === "Escape") setMentionQuery(null); }}
                placeholder={!isAdmin && roomLocked ? "房间已封盘" : chatMuted && !isAdmin ? "聊天室已禁言" : isAdmin ? "输入消息，@ 提及用户..." : "输入消息（最多30字）..."}
                disabled={!isAdmin && (chatMuted || roomLocked)}
                maxLength={isAdmin ? 5000 : 30}
                className="flex-1 bg-card border-card-border"
                autoComplete="off"
              />
              {isAdmin && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  data-testid="button-upload-media"
                  disabled={mediaUploading}
                  title="发送图片/视频"
                  onClick={() => mediaInputRef.current?.click()}
                >
                  {mediaUploading
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <ImageIcon className="w-4 h-4" />
                  }
                </Button>
              )}
              <Button
                type="submit"
                size="icon"
                data-testid="button-send"
                disabled={sendMutation.isPending || !messageText.trim() || (!isAdmin && (chatMuted || roomLocked))}
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
                    ? <span className="font-semibold text-amber-500">{capReached ? "点餐订单已满" : "已暂停点餐"}</span>
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
                  您是本轮庄，无需点餐
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
                      disabled={betMutation.isPending || (!isAdmin && roomLocked) || currentRound?.status === "paused"}
                    >
                      {betMutation.isPending ? "提交中..." : "✓ 确认点餐"}
                    </Button>
                  </div>
                </div>
              ) : currentRound.status === "paused" ? (
                <div className="text-center text-xs py-2 font-medium">
                  {capReached
                    ? <span className="text-green-500">✅ 点餐订单已满。等待厨房出餐</span>
                    : <span className="text-amber-500">点餐暂停中，请稍候...</span>
                  }
                </div>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const selectableKeys = options
                      .filter(o => !(bankerOptionKey === o.key && user?.id !== (currentRound as any)?.bankerUserId))
                      .map(o => o.key);
                    const allSelected = selectableKeys.length > 0 && selectableKeys.every(k => selectedOptions.has(k));
                    return (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          data-testid="button-select-all-options"
                          onClick={() => {
                            if (allSelected) {
                              setSelectedOptions(new Set());
                            } else {
                              setSelectedOptions(new Set(selectableKeys));
                            }
                          }}
                          className="text-[11px] text-primary/80 hover:text-primary border border-primary/30 hover:border-primary/60 rounded px-2 py-0.5 transition-colors"
                        >
                          {allSelected ? "取消全选" : "全选"}
                        </button>
                      </div>
                    );
                  })()}
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

        {/* Right sidebar: round status (admin only, desktop only) */}
        {isAdmin && <div className="hidden md:flex md:w-64 flex-shrink-0 flex-col overflow-hidden border-l border-border bg-card/30">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">菜单状态</h3>
            </div>
            {currentRound ? (
              <Badge variant="default" className="text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground mr-1 animate-pulse inline-block" />
                {currentRound.status === "paused" ? (capReached ? "满额" : "已暂停") : "进行中"}
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
                  <Trophy className="w-3 h-3" /> 庄（桩）
                </span>
                <span className="font-medium text-foreground">{bankerName}</span>
              </div>
              {bankerOptionKey && options.find(o => o.key === bankerOptionKey) && (
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>庄属性</span>
                  <span style={{ color: options.find(o => o.key === bankerOptionKey)?.color }} className="font-semibold">
                    {options.find(o => o.key === bankerOptionKey)?.label}
                  </span>
                </div>
              )}
              {bankerCap > 0 && (
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>标庄金额</span>
                  <span className="font-medium">{effectiveRoundCap.toLocaleString()}</span>
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
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                在线用户
              </h4>
              {onlineUsers && (
                <span className="text-xs text-muted-foreground">
                  {onlineUsers.filter(u => !u.isShill).length}人 · 托{onlineUsers.filter(u => u.isShill).length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto" data-testid="online-users-panel">
              {!onlineUsers || onlineUsers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">暂无在线用户</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {onlineUsers.filter(u => !u.isShill).map(u => {
                    const displayName = u.nickname || u.username;
                    const initial = displayName[0].toUpperCase();
                    const colors = ["#6366f1","#8b5cf6","#ec4899","#0ea5e9","#14b8a6","#f97316","#84cc16"];
                    const color = colors[displayName.charCodeAt(0) % colors.length];
                    return (
                      <div key={u.id} data-testid={`online-user-${u.id}`} className="flex items-center gap-2 px-3 py-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{displayName}</p>
                        </div>
                        <span className="text-xs font-semibold text-yellow-500 shrink-0 flex items-center gap-0.5">
                          <Coins className="w-3 h-3" />
                          {u.balance.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                  {onlineUsers.filter(u => u.isShill).length > 0 && (
                    <>
                      <div className="px-3 py-1.5 bg-muted/30">
                        <span className="text-[10px] text-muted-foreground font-medium tracking-wider">托管账号</span>
                      </div>
                      {onlineUsers.filter(u => u.isShill).map(u => {
                        const displayName = u.nickname || u.username;
                        const initial = displayName[0].toUpperCase();
                        return (
                          <div key={u.id} data-testid={`shill-user-${u.id}`} className="flex items-center gap-2 px-3 py-2 bg-amber-500/5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-amber-500">
                              {initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate text-amber-400">{displayName}</p>
                            </div>
                            <span className="text-xs font-semibold text-yellow-500 shrink-0 flex items-center gap-0.5">
                              <Coins className="w-3 h-3" />
                              {u.balance.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>}

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
  const isImage = msg.type === "image";
  const isGif = isImage && /\.gif(\?|$)/i.test(msg.content);
  const isVideo = msg.type === "video";
  const isBet = msg.type === "bet" || (msg.type !== "system" && !isImage && !isVideo && msg.username != null && (msg.content.startsWith(`${msg.username}:`) || msg.content.startsWith(`${msg.username}：`)));
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
    const isReport = lines.length >= 10;

    const OPTION_COLORS: Record<string, string> = {
      "体力": "#22c55e",
      "法力": "#a855f7",
      "力量": "#ef4444",
      "耐力": "#3b82f6",
    };
    const isOptionsLine = (line: string) => {
      const parts = line.split(" · ");
      return parts.length >= 2 && parts.every(p => p.trim() in OPTION_COLORS);
    };
    const isSectionHeader = (line: string) =>
      line.includes("本局出餐") || line.includes("本局餐费") || line.startsWith("📜");
    const isWinLine = (line: string) => /^🏆/.test(line);
    const isCompleteLine = (line: string) => line.includes("本轮厨房已完成出餐") || /^✅/.test(line);
    const isBudgetLine = (line: string) => /^💰/.test(line);
    const isChefLine = (line: string) => line.includes("当前厨师");
    const isAttrHeaderLine = (line: string) => line.includes("本轮可点属性");
    const isStartBettingLine = (line: string) => line.trim() === "开始点餐";
    const isCancelLine = (line: string) => line.includes("取消") && line.includes("退还");
    const isTimestampLine = (line: string) => /^📅/.test(line);

    const renderLine = (line: string, i: number) => {
      if (isOptionsLine(line)) {
        const parts = line.split(" · ");
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-xl my-0.5">
            {parts.map((p, j) => (
              <span key={j}>
                {j > 0 && <span className="text-foreground/40 mx-1">·</span>}
                <span style={{ color: OPTION_COLORS[p.trim()] }} className="font-bold">{p.trim()}</span>
              </span>
            ))}
          </div>
        );
      }
      if (isSectionHeader(line)) {
        const col = line.includes("本局出餐") ? "#f97316"
          : line.includes("本局餐费") ? "#a855f7"
          : "#f59e0b";
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center", color: col }} className="text-base font-extrabold mt-3 mb-0.5 tracking-wide">
            {line}
          </div>
        );
      }
      if (isWinLine(line)) {
        const isPositive = /：\+/.test(line);
        const isNegative = /：-/.test(line);
        const col = isPositive ? "#22c55e" : isNegative ? "#ef4444" : "#f59e0b";
        return (
          <div key={i} style={{ color: col, textAlign: isReport ? "left" : "center" }} className="text-sm font-bold">
            {line}
          </div>
        );
      }
      if (isCompleteLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-lg font-bold text-green-400 mt-1">
            {line}
          </div>
        );
      }
      if (isBudgetLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-lg text-amber-400 font-bold">
            {line}
          </div>
        );
      }
      if (isChefLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-lg font-bold text-foreground">
            {line}
          </div>
        );
      }
      if (isAttrHeaderLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-lg font-bold text-foreground/80">
            {line}
          </div>
        );
      }
      if (isStartBettingLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-lg font-bold text-yellow-400 mt-1">
            {line}
          </div>
        );
      }
      if (isCancelLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-lg font-bold text-red-500">
            {line}
          </div>
        );
      }
      if (isTimestampLine(line)) {
        return (
          <div key={i} style={{ textAlign: isReport ? "left" : "center" }} className="text-xs text-muted-foreground font-normal">
            {line}
          </div>
        );
      }
      return (
        <div key={i} style={{ textAlign: isReport ? "left" : "center" }}>
          {line || "\u00A0"}
        </div>
      );
    };

    return (
      <div className={`flex flex-col my-2 px-4 ${isReport ? "items-start" : "items-center"}`}>
        <div className={`text-sm font-semibold text-foreground/90 leading-relaxed ${isReport ? "w-full max-w-lg" : "w-full max-w-sm"}`}>
          {lines.map((line, i) => renderLine(line, i))}
        </div>
        {isAdmin && onDelete && (
          <button
            className="mt-0.5 text-[10px] text-red-400 hover:text-red-500 transition-colors"
            onClick={() => onDelete(msg.id)}
          >
            删除
          </button>
        )}
      </div>
    );
  }

  if (isImage || isVideo) {
    return (
      <div className="flex flex-col items-start gap-0.5 my-1">
        <span className="text-xs text-muted-foreground ml-1">{msg.username}</span>
        {isGif ? (
          // GIF: sticker-style, no frame/border
          <img
            src={msg.content}
            alt="动图"
            className="block max-w-[200px] max-h-[200px] object-contain"
            data-testid={`img-media-${msg.id}`}
          />
        ) : isImage ? (
          <div className="rounded-2xl overflow-hidden max-w-[75vw] md:max-w-xs border border-border/40 shadow-sm">
            <a href={msg.content} target="_blank" rel="noopener noreferrer">
              <img
                src={msg.content}
                alt="图片"
                className="block max-w-full max-h-72 object-contain cursor-zoom-in"
                data-testid={`img-media-${msg.id}`}
              />
            </a>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden max-w-[75vw] md:max-w-xs border border-border/40 shadow-sm">
            <video
              src={msg.content}
              controls
              className="block max-w-full max-h-72"
              data-testid={`video-media-${msg.id}`}
            />
          </div>
        )}
        {isAdmin && onDelete && (
          <button
            className="ml-1 text-[10px] text-red-400 hover:text-red-500 transition-colors"
            onClick={() => onDelete(msg.id)}
          >
            删除
          </button>
        )}
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
