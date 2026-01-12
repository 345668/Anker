import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
  adminOnly?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requireOnboarding = true,
  adminOnly = false 
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        window.location.href = "/auth";
      } else if (requireOnboarding && user && !user.onboardingCompleted) {
        window.location.href = "/app/onboarding";
      } else if (adminOnly && user && !user.isAdmin) {
        window.location.href = "/app/dashboard";
      }
    }
  }, [isLoading, isAuthenticated, user, requireOnboarding, adminOnly]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[rgb(142,132,247)] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requireOnboarding && user && !user.onboardingCompleted) {
    return null;
  }

  if (adminOnly && user && !user.isAdmin) {
    return null;
  }

  return <>{children}</>;
}
