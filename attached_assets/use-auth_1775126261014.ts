/**
 * client/src/hooks/use-auth.ts
 *
 * Drop-in replacement for the existing use-auth hook.
 * Adds: login(), signup(), logout() mutations plus OAuth redirect helpers.
 * Compatible with the existing useQuery("/api/auth/user") pattern.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserType = "founder" | "investor" | "admin";
export type AuthProvider = "replit" | "google" | "github" | "linkedin" | "local";

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  userType: UserType;
  provider: AuthProvider;
  onboardingCompleted: boolean;
  onboardingStep: number;
  isAdmin?: boolean;
  // Existing Replit Auth fields (keep for compatibility)
  username?: string;
  profileImageUrl?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "founder" | "investor";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // ── Fetch current user ────────────────────────────────────────────────────
  const {
    data: user,
    isLoading,
    error,
  } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (res.status === 401) return null as any;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });

  // ── Email/password login ──────────────────────────────────────────────────
  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Login failed");
      }
      return res.json() as Promise<{ user: User; redirectTo: string }>;
    },
    onSuccess: ({ user: freshUser, redirectTo }) => {
      queryClient.setQueryData(["/api/auth/user"], freshUser);
      navigate(redirectTo || (freshUser.onboardingCompleted ? "/app/dashboard" : "/onboarding"));
    },
  });

  // ── Email/password signup ─────────────────────────────────────────────────
  const signupMutation = useMutation({
    mutationFn: async (input: SignupInput) => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Signup failed");
      }
      return res.json() as Promise<{ user: User; redirectTo: string }>;
    },
    onSuccess: ({ user: freshUser }) => {
      queryClient.setQueryData(["/api/auth/user"], freshUser);
      navigate("/onboarding");
    },
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      navigate("/");
    },
  });

  // ── OAuth redirects ───────────────────────────────────────────────────────
  const loginWithGoogle = () => { window.location.href = "/api/auth/google"; };
  const loginWithGitHub = () => { window.location.href = "/api/auth/github"; };
  const loginWithLinkedIn = () => { window.location.href = "/api/auth/linkedin"; };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isAuthenticated = !!user;
  const isFounder = user?.userType === "founder";
  const isInvestor = user?.userType === "investor";
  const isAdmin = !!user?.isAdmin;
  const needsOnboarding = isAuthenticated && !user?.onboardingCompleted;

  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName || user?.username || user?.email?.split("@")[0] || "User";

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    isFounder,
    isInvestor,
    isAdmin,
    needsOnboarding,
    displayName,
    login: loginMutation,
    signup: signupMutation,
    logout: logoutMutation,
    loginWithGoogle,
    loginWithGitHub,
    loginWithLinkedIn,
  };
}
