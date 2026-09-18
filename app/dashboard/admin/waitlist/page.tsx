import Link from "next/link"
import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listRequests, REQUEST_STATES, type RequestState, type WaitlistPage, type WaitlistRow } from "@/lib/marketing/waitlist-admin"
import { RowActions } from "./row-actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Waitlist | Anker Owner Console" }

/** What the console shows in the status column — a date, not just a word. */
function describe(row: WaitlistRow): string {
  if (row.accepted_at) return `Accepted ${new Date(row.accepted_at).toLocaleDateString("en-GB")}`
  if (row.status === "invited" && row.invite_expires_at) {
    const expiry = new Date(row.invite_expires_at)
    return expiry.getTime() < Date.now()
      ? `Invitation expired ${expiry.toLocaleDateString("en-GB")}`
      : `Invited — link valid to ${expiry.toLocaleDateString("en-GB")}`
  }
  if (row.status === "revoked") return "Revoked"
  if (row.status === "approved") return "Approved — not yet invited"
  if (row.status === "declined") return "Declined"
  return "Pending review"
}

export default async function WaitlistAdminPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  if (!(await isAdminUser()).isAdmin) redirect("/dashboard")
  const input = await searchParams
  let data: WaitlistPage | null = null
  try { data = await listRequests(input) } catch { data = null }

  const tab = (label: string, state: RequestState | null) => {
    const active = (data?.status ?? null) === state
    const count = state ? data?.counts[state] ?? 0 : Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0)
    return <Link key={label} href={state ? `?status=${state}` : "?"} aria-current={active ? "page" : undefined}
      className={`min-h-11 border px-4 py-3 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-foreground/30"}`}>
      {label} <span className="tabular-nums">{count}</span>
    </Link>
  }

  return <div className="mx-auto max-w-6xl px-6 py-10">
    <Link href="/dashboard/admin" className="text-sm underline">Owner Console</Link>
    <h1 className="mt-5 font-serif text-4xl">Anker waitlist</h1>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Access requests from the public website. Joining creates no account. Sending an invitation emails a single-use link, valid only for that applicant’s own address — it cannot be forwarded to someone else, and it can be revoked until it is used.</p>
    {!data ? <div role="alert" className="mt-8 border p-5">The list could not be loaded. Check the waitlist migration and database connection, then <Link href="/dashboard/admin/waitlist" className="underline">reload</Link>.</div> : <>
      <p className="mt-2 text-xs text-muted-foreground">Links expire after {data.ttl.default} days by default (WAITLIST_INVITE_TTL_DAYS). Override it per send below, between {data.ttl.min} and {data.ttl.max} days.</p>
      <nav aria-label="Filter by status" className="mt-8 flex flex-wrap gap-2">
        {tab("All", null)}
        {REQUEST_STATES.map(state => tab(state[0].toUpperCase() + state.slice(1), state))}
      </nav>
      <div className="mt-6 overflow-x-auto border"><table className="w-full text-left text-sm"><caption className="sr-only">Waitlist requests, page {data.page}</caption><thead><tr>{["Name / email", "Persona", "Company / fund", "Status", "Source", "Received", "Actions"].map(label => <th key={label} scope="col" className="whitespace-nowrap p-4">{label}</th>)}</tr></thead><tbody>
        {data.rows.map(row => <tr key={row.id} className="border-t align-top">
          <td className="p-4"><p>{row.name}</p><a className="underline" href={`mailto:${row.email}`}>{row.email}</a></td>
          <td className="p-4">{row.persona || "—"}</td>
          <td className="p-4">{row.company || "—"}</td>
          <td className="p-4">{describe(row)}{row.invite_error && <p role="alert" className="mt-2 border-l-2 border-red-600 pl-2 text-xs">Last send failed. No access was granted.</p>}</td>
          <td className="max-w-60 break-words p-4">{row.referral_source || "direct"}</td>
          <td className="whitespace-nowrap p-4">{new Date(row.created_at).toLocaleDateString("en-GB")}</td>
          <td className="p-4"><RowActions id={row.id} status={row.status} ttl={data.ttl} /></td>
        </tr>)}
        {!data.rows.length && <tr><td colSpan={7} className="p-8 text-muted-foreground">No requests on this page.</td></tr>}
      </tbody></table></div>
      <nav aria-label="Waitlist pages" className="mt-5 flex items-center gap-6">{data.page > 1 && <Link className="min-h-11 py-3 underline" href={`?page=${data.page - 1}${data.status ? `&status=${data.status}` : ""}`}>Previous</Link>}<span>Page {data.page}</span>{data.hasMore && <Link className="min-h-11 py-3 underline" href={`?page=${data.page + 1}${data.status ? `&status=${data.status}` : ""}`}>Next</Link>}</nav>
    </>}
  </div>
}
