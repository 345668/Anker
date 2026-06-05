"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Newspaper, ShieldCheck, BookOpen, Globe2 } from "lucide-react";

type Article = {
  id: string;
  category: string;
  date: string;
  title: string;
  excerpt: string;
  featured: boolean;
  author: string;
  blogType: string;
};

interface NewsroomClientProps {
  articles: Article[];
  featuredArticles: Article[];
  categories: string[];
}

function formatBlogType(t: string): string {
  return (t || "Article").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function NewsroomClient({ articles, featuredArticles, categories }: NewsroomClientProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
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

  const filtered = useMemo(() => {
    return activeCategory === "All" ? restAll : restAll.filter((a) => a.category === activeCategory);
  }, [restAll, activeCategory]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { All: restAll.length };
    for (const a of restAll) m[a.category] = (m[a.category] ?? 0) + 1;
    return m;
  }, [restAll]);

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
            <h1 className="lg:col-span-7 font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
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
            <Link href={`/newsroom/${lead.id}`} className="block group">
              <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                <div className="lg:col-span-8">
                  <div className="flex items-center gap-3 mb-5 text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                    <span className="px-2.5 py-1 border border-foreground/15 text-foreground/80">{formatBlogType(lead.blogType)}</span>
                    <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                    <span>{lead.date}</span>
                  </div>
                  <h2 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.1] text-foreground group-hover:translate-x-1 transition-transform">
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
                    <Link href={`/newsroom/${secondary.id}`} className="block group/sec">
                      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-3">
                        <span>{formatBlogType(secondary.blogType)}</span>
                        <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
                        <span>{secondary.date}</span>
                      </div>
                      <h3 className="font-display text-xl lg:text-2xl leading-snug text-foreground group-hover/sec:translate-x-1 transition-transform">
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

      {/* Category filter strip */}
      <section className="border-b border-foreground/10 bg-foreground/[0.015]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-3 overflow-x-auto py-4 -mx-6 px-6 lg:mx-0 lg:px-0">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground shrink-0 mr-1">
              Filter
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
                  href={`/newsroom/${article.id}`}
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
                      <h3 className="font-display text-xl lg:text-2xl leading-snug text-foreground group-hover:translate-x-1 transition-transform">
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
