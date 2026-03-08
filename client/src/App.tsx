import { useEffect, useState, useRef } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, X, MessageCircle, ChevronDown } from "lucide-react";
import AuthPage from "@/pages/auth";
import LobbyPage from "@/pages/lobby";
import RoomPage from "@/pages/room";
import AdminPage from "@/pages/admin";
import SetupTotpPage from "@/pages/setup-totp";
import VerifyTotpPage from "@/pages/verify-totp";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";

type PmThread = {
  userId: string;
  userUsername: string;
  userNickname: string | null;
  unread: number;
  lastMessage: string;
  lastAt: string;
};

type PmMessage = {
  id: string;
  content: string;
  isFromAdmin: boolean;
  userNickname: string | null;
  userUsername: string;
  adminUsername: string | null;
  createdAt: string;
};

function AdminDmPopup() {
  const { user, isAdmin } = useAuth();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [selectedThread, setSelectedThread] = useState<PmThread | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads } = useQuery<PmThread[]>({
    queryKey: ["/api/admin/private-messages"],
    enabled: !!user && isAdmin,
    refetchInterval: 8000,
  });

  const unreadThreads = (threads || []).filter(t => t.unread > 0);
  const topThread = unreadThreads[0] || null;

  useEffect(() => {
    if (topThread && dismissed !== topThread.userId) {
      setSelectedThread(topThread);
    }
    if (!topThread) {
      setSelectedThread(null);
      setReplyOpen(false);
    }
  }, [topThread?.userId, topThread?.unread]);

  const { data: threadMessages } = useQuery<PmMessage[]>({
    queryKey: ["/api/admin/private-messages", selectedThread?.userId],
    queryFn: () => fetch(`/api/admin/private-messages/${selectedThread!.userId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedThread && replyOpen,
    refetchInterval: replyOpen ? 5000 : false,
  });

  useEffect(() => {
    if (threadMessages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [threadMessages]);

  const replyMutation = useMutation({
    mutationFn: ({ userId, content }: { userId: string; content: string }) =>
      apiRequest("POST", `/api/admin/private-messages/${userId}/reply`, { content }),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/private-messages"] });
      if (selectedThread) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/private-messages", selectedThread.userId] });
      }
    },
  });

  if (!isAdmin || !selectedThread || dismissed === selectedThread.userId) return null;

  const displayName = selectedThread.userNickname || selectedThread.userUsername;

  return (
    <div className="fixed bottom-4 right-4 z-[999] w-80 shadow-2xl rounded-xl border border-border bg-background flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/10 border-b border-border">
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <MessageCircle className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">
            {displayName} 的新消息
            {unreadThreads.length > 1 && (
              <span className="ml-1.5 text-[10px] bg-primary/20 text-primary px-1 rounded-full">
                +{unreadThreads.length - 1} 个对话
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{selectedThread.lastMessage}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setReplyOpen(v => !v)}
            className="p-1 hover:bg-muted rounded transition-colors"
            title={replyOpen ? "收起" : "展开回复"}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${replyOpen ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => { setDismissed(selectedThread.userId); setReplyOpen(false); }}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {replyOpen && (
        <>
          <div className="h-52 overflow-y-auto p-3 space-y-2">
            {threadMessages?.map(m => (
              <div key={m.id} className={`flex flex-col ${m.isFromAdmin ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-muted-foreground mb-0.5">
                  {m.isFromAdmin ? "管理员" : (m.userNickname || m.userUsername)}
                </span>
                <div className={`text-xs px-2.5 py-1.5 rounded-lg max-w-[85%] ${
                  m.isFromAdmin
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border border-border rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-border p-2 flex gap-2">
            <Textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder={`回复 ${displayName}...`}
              className="flex-1 text-xs resize-none h-16 min-h-0"
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
                  e.preventDefault();
                  replyMutation.mutate({ userId: selectedThread.userId, content: replyText.trim() });
                }
              }}
            />
            <Button
              size="icon"
              className="h-16 w-9 shrink-0"
              disabled={!replyText.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate({ userId: selectedThread.userId, content: replyText.trim() })}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ProtectedRoute({ component: Component, adminOnly }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading, isAdmin, totpVerified } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Redirect to="/auth" />;
  if (user.totpEnabled && !totpVerified) return <Redirect to="/verify-totp" />;
  if (adminOnly && !isAdmin) return <Redirect to="/" />;

  return <Component />;
}

function TotpSetupRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Redirect to="/auth" />;
  if (user.totpEnabled) return <Redirect to="/" />;
  return <Component />;
}

function TotpVerifyRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Redirect to="/auth" />;
  if (!user.totpEnabled) return <Redirect to="/setup-totp" />;
  if (user.totpVerified) return <Redirect to="/" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/setup-totp" component={() => <TotpSetupRoute component={SetupTotpPage} />} />
      <Route path="/verify-totp" component={() => <TotpVerifyRoute component={VerifyTotpPage} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
      <Route path="/" component={() => <ProtectedRoute component={LobbyPage} />} />
      <Route path="/room/:id" component={() => <ProtectedRoute component={RoomPage} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} adminOnly />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DarkModeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);
  return <>{children}</>;
}

function AppInner() {
  return (
    <>
      <Router />
      <AdminDmPopup />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DarkModeProvider>
          <Toaster />
          <AppInner />
        </DarkModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
