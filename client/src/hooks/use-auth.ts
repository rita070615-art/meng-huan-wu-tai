import { useQuery } from "@tanstack/react-query";

export type AuthUser = {
  id: string;
  username: string;
  balance: number;
  role: string;
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
  };
}
