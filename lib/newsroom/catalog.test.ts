import { describe, expect, it } from "vitest";
import { articleHref, filterArticles, selectFeaturedArticles, type ArticleFilters, type NewsroomArticle } from "./catalog";

const article = (id: string, overrides: Partial<NewsroomArticle> = {}): NewsroomArticle => ({
  id, slug: `story-${id}`, title: `Story ${id}`, excerpt: "Private capital", author: "Anker",
  category: "Insights", sentiment: null, date: "September 9, 2026", publishedAt: "2026-09-09T00:00:00.000Z",
  imageUrl: null, ...overrides,
});
const all: ArticleFilters = { category: "All", sentiment: "all", year: "All", search: "" };

describe("newsroom discovery", () => {
  it("keeps a featured story searchable in the complete archive", () => {
    const articles = [article("lead", { title: "Frontier fund launch" }), article("other")];
    expect(selectFeaturedArticles(articles, [articles[0]])[0].id).toBe("lead");
    expect(filterArticles(articles, { ...all, search: "  FRONTIER  " }).map((a) => a.id)).toEqual(["lead"]);
  });

  it("fills three distinct features without repeating sparse featured selections", () => {
    const articles = [article("1"), article("2"), article("3"), article("4")];
    expect(selectFeaturedArticles(articles, [articles[1], articles[1]]).map((a) => a.id)).toEqual(["2", "1", "3"]);
    expect(selectFeaturedArticles([articles[0]], [articles[0]])).toHaveLength(1);
    expect(selectFeaturedArticles([], [])).toEqual([]);
  });

  it("combines topic, year, sentiment and search without admitting unclassified or undated stories", () => {
    const articles = [
      article("match", { sentiment: "bullish", author: "Ada" }),
      article("old", { sentiment: "bullish", author: "Ada", publishedAt: "2025-01-01T00:00:00Z" }),
      article("other-topic", { sentiment: "bullish", author: "Ada", category: "News" }),
      article("unclassified", { author: "Ada" }),
      article("undated", { sentiment: "bullish", author: "Ada", publishedAt: null }),
      article("other-author", { sentiment: "bullish" }),
    ];
    expect(filterArticles(articles, { category: "Insights", sentiment: "bullish", year: "2026", search: "ada" }).map((a) => a.id)).toEqual(["match"]);
    expect(filterArticles(articles, all)).toHaveLength(articles.length);
  });

  it("preserves canonical slugs and legacy ID links", () => {
    expect(articleHref({ id: "legacy-id", slug: "fund-launch" })).toBe("/newsroom/fund-launch");
    expect(articleHref({ id: "legacy-id", slug: null })).toBe("/newsroom/legacy-id");
    expect(articleHref({ id: "legacy-id", slug: "  " })).toBe("/newsroom/legacy-id");
  });
});
