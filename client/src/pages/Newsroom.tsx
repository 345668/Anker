import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Calendar } from "lucide-react";

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

const getBadgeColor = (type: string) => {
  switch (type) {
    case "Insights": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Trends": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Guides": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
};

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

        {/* Featured Article */}
        {filteredNews.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <Card className="overflow-hidden" data-testid="card-featured-article">
              <div className="grid md:grid-cols-2">
                <div className="aspect-[4/3] md:aspect-auto">
                  <img 
                    src={filteredNews[0].image} 
                    alt={filteredNews[0].title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-8 md:p-12 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <Badge className={getBadgeColor(filteredNews[0].blogType)}>
                      {filteredNews[0].blogType}
                    </Badge>
                    <span className="text-muted-foreground text-sm flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {filteredNews[0].date}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold mb-4">{filteredNews[0].title}</h2>
                  <p className="text-muted-foreground mb-6">{filteredNews[0].intro}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">By {filteredNews[0].author}</span>
                    <Button variant="ghost" className="group" data-testid="button-read-featured">
                      Read Article <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* News Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredNews.slice(1).map((item, idx) => (
            <motion.div
              key={item.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card 
                className="overflow-hidden group cursor-pointer h-full flex flex-col"
                data-testid={`card-news-${item.slug}`}
              >
                <div className="aspect-[16/10] overflow-hidden">
                  <img 
                    src={item.image} 
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge className={getBadgeColor(item.blogType)}>
                      {item.blogType}
                    </Badge>
                    <span className="text-muted-foreground text-xs">{item.date}</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4 line-clamp-2 flex-grow">
                    {item.intro}
                  </p>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-xs text-muted-foreground">By {item.author}</span>
                    <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Card>
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
