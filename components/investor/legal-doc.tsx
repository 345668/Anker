import { Fragment } from "react"
import { DRAFT_BANNER, TERMS_STATUS, type Section } from "@/lib/investor/terms-text"

const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))

/** The investor terms or notice as a page. Shows the draft banner for as long as the text is a draft. */
export function LegalDoc({ title, version, sections }: { title: string; version: string; sections: Section[] }) {
  return <main id="main-content" className="mx-auto max-w-3xl px-4 py-12">
    {TERMS_STATUS === "draft" && <p role="note" className="mb-6 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{DRAFT_BANNER}</p>}
    <h1 className="text-3xl font-semibold">{title}</h1>
    <p className="mt-1 text-sm text-neutral-600">Version {version}</p>
    {sections.map((s) => <section key={s.heading} className="mt-8"><h2 className="text-lg font-semibold">{s.heading}</h2>
      {s.body.every((b) => b.startsWith("- ")) ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{s.body.map((b, i) => <li key={i}>{inline(b.slice(2))}</li>)}</ul> :
        s.body.map((b, i) => b.startsWith("- ") ? <ul key={i} className="mt-2 list-disc pl-5 text-sm"><li>{inline(b.slice(2))}</li></ul> : <p key={i} className="mt-2 text-sm leading-relaxed">{inline(b)}</p>)}</section>)}
  </main>
}
