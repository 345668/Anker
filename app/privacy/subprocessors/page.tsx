import Link from "next/link"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export const metadata = { title: "Sub-processors — Anker", alternates: { canonical: "https://www.an-ker.de/privacy/subprocessors" } }

const REGION: Record<string, string> = { eu: "European Union", us: "United States", sg: "Singapore", self: "Anker’s own infrastructure", other: "Other", unknown: "Not yet confirmed" }
const ROLE: Record<string, string> = { ai_model: "AI model provider", hosting: "Hosting", database: "Database", storage: "File storage", email: "Email delivery", payments: "Payments", auth: "Sign-in", self_hosted: "Self-hosted model" }

async function rows(): Promise<any[]> {
  try { return (await sql`SELECT slug, provider, role, purpose, region, region_basis, data_classes, last_verified FROM ai_subprocessors WHERE active AND public ORDER BY role, provider`) as any[] } catch { return [] }
}

export default async function SubprocessorsPage() {
  const list = await rows()
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-14 text-neutral-900">
      <p className="text-sm"><Link href="/privacy" className="underline">← Privacy policy</Link></p>
      <h1 className="mt-4 text-3xl font-semibold">Sub-processors</h1>
      <p className="mt-3 text-neutral-700">These are the companies that process personal data for Anker in order to run the platform. The list is generated from the register we keep, so it names what is actually in use. Where a region is marked “read from configuration”, we have inferred it from how the service is set up and have not yet confirmed it with the provider.</p>
      <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3 font-medium">Provider</th><th className="pr-3 font-medium">What for</th><th className="pr-3 font-medium">Where</th><th className="font-medium">Data</th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.slug} className="border-b border-neutral-200 align-top">
            <td className="py-2 pr-3"><strong>{r.provider}</strong><br /><span className="text-neutral-600">{ROLE[r.role] ?? r.role}</span></td>
            <td className="pr-3">{r.purpose}</td>
            <td className="pr-3">{REGION[r.region] ?? r.region}{r.region !== "unknown" && r.region !== "self" && r.region_basis === "inferred" ? <><br /><span className="text-neutral-600">read from configuration</span></> : null}</td>
            <td>{(r.data_classes ?? []).join(", ")}</td>
          </tr>))}</tbody></table></div>
      {list.length === 0 && <p className="mt-4">The list is temporarily unavailable. Write to <a className="underline" href="mailto:vc@an-ker.de">vc@an-ker.de</a> for the current register.</p>}
      <p className="mt-6 text-sm text-neutral-600">A workspace can restrict AI processing to providers in the EU. Questions: <a className="underline" href="mailto:vc@an-ker.de">vc@an-ker.de</a>.</p>
    </main>
  )
}
