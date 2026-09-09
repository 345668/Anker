import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { ArticleCover } from "@/components/newsroom/article-cover";
import { getArticleBySlugOrId, getPublishedArticles } from "@/lib/db/queries";
import {
  renderArticleHtml,
  readTimeMinutes,
  extractCitations,
} from "@/lib/newsroom/markdown";
import { articleHref, formatBlogType } from "@/lib/newsroom/catalog";
import { notFound, permanentRedirect } from "next/navigation";
import { isLikelyUuid } from "@/lib/newsroom/slug";
import e from "@/components/landing/editorial.module.css";
import s from "@/components/newsroom/article.module.css";

export const dynamic = "force-dynamic";
const getArticle = cache(getArticleBySlugOrId);
type Props = { params: Promise<{ slug: string }> };

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}
function externalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticle((await params).slug);
  if (!article || article.status !== "published")
    return { title: "Article not found | Anker", robots: { index: false } };
  const url = `https://www.an-ker.de${articleHref(article)}`;
  return {
    title: `${article.headline} | Anker`,
    description: article.subheadline || undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: article.headline,
      description: article.subheadline || undefined,
      url,
      ...(dateLabel(article.published_at)
        ? { publishedTime: new Date(article.published_at).toISOString() }
        : {}),
      ...(article.author ? { authors: [article.author] } : {}),
      ...(externalUrl(article.image_url)
        ? {
            images: [
              { url: externalUrl(article.image_url)!, alt: article.headline },
            ],
          }
        : {}),
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.status !== "published") notFound();
  if (isLikelyUuid(slug) && article.slug?.trim() && article.slug !== slug)
    permanentRedirect(articleHref(article));

  const tags = Array.isArray(article.tags) ? article.tags : [];
  const myTags = new Set(tags.map((t) => t.toLowerCase()));
  const related = (await getPublishedArticles(60))
    .filter((a) => a.id !== article.id)
    .map((a) => ({
      a,
      score:
        (a.tags || []).filter((t) => myTags.has(t.toLowerCase())).length * 2 +
        Number(a.blog_type === article.blog_type),
    }))
    .sort(
      (x, y) =>
        y.score - x.score ||
        new Date(y.a.published_at).getTime() -
          new Date(x.a.published_at).getTime(),
    )
    .slice(0, 3)
    .map((x) => x.a);
  const content = article.content || "";
  const html = renderArticleHtml(content);
  const citations = extractCitations(content);
  const sources: { name?: string; url?: string; year?: string | number }[] =
    Array.isArray(article.sources)
      ? article.sources.filter(
          (source: unknown) => source && typeof source === "object",
        )
      : [];
  const pdf = externalUrl(article.source_pdf_url);
  const rawSentiment = article.sentiment?.toLowerCase().trim();
  const sentiment =
    rawSentiment && ["bullish", "bearish", "neutral"].includes(rawSentiment)
      ? rawSentiment
      : null;
  const date = dateLabel(article.published_at);

  return (
    <main className={`marketing-light ${e.page}`} id="main-content">
      <Navigation />
      <article>
        <header className={s.header}>
          <div className={e.container}>
            <Link href="/newsroom" className={s.back}>
              <ArrowLeft size={16} aria-hidden="true" /> New at Anker
            </Link>
            <div className={s.category}>
              {formatBlogType(article.blog_type)}
            </div>
            <h1>{article.headline}</h1>
            <div className={s.meta}>
              {date && (
                <time dateTime={new Date(article.published_at).toISOString()}>
                  {date}
                </time>
              )}
              <span>{readTimeMinutes(content)} min read</span>
            </div>
            {article.subheadline && (
              <p className={s.dek}>{article.subheadline}</p>
            )}
            {article.author && (
              <p className={s.byline}>
                By <strong>{article.author}</strong>
              </p>
            )}
          </div>
        </header>
        <ArticleCover
          src={externalUrl(article.image_url)}
          title={article.headline}
          category={formatBlogType(article.blog_type)}
          hero
        />
        <div className={`${e.container} ${s.reading}`}>
          <aside className={s.aside} aria-label="Article information">
            <div className={s.asideInner}>
              <h2>Anker Intelligence</h2>
              <dl>
                {article.geography && (
                  <div>
                    <dt>Region</dt>
                    <dd>{article.geography}</dd>
                  </div>
                )}
                {sentiment && (
                  <div>
                    <dt>Editorial sentiment</dt>
                    <dd>{formatBlogType(sentiment)}</dd>
                  </div>
                )}
                {tags.length > 0 && (
                  <div>
                    <dt>Topics</dt>
                    <dd>{tags.join(" · ")}</dd>
                  </div>
                )}
              </dl>
              {(sources.length > 0 || citations.length > 0 || pdf) && (
                <a href="#article-sources">Sources & references</a>
              )}
            </div>
          </aside>
          <div>
            {html ? (
              <div
                className={s.body}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p>Full article content coming soon.</p>
            )}
            {(sources.length > 0 || citations.length > 0 || pdf) && (
              <section
                className={s.sources}
                id="article-sources"
                style={{ scrollMarginTop: "9rem" }}
              >
                <h2>Sources & references</h2>
                {pdf && (
                  <p className="mb-6">
                    <a
                      className={s.pdf}
                      href={pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={20} aria-hidden="true" /> Read the source
                      PDF <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </p>
                )}
                <ol>
                  {sources.length > 0
                    ? sources.map((source, i) => (
                        <li key={i}>
                          {externalUrl(source.url) ? (
                            <a
                              href={externalUrl(source.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {source.name || source.url}
                              <span className="sr-only">
                                {" "}
                                (opens in a new tab)
                              </span>
                            </a>
                          ) : (
                            <span>{source.name || "Source"}</span>
                          )}
                          {source.year ? ` · ${source.year}` : ""}
                        </li>
                      ))
                    : citations.map((citation, i) => (
                        <li key={i}>
                          {citation.source} · {citation.year}
                        </li>
                      ))}
                </ol>
              </section>
            )}
            <p className={s.note}>
              Part of Anker Intelligence — perspectives on private capital,
              frontier markets, and venture flows. Sources and figures reflect
              the information available at publication. This article is not
              investment advice.
            </p>
          </div>
        </div>
      </article>
      {related.length > 0 && (
        <section className={s.related} aria-labelledby="related-title">
          <div className={e.container}>
            <div className={s.relatedHeader}>
              <h2 id="related-title">Continue the conversation</h2>
              <Link href="/newsroom" className={e.textLink}>
                All perspectives <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className={s.relatedGrid}>
              {related.map((a) => (
                <Link key={a.id} href={articleHref(a)} className={s.story}>
                  <ArticleCover
                    src={externalUrl(a.image_url)}
                    title={a.headline}
                    category={formatBlogType(a.blog_type)}
                  />
                  <span className={s.category}>
                    {formatBlogType(a.blog_type)}
                  </span>
                  <h3>{a.headline}</h3>
                  {a.subheadline && <p>{a.subheadline}</p>}
                  <time>{dateLabel(a.published_at)}</time>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <FooterSection />
    </main>
  );
}
