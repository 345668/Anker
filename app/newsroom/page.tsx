import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { getPublishedArticles, type NewsArticle } from "@/lib/db/queries";
import { NewsroomClient } from "@/components/tesseract/newsroom-client";
import type { NewsroomArticle } from "@/lib/newsroom/catalog";

// Always render at request time — depends on a live DB.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New at Anker — Newsroom",
  description: "Perspectives on venture capital, private markets, and the latest from Anker.",
};

// Keep each admin-selectable blog type available as a public topic.
function mapBlogTypeToCategory(blogType: string): string {
  return (blogType ?? "Insights").trim() || "Insights";
}

// Canonical topic ordering. Articles whose blog_type isn't in this list get
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

function toPublicArticle(article: NewsArticle): NewsroomArticle {
  const timestamp = new Date(article.published_at);
  const validDate = !Number.isNaN(timestamp.getTime());
  const sentiment = article.sentiment?.trim().toLowerCase();
  return {
    id: article.id,
    slug: article.slug ?? null,
    category: mapBlogTypeToCategory(article.blog_type),
    date: validDate ? timestamp.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "",
    publishedAt: validDate ? timestamp.toISOString() : null,
    title: article.headline,
    excerpt: article.subheadline || "",
    author: article.author || "",
    imageUrl: article.image_url || null,
    sentiment: sentiment === "bullish" || sentiment === "neutral" || sentiment === "bearish" ? sentiment : null,
  };
}

export default async function NewsroomPage() {
  // The featured query also selected the latest published rows. Derive both
  // sections from one snapshot, preserving order and avoiding duplicate reads.
  const articles = (await getPublishedArticles(200)).map(toPublicArticle);
  const featured = articles.slice(0, 3);

  // Topics — canonical order first, then any unrecognised values
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

      {/* Pitch-us CTA */}
      <section className="border-t border-foreground/10 px-6 lg:px-10 py-16 lg:py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-2">
          <span className="w-2 h-2 bg-[#e5380f]" aria-hidden /> Raising?
        </p>
        <h2 className="font-serif text-3xl md:text-4xl tracking-tight leading-[1.05] mb-4">Pitch us your round</h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-6">
          Apply to raise with Anker — we&apos;ll match your deck to the right investors and help you run the raise end to end.
        </p>
        <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-6 h-11 text-sm hover:bg-foreground/90 transition-colors">
          Pitch us <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      <FooterSection />
    </main>
  );
}
