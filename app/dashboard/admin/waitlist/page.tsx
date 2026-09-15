import Link from "next/link"
import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export const metadata = { title: "Waitlist | Anker Owner Console" }
export default async function WaitlistAdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!(await isAdminUser()).isAdmin) redirect("/dashboard")
  const input = await searchParams
  const page = Math.max(1, Math.min(10000, Number.parseInt(input.page || "1",10) || 1))
  let rows: any[] = []
  let unavailable = false
  try {
    rows = await sql`SELECT name,email,persona,company,status,referral_source,created_at
      FROM early_access_requests WHERE email_key IS NOT NULL
      ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ${(page-1)*50}`
  } catch { unavailable = true }
  return <div className="mx-auto max-w-6xl px-6 py-10">
    <Link href="/dashboard/admin" className="text-sm underline">Owner Console</Link>
    <h1 className="mt-5 font-serif text-4xl">Anker waitlist</h1>
    <p className="mt-3 text-sm text-muted-foreground">Access requests from the public website. Joining does not create an account or send an invitation.</p>
    {unavailable ? <div role="alert" className="mt-8 border p-5">The list could not be loaded. Check the waitlist migration and database connection, then <Link href="/dashboard/admin/waitlist" className="underline">reload</Link>.</div> : <>
      <div className="mt-8 overflow-x-auto border"><table className="w-full text-left text-sm"><caption className="sr-only">Waitlist requests, page {page}</caption><thead><tr>{["Name / email","Persona","Company / fund","Status","Source","Received"].map(label=><th key={label} scope="col" className="whitespace-nowrap p-4">{label}</th>)}</tr></thead><tbody>
        {rows.slice(0,50).map(row=><tr key={row.email} className="border-t"><td className="p-4"><p>{row.name}</p><a className="underline" href={`mailto:${row.email}`}>{row.email}</a></td><td className="p-4">{row.persona || "—"}</td><td className="p-4">{row.company || "—"}</td><td className="p-4">{row.status}</td><td className="max-w-60 break-words p-4">{row.referral_source || "direct"}</td><td className="whitespace-nowrap p-4">{new Date(row.created_at).toLocaleDateString("en-GB")}</td></tr>)}
        {!rows.length && <tr><td colSpan={6} className="p-8 text-muted-foreground">No requests on this page.</td></tr>}
      </tbody></table></div>
      <nav aria-label="Waitlist pages" className="mt-5 flex items-center gap-6">{page>1 && <Link className="min-h-11 py-3 underline" href={`?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{rows.length>50 && <Link className="min-h-11 py-3 underline" href={`?page=${page+1}`}>Next</Link>}</nav>
    </>}
  </div>
}
