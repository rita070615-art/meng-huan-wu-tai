import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Header from "@/components/header";
import { Users, MessageSquare, ChevronRight, LogOut, Shield, Lock, Headphones, X, Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Room = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  hasActiveBet: boolean;
  hasPassword: boolean;
  createdAt: string;
};

type PrivateMessage = {
  id: string;
  userId: string;
  userUsername: string;
  userNickname: string | null;
  adminId: string | null;
  adminUsername: string | null;
  content: string;
  isFromAdmin: boolean;
  readByAdmin: boolean;
  readByUser: boolean;
  createdAt: string;
};

export default function LobbyPage() {
  const { user, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  const [passwordInput, setPasswordInput] = useState("");

  // Customer service panel state
  const [csOpen, setCsOpen] = useState(false);
  const [csInput, setCsInput] = useState("");
  const msgEndRef = useRef<HTMLDivElement>(null);

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
    refetchInterval: 10000,
  });

  const { data: pmMessages, isLoading: pmLoading } = useQuery<PrivateMessage[]>({
    queryKey: ["/api/private-messages"],
    refetchInterval: csOpen ? 4000 : false,
    enabled: !isAdmin,
  });

  const sendMsgMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", "/api/private-messages", { content }),
    onSuccess: () => {
      setCsInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/private-messages"] });
    },
    onError: () => {
      toast({ title: "发送失败", description: "请稍后重试", variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/auth");
    },
  });

  const enterMutation = useMutation({
    mutationFn: ({ roomId, password }: { roomId: string; password: string }) =>
      apiRequest("POST", `/api/rooms/${roomId}/enter`, { password }),
    onSuccess: (_, vars) => {
      setPendingRoom(null);
      setPasswordInput("");
      setLocation(`/room/${vars.roomId}`);
    },
    onError: () => {
      toast({ title: "密码错误", description: "请重新输入", variant: "destructive" });
    },
  });

  const handleRoomClick = (room: Room) => {
    if (room.hasPassword && !isAdmin) {
      setPendingRoom(room);
      setPasswordInput("");
    } else {
      setLocation(`/room/${room.id}`);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRoom) return;
    enterMutation.mutate({ roomId: pendingRoom.id, password: passwordInput });
  };

  const handleSendCs = (e: React.FormEvent) => {
    e.preventDefault();
    const text = csInput.trim();
    if (!text || sendMsgMutation.isPending) return;
    sendMsgMutation.mutate(text);
  };

  // Scroll to bottom when messages update or panel opens
  useEffect(() => {
    if (csOpen && msgEndRef.current) {
      msgEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [pmMessages, csOpen]);

  // Count unread admin replies
  const unreadCount = pmMessages?.filter(m => m.isFromAdmin && !m.readByUser).length ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">聊天大厅</h1>
            <p className="text-muted-foreground text-sm mt-1">选择一个聊天室加入</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="button-admin"
                onClick={() => setLocation("/admin")}
              >
                <Shield className="w-4 h-4 mr-1.5" />
                管理后台
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              data-testid="button-logout"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              退出
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : rooms && rooms.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                data-testid={`card-room-${room.id}`}
                onClick={() => handleRoomClick(room)}
                className="group text-left bg-card border border-card-border rounded-lg p-5 hover-elevate transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h2 className="font-semibold text-base leading-tight">{room.name}</h2>
                        {room.hasPassword && !isAdmin && (
                          <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                      </div>
                      {room.description && (
                        <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">{room.description}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {room.hasActiveBet && (
                    <Badge variant="default" className="text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground mr-1.5 animate-pulse inline-block" />
                      点餐进行中
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    聊天室
                  </span>
                  {room.hasPassword && !isAdmin && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      需要密码
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium text-muted-foreground">暂无聊天室</p>
            <p className="text-sm text-muted-foreground mt-1">请等待管理员创建聊天室</p>
          </div>
        )}
      </main>

      {/* Password Dialog */}
      <Dialog open={!!pendingRoom} onOpenChange={(open) => { if (!open) { setPendingRoom(null); setPasswordInput(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              输入房间密码
            </DialogTitle>
            <DialogDescription>
              「{pendingRoom?.name}」需要密码才能进入
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 mt-2">
            <Input
              data-testid="input-room-password"
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="请输入房间密码"
              autoFocus
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setPendingRoom(null); setPasswordInput(""); }}
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                data-testid="button-enter-room"
                disabled={!passwordInput || enterMutation.isPending}
              >
                {enterMutation.isPending ? "验证中..." : "进入"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Service Floating Widget — only for non-admin users */}
      {!isAdmin && (
        <div className="fixed bottom-6 right-4 z-50 flex flex-col items-end gap-2">
          {/* Chat Panel */}
          {csOpen && (
            <div
              data-testid="cs-panel"
              className="w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ height: "420px" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <Headphones className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">在线客服</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">有问题随时联系我们</p>
                  </div>
                </div>
                <button
                  data-testid="button-cs-close"
                  onClick={() => setCsOpen(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {/* Welcome message */}
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 bg-muted text-sm">
                    👋 您好！有什么可以帮您的？
                  </div>
                </div>

                {pmLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  pmMessages?.map((msg) => (
                    <div
                      key={msg.id}
                      data-testid={`cs-msg-${msg.id}`}
                      className={`flex ${msg.isFromAdmin ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                          msg.isFromAdmin
                            ? "bg-muted text-foreground rounded-tl-sm"
                            : "bg-primary text-primary-foreground rounded-tr-sm"
                        }`}
                      >
                        {msg.isFromAdmin && (
                          <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                            {msg.adminUsername ? `客服 ${msg.adminUsername}` : "客服"}
                          </p>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                <div ref={msgEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSendCs}
                className="flex items-end gap-2 px-3 py-2.5 border-t border-border flex-shrink-0"
              >
                <Textarea
                  data-testid="input-cs-message"
                  value={csInput}
                  onChange={(e) => setCsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendCs(e as any);
                    }
                  }}
                  placeholder="输入消息…"
                  className="flex-1 resize-none text-sm min-h-[36px] max-h-24 py-2 px-3 rounded-xl"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  data-testid="button-cs-send"
                  disabled={!csInput.trim() || sendMsgMutation.isPending}
                  className="w-8 h-8 rounded-xl shrink-0"
                >
                  {sendMsgMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />
                  }
                </Button>
              </form>
            </div>
          )}

          {/* Floating Toggle Button */}
          <button
            data-testid="button-cs-toggle"
            onClick={() => setCsOpen(v => !v)}
            className="w-13 h-13 rounded-full bg-primary shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all relative"
            style={{ width: 52, height: 52 }}
            aria-label="联系客服"
          >
            {csOpen
              ? <X className="w-5 h-5 text-primary-foreground" />
              : <Headphones className="w-5 h-5 text-primary-foreground" />
            }
            {!csOpen && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
