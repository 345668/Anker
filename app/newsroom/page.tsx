"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

const categories = ["All", "Announcements", "Investments", "Insights", "Press"];

const articles = [
  {
    id: "series-b-close",
    category: "Announcements",
    date: "March 2024",
    title: "Tesseract closes $50M Fund II to back the world's boldest founders",
    excerpt: "Our second fund will invest in 40+ companies across fintech, healthtech, and climate solutions.",
    featured: true,
  },
  {
    id: "tesseract-launch",
    category: "Announcements",
    date: "February 2024",
    title: "Introducing Tesseract: AI-powered venture intelligence",
    excerpt: "Our new platform uses machine learning to match founders with the right investors in seconds.",
    featured: true,
  },
  {
    id: "portfolio-paystack",
    category: "Investments",
    date: "January 2024",
    title: "Portfolio spotlight: How Paystack grew from seed to $200M exit",
    excerpt: "An inside look at our first major exit and the lessons learned along the way.",
    featured: false,
  },
  {
    id: "african-fintech-2024",
    category: "Insights",
    date: "January 2024",
    title: "The state of African fintech in 2024",
    excerpt: "Our annual report on trends, opportunities, and challenges in the continent's fastest-growing sector.",
    featured: false,
  },
  {
    id: "climate-fund",
    category: "Announcements",
    date: "December 2023",
    title: "Tesseract launches $10M climate-focused vehicle",
    excerpt: "Dedicated capital for startups building sustainable solutions for African markets.",
    featured: false,
  },
  {
    id: "founder-spotlight-chipper",
    category: "Investments",
    date: "November 2023",
    title: "Founder spotlight: Chipper Cash's journey to unicorn status",
    excerpt: "How Ham Serunjogi built one of Africa's most valuable startups.",
    featured: false,
  },
  {
    id: "healthcare-report",
    category: "Insights",
    date: "October 2023",
    title: "Healthcare innovation in Africa: Opportunities and challenges",
    excerpt: "Our deep dive into the $259B African healthcare market.",
    featured: false,
  },
  {
    id: "bloomberg-feature",
    category: "Press",
    date: "September 2023",
    title: "Tesseract featured in Bloomberg's 'VCs to Watch'",
    excerpt: "Recognition for our AI-first approach to venture investing.",
    featured: false,
  },
];

export default function NewsroomPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  const filteredArticles = activeCategory === "All" 
    ? articles 
    : articles.filter(a => a.category === activeCategory);

  const featuredArticles = articles.filter(a => a.featured);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Newsroom
          </span>
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight">
              {["News", "&", "insights"].map((word, i) => (
                <span
                  key={word}
                  className={`inline-block mr-4 transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  {word}
                </span>
              ))}
            </h1>
            <p className="text-xl text-muted-foreground max-w-md">
              The latest updates on our portfolio, investment thesis, 
              and perspectives on African tech.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Articles */}
      <section className="border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-8">
            Featured
          </span>
          <div className="grid lg:grid-cols-2 gap-px bg-foreground/10">
            {featuredArticles.map((article, idx) => (
              <Link
                key={article.id}
                href={`/newsroom/${article.id}`}
                className="p-8 lg:p-12 bg-background group hover:bg-foreground/[0.02] transition-colors duration-300"
              >
                <div className="flex items-center gap-4 mb-4">
                  <span className="font-mono text-xs text-muted-foreground uppercase">{article.category}</span>
                  <span className="w-1 h-1 rounded-full bg-foreground/30" />
                  <span className="font-mono text-xs text-muted-foreground">{article.date}</span>
                </div>
                <h2 className="font-display text-2xl lg:text-3xl text-foreground mb-4 group-hover:translate-x-2 transition-transform duration-300">
                  {article.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  {article.excerpt}
                </p>
                <span className="inline-flex items-center gap-2 text-sm text-foreground font-medium">
                  Read more
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex overflow-x-auto py-6 gap-2 -mx-6 px-6 lg:mx-0 lg:px-0">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-5 py-2.5 font-mono text-sm whitespace-nowrap transition-all duration-300 ${
                  activeCategory === category
                    ? "bg-foreground text-background"
                    : "bg-foreground/5 text-foreground hover:bg-foreground/10"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="py-16 lg:py-24 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="space-y-0">
            {filteredArticles.map((article, idx) => (
              <Link
                key={article.id}
                href={`/newsroom/${article.id}`}
                className="block py-8 border-b border-foreground/10 group"
              >
                <div className="grid lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-2">
                    <span className="font-mono text-sm text-muted-foreground">{article.date}</span>
                  </div>
                  <div className="lg:col-span-2">
                    <span className="font-mono text-xs text-muted-foreground uppercase px-3 py-1 bg-foreground/5">
                      {article.category}
                    </span>
                  </div>
                  <div className="lg:col-span-6">
                    <h3 className="font-display text-xl lg:text-2xl text-foreground group-hover:translate-x-2 transition-transform duration-300">
                      {article.title}
                    </h3>
                  </div>
                  <div className="lg:col-span-2 flex justify-end">
                    <ArrowUpRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-24 lg:py-32 bg-foreground text-background">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="font-mono text-xs tracking-widest text-background/50 uppercase block mb-6">
                Newsletter
              </span>
              <h2 className="font-display text-4xl lg:text-5xl tracking-tight mb-6">
                Stay in the loop
              </h2>
              <p className="text-lg text-background/60 max-w-md">
                Get our latest insights, portfolio updates, and perspectives 
                on African tech delivered to your inbox.
              </p>
            </div>
            <div>
              <form className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-6 py-4 bg-transparent border border-background/20 text-background placeholder:text-background/40 focus:outline-none focus:border-background/50 transition-colors"
                />
                <button
                  type="submit"
                  className="px-8 py-4 bg-background text-foreground font-medium hover:bg-background/90 transition-colors shrink-0"
                >
                  Subscribe
                </button>
              </form>
              <p className="mt-4 text-sm text-background/40">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
