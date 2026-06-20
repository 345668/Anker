import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { getPublishedArticles, getFeaturedArticles, type NewsArticle } from "@/lib/db/queries";
import { NewsroomClient } from "@/components/tesseract/newsroom-client";

// Always render at request time — depends on a live DB.
export const dynamic = "force-dynamic";

// Map blog_type to category for display
function mapBlogTypeToCategory(blogType: string): string {
  const mapping: Record<string, string> = {
    'Trends': 'Insights',
    'Insights': 'Insights',
    'Analysis': 'Insights',
    'Guides': 'Insights',
    'News': 'Announcements',
    'Press': 'Press',
    'Investment': 'Investments',
  };
  return mapping[blogType] || blogType;
}

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
  }));

  // Get unique categories from the articles
  const categories = ['All', ...Array.from(new Set(articles.map(a => a.category)))];

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
