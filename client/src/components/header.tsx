import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Coins, ChevronLeft, Mail, Send, X, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import logoImg from "@assets/logo_v2.png";

type HeaderProps = {
  showBack?: boolean;
  title?: string;
};

type PmMessage = {
  id: string;
  content: string;
  isFromAdmin: boolean;
  adminUsername: string | null;
  createdAt: string;
};

export default function Header({ showBack, title }: HeaderProps) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pmOpen, setPmOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery<PmMessage[]>({
    queryKey: ["/api/private-messages"],
    enabled: pmOpen && !!user && !isAdmin,
    refetchInterval: pmOpen ? 5000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", "/api/private-messages", { content }),
    onSuccess: () => {
      setMsgText("");
      queryClient.invalidateQueries({ queryKey: ["/api/private-messages"] });
    },
    onError: (e: Error) => toast({ title: "发送失败", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (messages?.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (!user) {
    return (
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 shrink-0" data-testid="link-home">
            <img src={logoImg} alt="梦幻舞台" className="w-10 h-10 object-contain" />
            <span className="font-bold text-base hidden sm:block">梦幻舞台</span>
          </button>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-back"
                onClick={() => setLocation("/")}
                className="shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <button
              onClick={() => setLocation("/")}
              className="flex items-center gap-1.5 shrink-0"
              data-testid="link-home"
            >
              <img src={logoImg} alt="梦幻舞台" className="w-10 h-10 object-contain" />
              <span className="font-bold text-base hidden sm:block">梦幻舞台</span>
            </button>
            {title && (
              <span className="text-foreground text-sm font-medium truncate max-w-[120px] sm:max-w-none sm:text-muted-foreground">
                <span className="hidden sm:inline">/ </span>{title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isAdmin && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-open-pm"
                  onClick={() => setPmOpen(true)}
                  title="私信管理员"
                >
                  <Mail className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-profile"
                  onClick={() => setLocation("/profile")}
                  title="我的"
                >
                  <UserCircle className="w-5 h-5" />
                </Button>
              </>
            )}
            <div
              className="flex items-center gap-1.5 bg-card border border-card-border rounded-md px-3 py-1.5"
              data-testid="text-balance"
            >
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-semibold tabular-nums">{user.balance.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
                  {user.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:block" data-testid="text-username">
                {user.username}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* PM Slide-in Panel */}
      {pmOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setPmOpen(false)}
          />
          <div className="relative bg-background border-l border-border w-full max-w-sm flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">私信管理员</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-close-pm"
                onClick={() => setPmOpen(false)}
                className="h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading ? (
                <div className="flex justify-center items-center h-20 text-muted-foreground text-sm">加载中...</div>
              ) : !messages?.length ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm py-12 text-center">
                  <Mail className="w-10 h-10 mb-3 opacity-20" />
                  <p>还没有消息</p>
                  <p className="text-xs mt-1">在下方输入内容联系管理员</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.isFromAdmin ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                        msg.isFromAdmin
                          ? "bg-muted text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                      data-testid={`user-pm-msg-${msg.id}`}
                    >
                      {msg.isFromAdmin && (
                        <p className="text-xs font-semibold opacity-70 mb-0.5">管理员</p>
                      )}
                      <p className="break-words">{msg.content}</p>
                      <p className={`text-xs mt-1 opacity-60 ${!msg.isFromAdmin ? "text-right" : ""}`}>
                        {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <Textarea
                data-testid="input-pm-message"
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="输入消息… (Enter发送, Shift+Enter换行)"
                className="resize-none text-sm min-h-[60px] max-h-[120px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && msgText.trim()) {
                    e.preventDefault();
                    sendMutation.mutate(msgText.trim());
                  }
                }}
              />
              <Button
                data-testid="button-send-pm"
                size="icon"
                className="self-end shrink-0"
                disabled={!msgText.trim() || sendMutation.isPending}
                onClick={() => msgText.trim() && sendMutation.mutate(msgText.trim())}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
