import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@shared/models/auth";
import { apiRequest } from "@/lib/queryClient";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  return response.json();
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  confirmPassword?: string;
  firstName?: string;
  lastName?: string;
}

interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "founder" | "investor";
}

export function useAuth() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // ── Existing login mutation (kept for backward compat) ────────────────────
  const loginMutation = useMutation({
    mutationFn: async (data: LoginData) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/auth/user"], userData);
    },
  });

  // ── Register mutation (kept for backward compat) ──────────────────────────
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/auth/user"], userData);
    },
  });

  // ── New signup mutation (3-step wizard, accepts role) ─────────────────────
  const signupMutation = useMutation({
    mutationFn: async (data: SignupData) => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Signup failed");
      }
      return res.json();
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/auth/user"], userData);
      navigate("/app/onboarding");
    },
  });

  // ── Logout mutation ───────────────────────────────────────────────────────
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
    },
  });

  // ── OAuth redirects ───────────────────────────────────────────────────────
  const loginWithGoogle = () => { window.location.href = "/api/auth/google"; };
  const loginWithGitHub = () => { window.location.href = "/api/auth/github"; };
  const loginWithLinkedIn = () => { window.location.href = "/api/auth/linkedin"; };

  // ── Derived state ─────────────────────────────────────────────────────────
  const isAuthenticated = !!user;
  const isFounder = user?.userType === "founder";
  const isInvestor = user?.userType === "investor";
  const isAdmin = !!user?.isAdmin;
  const needsOnboarding = isAuthenticated && !user?.onboardingCompleted;
  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName || (user?.email?.split("@")[0]) || "User";

  return {
    // ── User state ──────────────────────────────────────────────────────────
    user,
    isLoading,
    isAuthenticated,
    isFounder,
    isInvestor,
    isAdmin,
    needsOnboarding,
    displayName,
    refetch,

    // ── Backward-compat function API (used by many existing pages) ──────────
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,

    // ── New mutation object API (for AuthPage wizard) ───────────────────────
    loginMut: loginMutation,
    signup: signupMutation,
    logoutMut: logoutMutation,

    // ── OAuth ───────────────────────────────────────────────────────────────
    loginWithGoogle,
    loginWithGitHub,
    loginWithLinkedIn,
  };
}
