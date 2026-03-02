import { useQuery } from "@tanstack/react-query";

export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  balance: number;
  role: string;
  totpEnabled: boolean;
  totpVerified: boolean;
};

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
  });

  return {
    user: user ?? null,
    isLoading,
    isAdmin: user?.role === "admin",
    isAuthenticated: !!user,
    totpEnabled: user?.totpEnabled ?? false,
    totpVerified: user?.totpVerified ?? false,
  };
}
