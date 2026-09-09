// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NewsroomClient } from "@/components/tesseract/newsroom-client";
import type { NewsroomArticle } from "./catalog";

const articles: NewsroomArticle[] = Array.from({ length: 12 }, (_, index) => ({
  id: String(index), slug: `story-${index}`, title: `Venture story ${index}`, excerpt: "Private capital research",
  category: index % 2 ? "News" : "Insights", sentiment: index % 2 ? null : "bullish",
  date: "September 9, 2026", publishedAt: "2026-09-09T00:00:00.000Z", author: "Anker", imageUrl: index === 0 ? "/cover.jpg" : null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(NewsroomClient, { articles, featuredArticles: articles.slice(0, 3), categories: ["All", "Insights", "News"] })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("newsroom reader interactions", () => {
  it("reveals the next batch and moves keyboard focus to the first new story", async () => {
    expect(container.querySelectorAll("#newsroom-results article")).toHaveLength(9);
    const more = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("View more"))!;
    await act(async () => more.click());
    expect(container.querySelectorAll("#newsroom-results article")).toHaveLength(12);
    expect(document.activeElement?.textContent).toContain("Venture story 9");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Showing 12 of 12 stories");
  });

  it("filters the full archive and resets the controls and pagination", async () => {
    const topic = container.querySelector('select[id$="-category"]') as HTMLSelectElement;
    await act(async () => {
      topic.value = "News";
      topic.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll("#newsroom-results article")).toHaveLength(6);
    expect(container.querySelector("#newsroom-results")?.textContent).toContain("Venture story 1");
    const clear = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Clear filters"))!;
    await act(async () => clear.click());
    expect(topic.value).toBe("All");
    expect(container.querySelectorAll("#newsroom-results article")).toHaveLength(9);
  });

  it("replaces a failed cover with a typographic cover while keeping the story link", async () => {
    const cover = container.querySelector('img[src="/cover.jpg"]')!;
    const link = cover.closest("a")!;
    await act(async () => cover.dispatchEvent(new Event("error")));
    expect(link.querySelector("img")).toBeNull();
    expect(link.textContent).toContain("ANKER");
    expect(link.getAttribute("href")).toBe("/newsroom/story-0");
  });
});
