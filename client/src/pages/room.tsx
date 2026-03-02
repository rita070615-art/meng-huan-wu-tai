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
import { Send, Coins, TrendingUp, Lock, Trophy } from "lucide-react";
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: room } = useQuery<Room>({ queryKey: [`/api/rooms/${roomId}`], enabled: !!roomId });
  const { data: messages, isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: [`/api/rooms/${roomId}/messages`],
    enabled: !!roomId,
  });
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
          if (data.message) setLiveMessages((prev) => [...prev, data.message]);
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }
        if (data.type === "BET_OPTIONS_UPDATED" && data.round) {
          setLiveRound((prev) => prev ? { ...prev, options: data.round.options } : null);
        }
      } catch {}
    };

    return () => ws.close();
  }, [roomId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveMessages]);

  const sendMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", `/api/rooms/${roomId}/messages`, { content }),
    onSuccess: () => setMessageText(""),
    onError: (e: Error) => toast({ title: "发送失败", description: e.message, variant: "destructive" }),
  });

  const betMutation = useMutation({
    mutationFn: (data: { option: string; amount: number }) =>
      apiRequest("POST", `/api/rooms/${roomId}/bets`, data),
    onSuccess: () => {
      toast({ title: "下注成功！" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/bet-round`] });
    },
    onError: (e: Error) => toast({ title: "下注失败", description: e.message, variant: "destructive" }),
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    sendMutation.mutate(messageText.trim());
  };

  const handleBet = () => {
    if (!selectedOption) return toast({ title: "请选择下注选项", variant: "destructive" });
    const amt = parseInt(betAmount);
    if (!amt || amt < 1) return toast({ title: "请输入有效金额", variant: "destructive" });
    betMutation.mutate({ option: selectedOption, amount: amt });
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

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="chat-messages">
            {msgsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : (
              displayMessages.map((msg) => (
                <ChatMessage key={msg.id} msg={msg} currentUserId={user?.id} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

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
        </div>

        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden bg-card/30">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">下注面板</h3>
              {currentRound ? (
                <Badge variant="default" className="ml-auto text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground mr-1 animate-pulse inline-block" />
                  进行中
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-auto text-xs">
                  <Lock className="w-2.5 h-2.5 mr-1" />
                  未开放
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">预测结果，赢取奖励</p>
          </div>

          {currentRound ? (
            <div className="p-4 border-b border-border space-y-3">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, 1fr)` }}
              >
                {options.map((opt, i) => {
                  const total = optionTotals[opt.key] || 0;
                  const pct = totalPool > 0 ? Math.round((total / totalPool) * 100) : 0;
                  return (
                    <button
                      key={opt.key}
                      data-testid={`button-bet-option-${opt.key}`}
                      onClick={() => !userAlreadyBet && setSelectedOption(opt.key)}
                      disabled={userAlreadyBet}
                      className={`relative flex flex-col items-center justify-center py-3 px-2 rounded-md border-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                        selectedOption === opt.key
                          ? "border-primary bg-primary/15"
                          : "border-border bg-background/60"
                      }`}
                    >
                      <span className="text-lg font-bold" style={{ color: opt.color }}>
                        {opt.label}
                      </span>
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
                    disabled={userAlreadyBet}
                    className="pl-8 bg-background border-border text-sm h-9"
                  />
                </div>
                <Button
                  data-testid="button-place-bet"
                  onClick={handleBet}
                  disabled={betMutation.isPending || userAlreadyBet || !selectedOption}
                  size="sm"
                  className="h-9 px-4 shrink-0"
                >
                  {betMutation.isPending ? "..." : userAlreadyBet ? "已下注" : "下注"}
                </Button>
              </div>

              {totalPool > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
                  <span>总奖池</span>
                  <span className="font-semibold flex items-center gap-1">
                    <Coins className="w-3 h-3 text-yellow-500" />
                    {totalPool.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex gap-1 flex-wrap">
                {[50, 100, 500, 1000].map((v) => (
                  <button
                    key={v}
                    data-testid={`button-quick-bet-${v}`}
                    onClick={() => setBetAmount(String(v))}
                    disabled={userAlreadyBet}
                    className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground disabled:opacity-40 transition-opacity"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 flex flex-col items-center justify-center text-center border-b border-border">
              <Lock className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">等待管理员开启投注</p>
            </div>
          )}

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                实时投注记录
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto" data-testid="live-action-feed">
              {displayBets.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">暂无投注记录</div>
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
                        {opt?.label || bet.option}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{bet.username}</p>
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

function ChatMessage({ msg, currentUserId }: { msg: Message; currentUserId?: string }) {
  const isSystem = msg.type === "system";
  const isOwn = msg.userId === currentUserId;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full max-w-sm text-center">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      {!isOwn && (
        <span className="text-xs text-muted-foreground mb-0.5 ml-1">{msg.username}</span>
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
    </div>
  );
}
