import Link from "next/link";
import { ArrowLeft, Calendar, User, Tag, Globe2, ExternalLink, BookOpen, ShieldCheck, FileText } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { getArticleBySlugOrId, getPublishedArticles } from "@/lib/db/queries";
import { renderArticleHtml, readTimeMinutes, extractCitations } from "@/lib/newsroom/markdown";
import { notFound, redirect } from "next/navigation";
import { isLikelyUuid } from "@/lib/newsroom/slug";

export const dynamic = "force-dynamic";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function formatBlogType(t: string): string {
  return (t || "Article").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Route folder is /newsroom/[slug] post-2026-06-20, but we accept either a
// real slug or a legacy UUID id — getArticleBySlugOrId handles both.  When a
// reader lands on the UUID form we 308-redirect to the canonical /<slug> URL
// so search engines and bookmarks consolidate over time.
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlugOrId(slug);
  if (!article) notFound();

  // If the incoming URL was the legacy UUID and we have a real slug, redirect.
  if (isLikelyUuid(slug) && (article as any).slug && (article as any).slug !== slug) {
    redirect(`/newsroom/${(article as any).slug}`);
  }

  const allArticles = await getPublishedArticles(8);
  const relatedArticles = allArticles.filter((a) => a.id !== article.id).slice(0, 3);

  const content = article.content ?? "";
  const html = renderArticleHtml(content);
  const minutes = readTimeMinutes(content);
  const citations = extractCitations(content);
  const tags = Array.isArray(article.tags) ? article.tags : [];

  // sources jsonb on Neon can hold [{ name, url, year }] objects
  const structuredSources: Array<{ name?: string; url?: string; year?: string | number }> = (() => {
    const s: any = (article as any).sources;
    if (!s) return [];
    if (Array.isArray(s)) return s.filter((x) => x && typeof x === "object");
    return [];
  })();

  const confidenceScore: number | null =
    typeof (article as any).confidence_score === "number"
      ? (article as any).confidence_score
      : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Editorial-grade header — anchored, paper-like, restrained */}
      <article>
        <header className="border-b border-foreground/10">
          <div className="max-w-3xl mx-auto px-6 lg:px-12 pt-32 lg:pt-40 pb-12 lg:pb-16">
            <Link
              href="/newsroom"
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-10"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Newsroom
            </Link>

            {/* Eyebrow: category + region + date stamp */}
            <div className="flex flex-wrap items-center gap-3 mb-6 text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
              <span className="px-2.5 py-1 border border-foreground/15 text-foreground/80">
                {formatBlogType(article.blog_type)}
              </span>
              {(article as any).geography && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe2 className="w-3 h-3" />
                  {(article as any).geography}
                </span>
              )}
              <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
              <span>{formatDate(article.published_at)}</span>
              <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" /> {minutes} min read
              </span>
            </div>

            {/* Headline + dek */}
            <h1 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.1] mb-6">
              {article.headline}
            </h1>
            {article.subheadline && (
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-light max-w-2xl">
                {article.subheadline}
              </p>
            )}

            {/* Byline rule */}
            <div className="mt-10 pt-6 border-t border-foreground/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-foreground/5 flex items-center justify-center">
                  <User className="w-4 h-4 text-foreground/60" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{article.author}</div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Editorial · Verified reporting
                  </div>
                </div>
              </div>
              {confidenceScore !== null && (
                <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Confidence {Math.round(confidenceScore * 100)}%
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Optional hero image */}
        {article.image_url && (
          <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
            <figure>
              <img
                src={article.image_url}
                alt={article.headline}
                className="w-full h-auto object-cover border border-foreground/10"
              />
            </figure>
          </div>
        )}

        {/* Article body — editorial typography */}
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-8 lg:py-12">
          {html ? (
            <div
              className="article-body text-foreground leading-[1.7] text-[1.0625rem] md:text-[1.125rem]"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-muted-foreground italic">Full article content coming soon.</p>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-12 pt-8 border-t border-foreground/10">
              <div className="flex items-center gap-3 flex-wrap">
                <Tag className="w-4 h-4 text-muted-foreground" />
                {tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs font-mono uppercase tracking-wider text-muted-foreground border border-foreground/15 px-2.5 py-1"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source PDF — admin-uploaded research note this article was drafted from.
              Rendered above the citation list so it sits visually closest to the
              article text it sourced. */}
          {(article as any).source_pdf_url && (
            <section className="mt-12 pt-8 border-t border-foreground/10">
              <h2 className="font-display text-xl mb-4">Source document</h2>
              <a
                href={(article as any).source_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-3 p-4 border border-foreground/15 rounded-md hover:bg-foreground/[0.02] transition-colors group max-w-xl"
              >
                <FileText className="w-5 h-5 shrink-0 mt-0.5 text-foreground/60 group-hover:text-foreground transition-colors" />
                <div className="min-w-0">
                  <div className="text-sm text-foreground font-medium">
                    Source PDF
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate font-mono">
                    {String((article as any).source_pdf_url).replace(/^https?:\/\//, "")}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 shrink-0 ml-auto text-foreground/40 group-hover:text-foreground transition-colors" />
              </a>
            </section>
          )}

          {/* Sources / citations */}
          {(structuredSources.length > 0 || citations.length > 0) && (
            <section className="mt-12 pt-8 border-t border-foreground/10">
              <h2 className="font-display text-xl mb-4">Sources &amp; references</h2>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {structuredSources.length > 0
                  ? structuredSources.map((src, i) => (
                      <li key={`${src.name}-${i}`} className="flex gap-3">
                        <span className="font-mono text-xs text-foreground/40 w-6 shrink-0">
                          [{i + 1}]
                        </span>
                        <span>
                          {src.url ? (
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground hover:underline inline-flex items-center gap-1.5"
                            >
                              {src.name ?? src.url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-foreground">{src.name}</span>
                          )}
                          {src.year ? <span className="text-muted-foreground"> · {String(src.year)}</span> : null}
                        </span>
                      </li>
                    ))
                  : citations.map((c, i) => (
                      <li key={`${c.source}-${c.year}-${i}`} className="flex gap-3">
                        <span className="font-mono text-xs text-foreground/40 w-6 shrink-0">
                          [{i + 1}]
                        </span>
                        <span className="text-foreground">
                          {c.source}
                          <span className="text-muted-foreground"> · {c.year}</span>
                        </span>
                      </li>
                    ))}
              </ol>
            </section>
          )}

          {/* Editorial footer note */}
          <section className="mt-10 pt-6 border-t border-foreground/10 text-xs text-muted-foreground leading-relaxed">
            <p>
              This article is part of <span className="text-foreground">Anker Intelligence</span> — independent
              research on private capital, frontier markets, and venture flows. We synthesize public data and
              first-party reporting; figures are accurate as of publication and are not investment advice.
            </p>
          </section>
        </div>
      </article>

      {/* Related */}
      {relatedArticles.length > 0 && (
        <section className="border-t border-foreground/10 py-16 lg:py-20">
          <div className="max-w-5xl mx-auto px-6 lg:px-12">
            <div className="flex items-end justify-between mb-10">
              <h2 className="font-display text-2xl md:text-3xl tracking-tight">Continue reading</h2>
              <Link
                href="/newsroom"
                className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                All articles →
              </Link>
            </div>
            <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
              {relatedArticles.map((r) => (
                <Link
                  key={r.id}
                  href={`/newsroom/${(r as any).slug ?? r.id}`}
                  className="bg-background p-6 lg:p-8 group hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-4">
                    <span>{formatBlogType(r.blog_type)}</span>
                    <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                    <span>{formatDate(r.published_at)}</span>
                  </div>
                  <h3 className="font-display text-lg md:text-xl text-foreground leading-snug group-hover:translate-x-1 transition-transform">
                    {r.headline}
                  </h3>
                  {r.subheadline && (
                    <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{r.subheadline}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <FooterSection />

      {/* Article-body typography lives in app/globals.css and uses theme tokens
          (var(--foreground) + color-mix) so headings stay legible in light and
          dark. The inline <style> block that used to live here hardcoded
          rgb(15 23 42 / 0.95) and overrode the theme — that's the bug users
          kept hitting. */}
      <style>{`
        .article-body p:first-of-type::first-letter {
          font-family: var(--font-display, ui-serif, Georgia, serif);
          float: left;
          font-size: 3.5rem;
          line-height: 0.95;
          padding-right: 0.5rem;
          padding-top: 0.25rem;
          font-weight: 600;
          color: var(--foreground);
        }
      `}</style>
    </main>
  );
}
