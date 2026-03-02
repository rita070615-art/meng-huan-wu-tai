import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Coins, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import logoImg from "@assets/logo_v2.png";

type HeaderProps = {
  showBack?: boolean;
  title?: string;
};

export default function Header({ showBack, title }: HeaderProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
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

        {user && (
          <div className="flex items-center gap-3">
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
              <span
                className="text-sm font-medium hidden sm:block"
                data-testid="text-username"
              >
                {user.username}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
