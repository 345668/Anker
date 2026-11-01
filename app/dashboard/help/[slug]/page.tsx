import Link from "next/link"
import { notFound } from "next/navigation"
import { helpFor, ALL_ARTICLES } from "@/lib/help/articles"
import { Inline } from "@/components/help/inline"

export function generateStaticParams() { return ALL_ARTICLES.map((a) => ({ slug: a.slug })) }

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { articles } = await helpFor()
  const a = articles.find((x) => x.slug === slug)
  if (!a) notFound()
  const toc = a.blocks.filter((b) => b.t === "h2")
  const related = a.related.map((s) => articles.find((x) => x.slug === s)).filter(Boolean)
  return (
    <article className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/dashboard/help" className="text-sm text-muted-foreground underline">All help</Link>
      <h1 className="text-2xl font-semibold">{a.title}</h1>
      <p className="text-muted-foreground">{a.summary}</p>
      {a.routes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.routes.map((r) => <Link key={r} href={r} className="rounded-md border px-3 py-1 text-sm hover:bg-muted">Open {r.split("/").pop()?.replace(/-/g, " ")} in Anker</Link>)}
        </div>
      )}
      {toc.length > 2 && (
        <nav aria-label="On this page" className="text-sm"><ul className="list-disc pl-5">{toc.map((b) => b.t === "h2" && <li key={b.id}><a href={`#${b.id}`} className="underline">{b.text}</a></li>)}</ul></nav>
      )}
      {a.blocks.map((b, i) =>
        b.t === "h2" ? <h2 id={b.id} key={i} className="pt-2 text-lg font-semibold">{b.text}</h2>
        : b.t === "h3" ? <h3 id={b.id} key={i} className="font-medium">{b.text}</h3>
        : b.t === "p" ? <p key={i}><Inline text={b.text} /></p>
        : b.t === "ul" ? <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>
        : <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ol>)}
      {related.length > 0 && (
        <section className="border-t pt-4"><h2 className="font-semibold">Related</h2>
          <ul className="list-disc pl-5">{related.map((r) => r && <li key={r.slug}><Link href={`/dashboard/help/${r.slug}`} className="underline">{r.title}</Link></li>)}</ul></section>
      )}
      <p className="text-xs text-muted-foreground">Last checked {a.updated}. Something wrong? <Link href="/contact" className="underline">Tell us</Link>.</p>
    </article>
  )
}
