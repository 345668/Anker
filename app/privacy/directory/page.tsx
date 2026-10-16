import Link from "next/link"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investor directory notice — Anker", alternates: { canonical: "https://www.an-ker.de/privacy/directory" } }

const KIND: Record<string, string> = {
  vendor_purchase: "data suppliers (lists we obtained from commercial providers)",
  partner_list: "partners who shared contact lists with us",
  customer_upload: "contacts our customers uploaded",
  public_web: "public web pages and public professional profiles",
  webinar_signup: "people who signed up for our events",
  seed: "investor information we compiled ourselves",
  crm_sync: "contact lists synchronised from a customer's contact tool",
  unknown: "sources we are still documenting",
}

async function sources(): Promise<{ kind: string; n: number }[]> {
  try {
    return (await sql`SELECT kind, count(*)::int AS n FROM directory_sources WHERE status <> 'withdrawn' GROUP BY 1 ORDER BY 2 DESC`) as any[]
  } catch { return [] }
}

export default async function DirectoryNoticePage() {
  const kinds = await sources()
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-14 text-neutral-900">
      <p className="text-sm"><Link href="/privacy" className="underline">← Privacy policy</Link></p>
      <h1 className="mt-4 text-3xl font-semibold">Anker’s investor directory: information for the people in it</h1>
      <p className="mt-3 text-neutral-700">You are reading this because your business contact details may be in the investor directory that Anker operates, or because we wrote to you. This page explains what we hold, where it comes from, why, and what you can do. It is a notice under Article 14 of the GDPR.</p>

      <h2 className="mt-8 text-xl font-semibold">Who is responsible</h2>
      <p className="mt-2">Anker, reachable at <a className="underline" href="mailto:vc@an-ker.de">vc@an-ker.de</a>, decides what goes into the directory and why.</p>

      <h2 className="mt-8 text-xl font-semibold">What we hold</h2>
      <p className="mt-2">Business information about investors and the firms they work for: your name, job title, firm, business email address and phone number if we have them, your LinkedIn profile address, your location, and what you invest in (stages, sectors, cheque sizes, regions). We do not hold information about your private life, and we do not knowingly hold special categories of data.</p>

      <h2 className="mt-8 text-xl font-semibold">Where it comes from</h2>
      <p className="mt-2">We did not collect it from you directly. It comes from these kinds of sources{kinds.length ? ", at the date of this page" : ""}:</p>
      {kinds.length > 0 && <ul className="mt-2 list-disc pl-6">{kinds.map((k) => <li key={k.kind}>{KIND[k.kind] ?? k.kind} ({k.n} {k.n === 1 ? "source" : "sources"})</li>)}</ul>}
      <p className="mt-2">We record the origin and the permitted use of every source, and we do not use a source for anything its terms do not allow.</p>

      <h2 className="mt-8 text-xl font-semibold">Why, and on what basis</h2>
      <p className="mt-2">We use it to help founders find investors who invest in what they build, and to help funds find investors in their own funds, through the Anker platform. We rely on legitimate interests (Article 6(1)(f)): the interest of founders and funds in finding suitable investors, and your professional interest in receiving relevant opportunities, balanced against your rights. You can object at any time, see below. When a customer writes to you through Anker, they do so as the sender; every such email carries a one-click unsubscribe, and unsubscribing stops all Anker outreach to you, on every channel.</p>

      <h2 className="mt-8 text-xl font-semibold">Who sees it</h2>
      <p className="mt-2">Customers of the Anker platform, within the platform, when their search matches you, and the service providers that run Anker for us, listed at <Link className="underline" href="/privacy/subprocessors">our sub-processor page</Link>. Some of them are outside the European Economic Area, which the page states for each.</p>

      <h2 className="mt-8 text-xl font-semibold">How long we keep it</h2>
      <p className="mt-2">While the source allows it and you have not objected. Records nobody has used or updated for 36 months are reviewed. If a source is withdrawn, its people are removed after 30 days. If you ask us to erase your data, we delete it and keep only an irreversible code, which holds no name, so that you are not added again.</p>

      <h2 className="mt-8 text-xl font-semibold">Your rights</h2>
      <p className="mt-2">You can ask what we hold about you, have it corrected, restricted or erased, and object to our use of it. <Link className="underline" href="/privacy/request">Make a request here</Link>; we confirm it is you through your email address, and answer within 30 days. You may also complain to your data protection authority. We do not make decisions about you that have legal or similarly significant effects by automated means.</p>
      <p className="mt-8 text-sm text-neutral-600">This notice describes our practice and is kept in step with our records of sources and providers. Questions: <a className="underline" href="mailto:vc@an-ker.de">vc@an-ker.de</a>.</p>
    </main>
  )
}
