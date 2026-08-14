"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Newspaper, ShieldCheck, BookOpen, Globe2, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Sentiment = "bullish" | "neutral" | "bearish" | null;

type Article = {
  id: string;
  /** Optional — present for articles created/backfilled after 2026-06-20.
   *  When null we fall back to id for the URL. */
  slug?: string | null;
  category: string;
  date: string;
  title: string;
  excerpt: string;
  featured: boolean;
  author: string;
  blogType: string;
  /** Editorial sentiment tag, set by the admin editor. null when unset
   *  (legacy rows + rows the editor hasn't classified yet). */
  sentiment?: Sentiment;
};

/** Build the public article URL — prefer slug, fall back to id. */
function articleHref(a: Article): string {
  return `/newsroom/${a.slug ?? a.id}`;
}

interface NewsroomClientProps {
  articles: Article[];
  featuredArticles: Article[];
  categories: string[];
}

function formatBlogType(t: string): string {
  return (t || "Article").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type SentimentFilter = "all" | "bullish" | "neutral" | "bearish";

export function NewsroomClient({ articles, featuredArticles, categories }: NewsroomClientProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSentiment, setActiveSentiment] = useState<SentimentFilter>("all");
  const [search, setSearch] = useState("");
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 },
    );
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  const lead = featuredArticles[0] ?? articles[0];
  const secondary = (featuredArticles[1] ?? articles[1]) || null;

  // Articles not used in the lead block
  const usedIds = new Set([lead?.id, secondary?.id].filter(Boolean));
  const restAll = articles.filter((a) => !usedIds.has(a.id));

  // Both filters combine with AND. Counts are computed once per change so the
  // chip labels always reflect the actual matchable set with the *other*
  // filter applied — i.e. when "Bullish" is on, the category counts narrow.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return restAll.filter((a) => {
      if (activeCategory !== "All" && a.category !== activeCategory) return false;
      if (activeSentiment !== "all" && a.sentiment !== activeSentiment) return false;
      if (q && !(`${a.title} ${a.excerpt} ${a.author ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [restAll, activeCategory, activeSentiment, search]);

  const counts = useMemo(() => {
    // Category counts respect the active sentiment, and vice versa, so the
    // numbers next to each chip never lie about what would happen if you
    // clicked it (modulo the chip's own dimension).
    const m: Record<string, number> = { All: 0 };
    for (const a of restAll) {
      if (activeSentiment !== "all" && a.sentiment !== activeSentiment) continue;
      m.All = (m.All ?? 0) + 1;
      m[a.category] = (m[a.category] ?? 0) + 1;
    }
    return m;
  }, [restAll, activeSentiment]);

  const sentimentCounts = useMemo(() => {
    const m: Record<SentimentFilter, number> = { all: 0, bullish: 0, neutral: 0, bearish: 0 };
    for (const a of restAll) {
      if (activeCategory !== "All" && a.category !== activeCategory) continue;
      m.all++;
      if (a.sentiment === "bullish") m.bullish++;
      else if (a.sentiment === "neutral") m.neutral++;
      else if (a.sentiment === "bearish") m.bearish++;
    }
    return m;
  }, [restAll, activeCategory]);

  // Sentiment row is only worth showing when at least one article has been
  // classified — otherwise it'd be three zero chips next to "All".
  const hasAnySentiment = useMemo(
    () => restAll.some((a) => a.sentiment === "bullish" || a.sentiment === "neutral" || a.sentiment === "bearish"),
    [restAll],
  );

  return (
    <>
      {/* Masthead */}
      <section ref={heroRef} className="border-b border-foreground/10 bg-foreground/[0.015]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-32 lg:pt-40 pb-12 lg:pb-16">
          <div className="flex items-center gap-3 mb-6 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <Newspaper className="w-3.5 h-3.5" />
            <span>Anker Intelligence</span>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span>Newsroom</span>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span className="inline-flex items-center gap-1.5 text-emerald-700/80">
              <ShieldCheck className="w-3 h-3" /> Editorial
            </span>
          </div>
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-end">
            <h1 className="lg:col-span-7 font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
              {["Independent", "reporting", "on", "private", "capital."].map((word, i) => (
                <span
                  key={`${word}-${i}`}
                  className={`inline-block mr-[0.35em] transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  {word}
                </span>
              ))}
            </h1>
            <p className="lg:col-span-5 text-base lg:text-lg text-muted-foreground leading-relaxed max-w-md">
              Synthesis-grade analysis of venture flows, LP allocations, frontier markets, and the shape of
              early-stage capital — published by Anker.
            </p>
          </div>

          {/* Editorial stat band — Carta "powered by data" motif, computed live */}
          <dl className="mt-10 lg:mt-12 grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10">
            {[
              { label: "Articles published", value: articles.length.toString() },
              { label: "Editorial buckets", value: Math.max(0, categories.length - 1).toString() },
              { label: "Latest edition", value: lead?.date ?? "—" },
              { label: "Bullish coverage", value: `${restAll.length ? Math.round((restAll.filter((a) => a.sentiment === "bullish").length / restAll.length) * 100) : 0}%` },
            ].map((s) => (
              <div key={s.label} className="bg-background/60 backdrop-blur-sm px-4 py-4">
                <dt className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{s.label}</dt>
                <dd className="mt-1 text-lg lg:text-xl font-display tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Lead — full-bleed featured article */}
      {lead && (
        <section className="border-b border-foreground/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12 lg:py-16">
            <div className="flex items-center gap-3 mb-8 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-6 h-px bg-foreground/30" />
              Lead story
            </div>
            <Link href={articleHref(lead)} className="block group">
              <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                <div className="lg:col-span-8">
                  <div className="flex items-center gap-3 mb-5 text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                    <span className="px-2.5 py-1 border border-foreground/15 text-foreground/80">{formatBlogType(lead.blogType)}</span>
                    <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                    <span>{lead.date}</span>
                  </div>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.1] text-foreground group-hover:translate-x-1 transition-transform">
                    {lead.title}
                  </h2>
                  {lead.excerpt && (
                    <p className="mt-5 text-base lg:text-lg text-muted-foreground leading-relaxed max-w-2xl line-clamp-3">
                      {lead.excerpt}
                    </p>
                  )}
                  <div className="mt-7 inline-flex items-center gap-3 text-sm text-foreground/80">
                    <span>{lead.author}</span>
                    <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      Read the story <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
                {secondary && (
                  <div className="lg:col-span-4 lg:border-l lg:border-foreground/10 lg:pl-8 mt-8 lg:mt-0">
                    <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-4">
                      Also today
                    </div>
                    <Link href={articleHref(secondary)} className="block group/sec">
                      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-3">
                        <span>{formatBlogType(secondary.blogType)}</span>
                        <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                        <span>{secondary.date}</span>
                      </div>
                      <h3 className="font-serif text-xl lg:text-2xl leading-snug text-foreground group-hover/sec:translate-x-1 transition-transform">
                        {secondary.title}
                      </h3>
                      {secondary.excerpt && (
                        <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{secondary.excerpt}</p>
                      )}
                      <div className="mt-4 text-xs text-muted-foreground">By {secondary.author}</div>
                    </Link>
                  </div>
                )}
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Category filter strip + search */}
      <section className="border-b border-foreground/10 bg-foreground/[0.015]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-3 overflow-x-auto py-4 -mx-6 px-6 lg:mx-0 lg:px-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles…"
              aria-label="Search articles"
              className="shrink-0 w-52 px-3.5 py-2 text-xs font-mono bg-background border border-foreground/15 focus:border-foreground/40 outline-none placeholder:text-muted-foreground"
            />
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground shrink-0 mr-1">
              Type
            </span>
            {categories.map((category) => {
              const n = counts[category] ?? 0;
              const active = activeCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all border ${active ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-foreground/15 hover:border-foreground/40"}`}
                >
                  <span>{category}</span>
                  <span className={`text-[10px] ${active ? "opacity-70" : "opacity-50"}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sentiment filter strip — only renders once at least one article has
          been classified. Same chip styling as the Type row to stay visually
          consistent; coloured edge on the active chip telegraphs which
          sentiment is selected. */}
      {hasAnySentiment && (
        <section className="border-b border-foreground/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="flex items-center gap-3 overflow-x-auto py-3 -mx-6 px-6 lg:mx-0 lg:px-0">
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground shrink-0 mr-1">
                Sentiment
              </span>
              {([
                { key: "all",     label: "All",     Icon: null,           activeCls: "bg-foreground text-background border-foreground" },
                { key: "bullish", label: "Bullish", Icon: TrendingUp,     activeCls: "bg-emerald-600 text-white border-emerald-600" },
                { key: "neutral", label: "Neutral", Icon: Minus,          activeCls: "bg-foreground/80 text-background border-foreground/80" },
                { key: "bearish", label: "Bearish", Icon: TrendingDown,   activeCls: "bg-rose-600 text-white border-rose-600" },
              ] as const).map(({ key, label, Icon, activeCls }) => {
                const n = sentimentCounts[key];
                const active = activeSentiment === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveSentiment(key)}
                    className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono uppercase tracking-wider transition-all border ${active ? activeCls : "bg-background text-foreground border-foreground/15 hover:border-foreground/40"}`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    <span>{label}</span>
                    <span className={`text-[10px] ${active ? "opacity-80" : "opacity-50"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Article ledger */}
      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              No articles in this category yet.
            </div>
          ) : (
            <div className="divide-y divide-foreground/10 border-t border-b border-foreground/10">
              {filtered.map((article) => (
                <Link
                  key={article.id}
                  href={articleHref(article)}
                  className="block py-6 lg:py-7 group"
                >
                  <div className="grid lg:grid-cols-12 gap-4 lg:gap-6 items-start">
                    {/* Date rail */}
                    <div className="lg:col-span-2">
                      <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                        {article.date}
                      </div>
                    </div>
                    {/* Category */}
                    <div className="lg:col-span-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70 border border-foreground/15 px-2 py-1">
                        {formatBlogType(article.blogType)}
                      </span>
                    </div>
                    {/* Title + excerpt */}
                    <div className="lg:col-span-7">
                      <h3 className="font-serif text-xl lg:text-2xl leading-snug text-foreground group-hover:translate-x-1 transition-transform">
                        {article.title}
                      </h3>
                      {article.excerpt && (
                        <p className="mt-2 text-sm lg:text-[0.95rem] text-muted-foreground leading-relaxed line-clamp-2 max-w-2xl">
                          {article.excerpt}
                        </p>
                      )}
                      <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{article.author}</span>
                      </div>
                    </div>
                    {/* Affordance */}
                    <div className="lg:col-span-1 flex lg:justify-end pt-1">
                      <ArrowRight className="w-4 h-4 text-foreground/60 transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Editorial standards footer */}
          <div className="mt-12 lg:mt-16 grid md:grid-cols-3 gap-6 text-xs text-muted-foreground">
            <div className="flex gap-3 items-start">
              <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-700/80 shrink-0" />
              <p>Every story is reviewed against primary sources. Citations are surfaced inline and listed at the foot of each article.</p>
            </div>
            <div className="flex gap-3 items-start">
              <BookOpen className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Synthesis combines public filings, market data, and first-party reporting. Read time is calculated per article.</p>
            </div>
            <div className="flex gap-3 items-start">
              <Globe2 className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Coverage spans private capital, frontier markets, sector theses, and venture flows across regions.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
