/**
 * client/src/App.tsx  — ROUTING PATCH
 *
 * This shows the changes to make to the existing App.tsx.
 * The existing file uses Wouter for routing.
 *
 * KEY CHANGES:
 *  1. Add /auth route pointing to new AuthPage
 *  2. Add /onboarding route pointing to new OnboardingPage
 *  3. Wrap /app/* routes in <OnboardingGuard> so incomplete
 *     users are redirected to /onboarding before they can
 *     access the app
 *  4. Redirect authenticated users away from /auth
 *
 * ──────────────────────────────────────────────────────────────
 * PASTE THIS into your existing App.tsx, adjusting imports to
 * match your actual file paths.
 * ──────────────────────────────────────────────────────────────
 */

import { Switch, Route, Redirect, useLocation } from "wouter";
import { useAuth } from "./hooks/use-auth";

// Pages — existing
import Landing from "./pages/Landing";
// import ... all your existing pages

// Pages — new
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";

// ─── Guard: redirect unauthenticated users to /auth ───────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) return <AppLoadingScreen />;
  if (!isAuthenticated) return <Redirect to={`/auth?next=${encodeURIComponent(location)}`} />;
  return <>{children}</>;
}

// ─── Guard: redirect incomplete-onboarding users to /onboarding ──────────────
// Only runs inside /app/* routes

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <AppLoadingScreen />;
  if (user && !user.onboardingCompleted) {
    return <Redirect to="/onboarding" />;
  }
  return <>{children}</>;
}

// ─── Guard: redirect authenticated users away from /auth ─────────────────────

function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return <AppLoadingScreen />;
  if (isAuthenticated) {
    // Send to onboarding if needed, otherwise dashboard
    return <Redirect to={user?.onboardingCompleted ? "/app/dashboard" : "/onboarding"} />;
  }
  return <>{children}</>;
}

// ─── Loading screen ───────────────────────────────────────────────────────────

function AppLoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "rgb(11,11,15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        width: 32, height: 32,
        border: "2px solid rgba(142,132,247,0.2)",
        borderTopColor: "#8e84f7",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── App router ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Landing} />

      {/* Auth — guests only (redirect authenticated users to dashboard) */}
      <Route path="/auth">
        <GuestOnlyRoute>
          <AuthPage />
        </GuestOnlyRoute>
      </Route>

      {/*
        Legacy Replit Auth redirect — keep this so existing bookmarks work.
        /api/login still works, but /auth is the new primary entry point.
      */}
      <Route path="/login">
        <Redirect to="/auth" />
      </Route>

      {/* Onboarding — authenticated users who haven't completed it */}
      <Route path="/onboarding">
        <ProtectedRoute>
          <OnboardingPage />
        </ProtectedRoute>
      </Route>

      {/* App routes — protected + onboarding-gated */}
      <Route path="/app/:rest*">
        <ProtectedRoute>
          <OnboardingGuard>
            {/* Your existing AppLayout wrapping all /app/* routes goes here.
                Example:
                <AppLayout>
                  <Switch>
                    <Route path="/app/dashboard" component={Dashboard} />
                    <Route path="/app/investors" component={Investors} />
                    <Route path="/app/my-startup" component={MyStartup} />
                    <Route path="/app/matching" component={Matching} />
                    <Route path="/app/deal-rooms" component={DealRooms} />
                    <Route path="/app/tools" component={FinancialTools} />
                    <Route path="/app/forecasting" component={ForecastingStudio} />
                    <Route path="/app/dd-checklist" component={DDChecklist} />
                    <Route path="/app/data-room-checklist" component={DataRoomChecklist} />
                    <Route path="/app/eoy-review" component={EOYReview} />
                    <Route path="/app/matching-logs" component={MatchingLogs} />
                    <Route path="/app/settings" component={Settings} />
                  </Switch>
                </AppLayout>
            */}
            <div>Replace this with your AppLayout</div>
          </OnboardingGuard>
        </ProtectedRoute>
      </Route>

      {/* Admin routes — admin only */}
      <Route path="/admin/:rest*">
        <ProtectedRoute>
          {/* Add isAdmin check here if needed */}
          <div>Admin routes here</div>
        </ProtectedRoute>
      </Route>

      {/* 404 */}
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

/*
──────────────────────────────────────────────────────────
SUMMARY OF CHANGES TO MAKE IN YOUR EXISTING App.tsx:

1. Import useAuth from "./hooks/use-auth"
2. Import AuthPage from "./pages/AuthPage"
3. Import OnboardingPage from "./pages/OnboardingPage"
4. Add ProtectedRoute, OnboardingGuard, GuestOnlyRoute components
5. Add routes:
     <Route path="/auth"><GuestOnlyRoute><AuthPage /></GuestOnlyRoute></Route>
     <Route path="/onboarding"><ProtectedRoute><OnboardingPage /></ProtectedRoute></Route>
6. Wrap existing /app/* route with both ProtectedRoute and OnboardingGuard
7. Keep the existing /api/login redirect for backward compatibility
──────────────────────────────────────────────────────────
*/
