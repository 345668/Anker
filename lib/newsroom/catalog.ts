export type SentimentFilter = "all" | "bullish" | "neutral" | "bearish";

export type NewsroomArticle = {
  id: string;
  slug?: string | null;
  category: string;
  date: string;
  publishedAt: string | null;
  title: string;
  excerpt: string;
  author: string;
  imageUrl: string | null;
  sentiment: Exclude<SentimentFilter, "all"> | null;
};

export type ArticleFilters = {
  category: string;
  sentiment: SentimentFilter;
  year: string;
  search: string;
};

export function articleHref(article: Pick<NewsroomArticle, "id" | "slug">): string {
  return `/newsroom/${article.slug?.trim() || article.id}`;
}

export function formatBlogType(value: string): string {
  return (value || "Article").replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function selectFeaturedArticles(articles: NewsroomArticle[], featured: NewsroomArticle[], limit = 3): NewsroomArticle[] {
  const unique = new Map<string, NewsroomArticle>();
  for (const article of [...featured, ...articles]) {
    if (!unique.has(article.id)) unique.set(article.id, article);
  }
  return [...unique.values()].slice(0, limit);
}

export function filterArticles(articles: NewsroomArticle[], filters: ArticleFilters): NewsroomArticle[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return articles.filter((article) => {
    if (filters.category !== "All" && article.category !== filters.category) return false;
    if (filters.sentiment !== "all" && article.sentiment !== filters.sentiment) return false;
    if (filters.year !== "All" && article.publishedAt?.slice(0, 4) !== filters.year) return false;
    return !query || `${article.title} ${article.excerpt} ${article.author}`.toLocaleLowerCase().includes(query);
  });
}
