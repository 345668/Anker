import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"

/**
 * Moved to the platform portal.
 *
 * There were three AI-config surfaces: this one, a ComingSoon stub in
 * company-portal that announced its own replacement, and the real page in the
 * SAIL portal — which had since grown API-key management, Qwen workspace ids,
 * and a usage panel this page never had. All three wrote the same
 * system_settings/ai_router_v1 row, so they could disagree about what the
 * platform was configured to do while all being "right".
 *
 * The router config is platform operations, not tenant administration: it
 * affects every workspace at once, and nothing about it belongs on a surface a
 * tenant owner reaches. So the page goes and the portal keeps it.
 *
 * What stays here deliberately:
 *   • /api/admin/ai-config — still read and written by the tenant's own
 *     Settings → API Keys and by the assistant's provider badge. It is an API
 *     the tenant uses, not an ops console.
 *   • /api/admin/system — the provider re-probe, now called by the portal
 *     through its proxy allowlist, because the thing being reset lives in this
 *     process rather than in a table.
 *
 * PORTAL_URL is optional: without it this still explains where the page went,
 * which is better than a dead link to a host that may not exist in every
 * environment.
 */

export const dynamic = "force-dynamic"
export const metadata = { title: "AI config — moved" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const portal = process.env.PORTAL_URL?.replace(/\/$/, "") ?? null
  const target = portal ? `${portal}/ai-config` : null

  return (
    <AdminShell
      eyebrow="Admin · AI config"
      title="This moved to the platform portal."
      description="The AI router is platform-wide: one provider chain, one set of keys, one task switchboard for every workspace. It is administered in the portal now, alongside a record of what the router actually did."
      email={email}
    >
      <div className="rounded-lg border border-foreground/10 p-5 text-sm">
        {target ? (
          <p>
            Open{" "}
            <a className="underline" href={target} target="_blank" rel="noreferrer">
              {target}
            </a>
            .
          </p>
        ) : (
          <p>
            Open <span className="font-medium">AI config</span> in the platform portal. (Set{" "}
            <code>PORTAL_URL</code> to turn this into a link.)
          </p>
        )}
        <p className="mt-3 text-foreground/70">
          Provider force, per-task model overrides, task on/off switches and the provider re-probe
          are all there, plus API-key management and a 24-hour usage panel — calls, failures,
          how often the chain failed over to a fallback provider, and latency — which this page
          never had.
        </p>
        <p className="mt-3 text-foreground/70">
          Your own provider keys for this workspace are unaffected and still live in{" "}
          <a className="underline" href="/dashboard/settings">
            Settings
          </a>
          .
        </p>
      </div>
    </AdminShell>
  )
}
