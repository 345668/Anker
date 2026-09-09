"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Search, X } from "lucide-react";
import { articleHref, filterArticles, formatBlogType, selectFeaturedArticles, type NewsroomArticle, type SentimentFilter } from "@/lib/newsroom/catalog";
import styles from "./newsroom-client.module.css";

interface NewsroomClientProps {
  articles: NewsroomArticle[];
  featuredArticles: NewsroomArticle[];
  categories: string[];
}

const PAGE_SIZE = 9;
const SENTIMENTS = ["all", "bullish", "neutral", "bearish"] as const;

/** Reuse publisher-managed covers; missing images receive a typographic cover. */
function ArticleImage({ article, priority = false }: { article: NewsroomArticle; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.image}>
      {article.imageUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.imageUrl} alt="" width={720} height={450} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true">
          <span className={styles.fallbackBrand}>ANKER</span>
          <span className={styles.fallbackCategory}>{formatBlogType(article.category)}</span>
          <span className={styles.fallbackRule} />
          <span className={styles.fallbackCaption}>Perspectives on private capital</span>
        </div>
      )}
    </div>
  );
}

function ArticleDate({ article }: { article: NewsroomArticle }) {
  return <time dateTime={article.publishedAt || undefined}>{article.date}</time>;
}

export function NewsroomClient({ articles, featuredArticles, categories }: NewsroomClientProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSentiment, setActiveSentiment] = useState<SentimentFilter>("all");
  const [activeYear, setActiveYear] = useState("All");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const focusNextIndex = useRef<number | null>(null);
  const controlId = useId();

  const featured = useMemo(() => selectFeaturedArticles(articles, featuredArticles), [articles, featuredArticles]);
  const years = useMemo(() => [...new Set(articles.map((a) => a.publishedAt?.slice(0, 4)).filter((year): year is string => Boolean(year)))].sort().reverse(), [articles]);
  // The archive includes featured stories: search must never hide a lead story.
  const filtered = useMemo(() => filterArticles(articles, { category: activeCategory, sentiment: activeSentiment, year: activeYear, search }), [articles, activeCategory, activeSentiment, activeYear, search]);
  const categoryCounts = useMemo(() => {
    const matching = filterArticles(articles, { category: "All", sentiment: activeSentiment, year: activeYear, search });
    return Object.fromEntries(categories.map((category) => [category, matching.filter((article) => category === "All" || article.category === category).length]));
  }, [articles, categories, activeSentiment, activeYear, search]);
  const sentimentCounts = useMemo(() => {
    const matching = filterArticles(articles, { category: activeCategory, sentiment: "all", year: activeYear, search });
    return Object.fromEntries(SENTIMENTS.map((sentiment) => [sentiment, matching.filter((article) => sentiment === "all" || article.sentiment === sentiment).length]));
  }, [articles, activeCategory, activeYear, search]);
  const hasFilters = activeCategory !== "All" || activeSentiment !== "all" || activeYear !== "All" || Boolean(search.trim());
  const hasSentiment = articles.some((a) => a.sentiment);
  const shown = filtered.slice(0, visibleCount);

  function restartPagination() {
    focusNextIndex.current = null;
    setVisibleCount(PAGE_SIZE);
  }

  function resetFilters() {
    setActiveCategory("All");
    setActiveSentiment("all");
    setActiveYear("All");
    setSearch("");
    restartPagination();
  }

  return (
    <div className={styles.newsroom}>
      <section className={styles.hero} aria-labelledby="newsroom-title">
        <div className={styles.container}>
          <header className={styles.masthead}>
            <p className={styles.eyebrow}>The Anker newsroom</p>
            <h1 id="newsroom-title">New at Anker</h1>
            <p className={styles.intro}>Perspectives on venture capital, the people building it, and what&apos;s new at Anker.</p>
          </header>
          {featured.length > 0 && (
            <div className={styles.featuredGrid} aria-label="Featured stories">
              {featured.map((article, index) => (
                <article key={article.id} className={styles.featuredCard}>
                  <Link href={articleHref(article)} className={styles.featuredLink}>
                    <ArticleImage article={article} priority={index === 0} />
                    <div className={styles.featuredBody}>
                      <p className={styles.category}>{formatBlogType(article.category)}</p>
                      <h2>{article.title}</h2>
                      <div className={styles.featuredMeta}>
                        <ArticleDate article={article} />
                        <ArrowRight size={20} aria-hidden="true" />
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
          <a className={styles.browseLink} href="#newsroom-archive">Browse all stories <ArrowDown size={16} aria-hidden="true" /></a>
        </div>
      </section>

      <section id="newsroom-archive" className={styles.archive} aria-labelledby="archive-title">
        <div className={styles.container}>
          <div className={styles.archiveHeading}>
            <h2 id="archive-title">Browse all stories</h2>
            <div className={styles.search}>
              <Search size={18} aria-hidden="true" />
              <label className="sr-only" htmlFor={`${controlId}-search`}>Search articles</label>
              <input id={`${controlId}-search`} type="search" value={search} onChange={(event) => { setSearch(event.target.value); restartPagination(); }} placeholder="Search articles" aria-controls="newsroom-results" />
            </div>
          </div>
          <div className={styles.filters} role="group" aria-label="Filter stories">
            <span className={styles.browseLabel}>Browse by</span>
            <div className={styles.selectField}>
              <label htmlFor={`${controlId}-category`}>Topic</label>
              <select id={`${controlId}-category`} value={activeCategory} onChange={(event) => { setActiveCategory(event.target.value); restartPagination(); }} aria-controls="newsroom-results">
                {categories.map((category) => <option key={category} value={category}>{category === "All" ? "All topics" : formatBlogType(category)} ({categoryCounts[category]})</option>)}
              </select>
            </div>
            <div className={styles.selectField}>
              <label htmlFor={`${controlId}-year`}>Date</label>
              <select id={`${controlId}-year`} value={activeYear} onChange={(event) => { setActiveYear(event.target.value); restartPagination(); }} aria-controls="newsroom-results">
                <option value="All">All dates</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            {hasSentiment && (
              <div className={styles.selectField}>
                <label htmlFor={`${controlId}-sentiment`}>Sentiment</label>
                <select id={`${controlId}-sentiment`} value={activeSentiment} onChange={(event) => { setActiveSentiment(event.target.value as SentimentFilter); restartPagination(); }} aria-controls="newsroom-results">
                  {SENTIMENTS.map((sentiment) => <option key={sentiment} value={sentiment}>{sentiment === "all" ? "All sentiments" : formatBlogType(sentiment)} ({sentimentCounts[sentiment]})</option>)}
                </select>
              </div>
            )}
            {hasFilters && <button className={styles.clearButton} type="button" onClick={resetFilters}>Clear filters <X size={16} aria-hidden="true" /></button>}
          </div>

          <p className={styles.resultCount} role="status" aria-live="polite" aria-atomic="true">
            {filtered.length === 0 ? "No stories to show" : `Showing ${shown.length} of ${filtered.length} ${filtered.length === 1 ? "story" : "stories"}`}
          </p>

          <div id="newsroom-results" className={styles.storyList}>
            {shown.map((article, index) => (
              <article key={article.id} className={styles.story} tabIndex={-1} ref={(node) => {
                if (node && focusNextIndex.current === index) {
                  node.focus();
                  focusNextIndex.current = null;
                }
              }}>
                <Link href={articleHref(article)} className={styles.storyLink}>
                  <ArticleImage article={article} />
                  <div className={styles.storyBody}>
                    <p className={styles.category}>
                      {formatBlogType(article.category)}
                      {article.sentiment && <><span className={styles.metaDivider} aria-hidden="true">|</span>{formatBlogType(article.sentiment)}</>}
                    </p>
                    <h3>{article.title}</h3>
                    {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
                    <div className={styles.storyMeta}>
                      <ArticleDate article={article} />
                      {article.author && <><span aria-hidden="true">·</span><span>{article.author}</span></>}
                    </div>
                  </div>
                  <ArrowRight className={styles.storyArrow} size={23} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className={styles.emptyState}>
              <h3>{hasFilters ? "No stories match your search" : "Our next chapter is on its way"}</h3>
              <p>{hasFilters ? "Try a different topic, date or search term." : "New perspectives and updates will appear here as they are published."}</p>
              {hasFilters && <button className={styles.moreButton} type="button" onClick={resetFilters}>Show all stories <ArrowRight size={18} aria-hidden="true" /></button>}
            </div>
          )}

          {visibleCount < filtered.length && (
            <div className={styles.more}>
              <button className={styles.moreButton} type="button" onClick={() => { focusNextIndex.current = visibleCount; setVisibleCount((count) => count + PAGE_SIZE); }} aria-controls="newsroom-results">View more stories <ArrowDown size={18} aria-hidden="true" /></button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
