import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

// Import Framer component
import NewsCard from '@/framer/news-card';

// Newsroom data from CSV
const newsItems = [
  {
    slug: "demystifying-the-due-diligence-process",
    title: "Demystifying the Due Diligence Process",
    date: "10.15.2025",
    image: "https://framerusercontent.com/images/gQaZdOSqiJjadiQIrHOio9VvgRE.jpg",
    intro: "Understanding due diligence can help startups prepare for VC funding.",
    blogType: "Insights",
    author: "James Reed"
  },
  {
    slug: "the-role-of-mentorship-in-startup-success",
    title: "The Role of Mentorship in Startup Success",
    date: "10.02.2025",
    image: "https://framerusercontent.com/images/lnM36DSuw1wU4OZQ8b54pCYNLk.jpg",
    intro: "The right mentorship can be a game-changer for startups",
    blogType: "Guides",
    author: "Karen Wong"
  },
  {
    slug: "the-rise-of-deep-tech-what-vcs-need-to-know",
    title: "The Rise of Deep Tech: What VCs Need to Know",
    date: "09.17.2025",
    image: "https://framerusercontent.com/images/bQuteiVt3GZjiqmoIL8qk2G23jw.jpg",
    intro: "Deep tech startups are disrupting industries – here's what VCs need to know.",
    blogType: "Trends",
    author: "Rachel Kim"
  },
  {
    slug: "beyond-the-pitch-deck-what-founders-can-learn-from-vc-rejection",
    title: "Beyond the Pitch Deck: What Founders Can Learn from VC Rejection",
    date: "09.04.2025",
    image: "https://framerusercontent.com/images/LyRf1qW7PqSbhWTppxDiMX17Q.jpg",
    intro: "Rejection can be a valuable learning experience for founders.",
    blogType: "Guides",
    author: "Michael Patel"
  },
  {
    slug: "the-future-of-venture-capital-trends-to-watch",
    title: "The Future of Venture Capital: Trends to Watch",
    date: "08.17.2025",
    image: "https://framerusercontent.com/images/ypwAK3tqkKBOjg9Rrj0y2fgLww.jpg",
    intro: "The venture capital landscape is shifting – here are the trends to watch",
    blogType: "Insights",
    author: "Christopher Martin"
  },
  {
    slug: "from-zero-to-hero-building-a-strong-brand-identity",
    title: "From Zero to Hero: Building a Strong Brand Identity",
    date: "08.10.2025",
    image: "https://framerusercontent.com/images/q9Acoy8yOLHQUhv8tLaucw2E6uo.jpg",
    intro: "A strong brand identity can make all the difference for startups",
    blogType: "Guides",
    author: "Sophia Rodriguez"
  },
  {
    slug: "the-art-of-negotiation-tips-for-founders",
    title: "The Art of Negotiation: Tips for Founders",
    date: "07.28.2025",
    image: "https://framerusercontent.com/images/Rf6AGJdqHXAyTMdqgeIEMydTW4.jpg",
    intro: "Founders can secure better terms with the right negotiation strategies",
    blogType: "Trends",
    author: "Daniel Taylor"
  },
  {
    slug: "why-vcs-are-betting-big-on-sustainability-startups",
    title: "Why VCs Are Betting Big on Sustainability Startups",
    date: "07.28.2025",
    image: "https://framerusercontent.com/images/oDy7ZLeygr8lT7MWMGaWW5AL4.jpg",
    intro: "Sustainability startups are becoming increasingly attractive to VCs",
    blogType: "Insights",
    author: "Michael Patel"
  },
];

const filters = ["All", "Insights", "Trends", "Guides"];

export default function Newsroom() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredNews = activeFilter === "All" 
    ? newsItems 
    : newsItems.filter(item => item.blogType === activeFilter);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen pt-24 pb-24"
    >
      <div className="container mx-auto px-4">
        <div className="mb-16">
          <h1 className="text-5xl font-bold mb-6" data-testid="text-newsroom-title">Newsroom</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Latest updates, insights, and announcements from the Anker team and our portfolio companies.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-12" data-testid="filter-container">
          {filters.map((filter) => (
            <Button
              key={filter}
              variant={activeFilter === filter ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter(filter)}
              className="rounded-full"
              data-testid={`button-filter-${filter.toLowerCase()}`}
            >
              {filter}
            </Button>
          ))}
        </div>

        {/* News Grid using Framer NewsCard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredNews.map((item, idx) => (
            <motion.div
              key={item.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              data-testid={`card-news-${item.slug}`}
            >
              <NewsCard
                text={item.title}
                date={item.date}
                label={item.blogType}
                link={`/newsroom/${item.slug}`}
                image={{ src: item.image, alt: item.title }}
                style={{ width: '100%', height: 'auto' }}
              />
            </motion.div>
          ))}
        </div>

        {filteredNews.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No articles found for this filter.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
