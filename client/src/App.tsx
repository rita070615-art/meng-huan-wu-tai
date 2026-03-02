import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import AuthPage from "@/pages/auth";
import LobbyPage from "@/pages/lobby";
import RoomPage from "@/pages/room";
import AdminPage from "@/pages/admin";
import SetupTotpPage from "@/pages/setup-totp";
import VerifyTotpPage from "@/pages/verify-totp";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, adminOnly }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Redirect to="/auth" />;
  if (adminOnly && !isAdmin) return <Redirect to="/" />;

  if (user.role !== "admin") {
    if (!user.totpEnabled) return <Redirect to="/setup-totp" />;
    if (!user.totpVerified) return <Redirect to="/verify-totp" />;
  }

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
  if (user.totpEnabled && user.totpVerified) return <Redirect to="/" />;
  if (user.totpEnabled && !user.totpVerified) return <Redirect to="/verify-totp" />;
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DarkModeProvider>
          <Toaster />
          <Router />
        </DarkModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
