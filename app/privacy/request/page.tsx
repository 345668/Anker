import Link from "next/link"
import { makeFormToken } from "@/lib/privacy/dsar"

export const dynamic = "force-dynamic"
export const metadata = { title: "Privacy request — Anker", robots: { index: false, follow: true }, alternates: { canonical: "https://www.an-ker.de/privacy/request" } }

export default async function PrivacyRequestPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams
  const field = "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900"
  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-14 text-neutral-900">
      <p className="text-sm"><Link href="/privacy" className="underline">← Privacy policy</Link></p>
      <h1 className="mt-4 text-3xl font-semibold">Your data in our investor directory</h1>
      <p className="mt-3 text-neutral-700">Anker keeps a directory of investors, with business contact details gathered from lists, partners and public sources. If you are in it, you can ask what we hold, have it corrected, restricted or erased, or object to our use of it. We answer within 30 days.</p>
      {sent && <p role="status" className="mt-6 rounded-md border border-neutral-300 p-4">Thank you. If the address is valid, we have sent you an email with a link to confirm that the request is yours. Nothing happens until you confirm. This message is the same whether or not we hold data about you.</p>}
      {error && <p role="alert" className="mt-6 rounded-md border border-red-600 p-4 text-red-700">{error}</p>}
      <form method="post" action="/api/public/privacy-request" className="mt-8 space-y-5">
        <input type="hidden" name="t" value={makeFormToken()} />
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <fieldset>
          <legend className="font-medium">What would you like us to do?</legend>
          {([["access", "Tell me what you hold about me"], ["rectification", "Correct my data"], ["erasure", "Erase my data"], ["restriction", "Keep my data but stop using it"], ["objection", "Stop contacting me and remove me (objection)"]] as const).map(([v, l], i) => (
            <label key={v} className="mt-2 flex items-center gap-2"><input type="radio" name="kind" value={v} required defaultChecked={i === 0} /> {l}</label>
          ))}
        </fieldset>
        <label className="block font-medium">Your email address<input type="email" name="email" required maxLength={200} autoComplete="email" className={field} /></label>
        <label className="block font-medium">Your LinkedIn profile address (optional)<input type="url" name="linkedin" maxLength={300} placeholder="https://www.linkedin.com/in/…" className={field} /></label>
        <label className="block font-medium">Anything we should know (optional)<textarea name="note" maxLength={1000} rows={3} className={field} /></label>
        <button type="submit" className="rounded-md bg-neutral-900 px-5 py-2.5 text-white">Send request</button>
        <p className="text-sm text-neutral-600">We use your answers only to deal with this request. We will email you a link to confirm it is you, and keep the details for 30 days after we close the request. You can also write to <a className="underline" href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>.</p>
      </form>
    </main>
  )
}
