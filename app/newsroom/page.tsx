import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { getPublishedArticles, getFeaturedArticles, type NewsArticle } from "@/lib/db/queries";
import { NewsroomClient } from "@/components/tesseract/newsroom-client";

// Always render at request time — depends on a live DB.
export const dynamic = "force-dynamic";

// Treat blog_type as the public category so every editorial bucket gets its
// own filter chip. The previous mapping rolled Trends + Insights + Analysis +
// Guides into a single "Insights" bucket, which made the filter strip show
// just two chips (All + Insights) even when articles spanned every type.
// Granular categories — one chip per admin-selectable blog type — give
// readers a meaningfully wider lens. Display formatting (title-case, etc.)
// is handled client-side via formatBlogType().
function mapBlogTypeToCategory(blogType: string): string {
  return (blogType ?? "Insights").trim() || "Insights";
}

// Canonical chip ordering. Articles whose blog_type isn't in this list get
// appended at the end (preserves forward-compat if a new type is added on
// the admin side before the public page learns about it).
const CATEGORY_ORDER = [
  "Insights",
  "Trends",
  "Analysis",
  "Guides",
  "News",
  "Press",
  "Investment",
  "Announcements",
] as const;

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default async function NewsroomPage() {
  // Fetch articles from database
  const [allArticles, featuredArticles] = await Promise.all([
    getPublishedArticles(50),
    getFeaturedArticles(2)
  ]);

  // Transform articles for the client component.  We pass BOTH id and slug so
  // the client can build a slug-first link with id as a fallback (covers
  // pre-2026-06-20 rows where slug might briefly be null between deploy and
  // migration run).
  // Normalise sentiment to the canonical vocabulary at the server boundary
  // so the client component never has to deal with stray strings — null when
  // the row predates the 2026-06-22 column or holds an out-of-band value.
  function normalizeSentiment(v: unknown): "bullish" | "neutral" | "bearish" | null {
    if (typeof v !== "string") return null;
    const t = v.trim().toLowerCase();
    return t === "bullish" || t === "neutral" || t === "bearish" ? t : null;
  }

  const articles = allArticles.map(article => ({
    id: article.id,
    slug: (article as any).slug ?? null,
    category: mapBlogTypeToCategory(article.blog_type),
    date: formatDate(article.published_at),
    title: article.headline,
    excerpt: article.subheadline || '',
    featured: featuredArticles.some(f => f.id === article.id),
    author: article.author,
    blogType: article.blog_type,
    sentiment: normalizeSentiment((article as any).sentiment),
  }));

  const featured = featuredArticles.map(article => ({
    id: article.id,
    slug: (article as any).slug ?? null,
    category: mapBlogTypeToCategory(article.blog_type),
    date: formatDate(article.published_at),
    title: article.headline,
    excerpt: article.subheadline || '',
    featured: true,
    author: article.author,
    blogType: article.blog_type,
    sentiment: normalizeSentiment((article as any).sentiment),
  }));

  // Category chips — canonical order first, then any unrecognised values
  // appended (forward-compat for new admin blog_types).
  const present = new Set(articles.map(a => a.category));
  const ordered = CATEGORY_ORDER.filter(c => present.has(c));
  const extra = [...present].filter(c => !(CATEGORY_ORDER as readonly string[]).includes(c)).sort();
  const categories = ["All", ...ordered, ...extra];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />
      <NewsroomClient 
        articles={articles} 
        featuredArticles={featured}
        categories={categories}
      />
      <FooterSection />
    </main>
  );
}
