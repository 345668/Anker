import { getLpMembershipsForEmail } from "@/lib/portfolio/data-room";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavModeShell } from "@/components/shell/nav-mode-shell";
import { CommandPalette } from "@/components/shell/command-palette";
import { isAdminUser } from "@/lib/auth/require-admin";
import { resolveActiveMembership } from "@/lib/org/active";
import { headers } from "next/headers";
import { getEffective } from "@/lib/entitlements";
import { featureForPath } from "@/lib/entitlements/routes";
import { EntitlementBanner, ModuleNotIncluded } from "@/components/shell/entitlement-notice";

// Dashboard touches a live DB (PGlite locally, Neon in prod) — never prerender.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  // Admin status uses the same server-controlled sources as route guards:
  //   1) lib/auth/admin.ts ADMIN_EMAILS allowlist
  //   2) public.users.is_admin === true on Neon (matched by authenticated id)
  // Sidebar/nav rendering must match the server's gate or admins via #1/#3
  // see no Admin link even though /dashboard/admin/* would let them in.
  const { isAdmin } = await isAdminUser();

  // Persona-scoped navigation. Owners (and users with no membership yet) see
  // the full nav; otherwise the sidebar is filtered to the active workspace's
  // persona — founder / vc / lp. `null` persona also falls through to "all".
  const { active } = await resolveActiveMembership(user.id);
  const ownLp = !active && user.email_confirmed_at && user.email ? await getLpMembershipsForEmail(user.email) : [];
  const persona = active?.persona ?? (ownLp.length ? "lp" : null);

  // The workspace's plan and state. Open by default: a workspace with no plan sees everything. The lookup fails open.
  const entitlements = active ? await getEffective(active.orgId) : null;
  const feature = featureForPath((await headers()).get("x-pathname"));
  const blocked = entitlements && feature && !entitlements.features[feature] ? feature : null;

  return (
    <div className="platform-workspace">
      {/* Shared operational shell with role-specific work areas. */}
      <NavModeShell
        user={user}
        isAdmin={isAdmin}
        persona={persona}
      >
        {entitlements && <EntitlementBanner e={entitlements} />}
        {blocked ? <ModuleNotIncluded feature={blocked} /> : children}
      </NavModeShell>

      {/* Global ⌘K command palette — persona-scoped, shared by both chromes. */}
      <CommandPalette persona={persona} />
    </div>
  );
}
