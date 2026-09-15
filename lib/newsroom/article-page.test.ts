import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NewsArticle } from "@/lib/db/queries";
const mocks = vi.hoisted(() => ({ article: vi.fn(), published: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({
  getArticleBySlugOrId: mocks.article,
  getPublishedArticles: mocks.published,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/components/landing/navigation", () => ({ Navigation: () => null }));
vi.mock("@/components/landing/footer-section", () => ({
  FooterSection: () => null,
}));
import ArticlePage, { generateMetadata } from "@/app/newsroom/[slug]/page";
const article: NewsArticle = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "venture-perspective",
  headline: "A venture perspective",
  subheadline: "Capital and context",
  content: "## The investment context\n\nResearch with **evidence**.",
  author: "Anker",
  blog_type: "Analysis",
  tags: ["climate"],
  published_at: "2026-09-09T12:00:00Z",
  status: "published",
  image_url: "https://example.com/cover.jpg",
  created_at: "2026-09-09T12:00:00Z",
  sources: [
    { name: "Research", url: "https://example.com/research", year: 2026 },
  ],
  source_pdf_url: "https://example.com/report.pdf",
};
const props = { params: Promise.resolve({ slug: "venture-perspective" }) };
beforeEach(() => {
  mocks.article.mockResolvedValue(article);
  mocks.published.mockResolvedValue([]);
});

describe("public editorial article", () => {
  it("rejects drafts and prevents indexing their metadata", async () => {
    mocks.article.mockResolvedValue({ ...article, status: "draft" });
    await expect(ArticlePage(props)).rejects.toThrow("NOT_FOUND");
    const metadata = await generateMetadata(props);
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.title).not.toContain(article.headline);
  });
  it("keeps the permanent redirect from a legacy UUID to its canonical slug", async () => {
    await expect(
      ArticlePage({ params: Promise.resolve({ slug: article.id }) }),
    ).rejects.toThrow("REDIRECT:/newsroom/venture-perspective");
  });
  it("renders the body, publisher cover and research sources while ranking related stories by affinity", async () => {
    mocks.published.mockResolvedValue([
      article,
      {
        ...article,
        id: "newer",
        slug: "other",
        tags: [],
        published_at: "2026-09-10",
        headline: "Other story",
      },
      {
        ...article,
        id: "related",
        slug: "climate",
        headline: "Climate context",
      },
    ]);
    const html = renderToStaticMarkup(await ArticlePage(props));
    expect(html).toContain("The investment context");
    expect(html).toContain("<strong>evidence</strong>");
    expect(html).toContain('src="https://example.com/cover.jpg"');
    expect(html).toContain('href="https://example.com/report.pdf"');
    expect(html).toContain('href="https://example.com/research"');
    expect(html.indexOf("Climate context")).toBeLessThan(
      html.indexOf("Other story"),
    );
    expect(html).not.toContain('href="/newsroom/venture-perspective"');
  });
  it("uses the canonical article URL and article-specific metadata", async () => {
    const metadata = await generateMetadata(props);
    expect(metadata.alternates?.canonical).toBe(
      "https://www.an-ker.de/newsroom/venture-perspective",
    );
    expect(metadata.title).toBe("A venture perspective | Anker");
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-09-09T12:00:00.000Z",
    });
  });
  it("omits unsafe source URLs and handles a missing cover and invalid date", async () => {
    mocks.article.mockResolvedValue({
      ...article,
      image_url: null,
      published_at: "invalid",
      source_pdf_url: "javascript:alert(1)",
      sources: [{ name: "Unlinked source", url: "javascript:alert(2)" }],
    });
    const html = renderToStaticMarkup(await ArticlePage(props));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Invalid Date");
    expect(html).toContain("Unlinked source");
  });
});
