import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/header";
import { Users, MessageSquare, ChevronRight, LogOut, Shield } from "lucide-react";

type Room = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  hasActiveBet: boolean;
  createdAt: string;
};

export default function LobbyPage() {
  const { user, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
    refetchInterval: 10000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/auth");
    },
  });

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
                onClick={() => setLocation(`/room/${room.id}`)}
                className="group text-left bg-card border border-card-border rounded-lg p-5 hover-elevate transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base leading-tight">{room.name}</h2>
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
                      投注进行中
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    聊天室
                  </span>
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
    </div>
  );
}
