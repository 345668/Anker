import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

// Import Framer component
import NewsCard from '@/framer/news-card';
import Secondary from '@/framer/secondary';
import Video from '@/framer/video';

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
];

const filters = ["All", "Insights", "Trends", "Guides"];

// Navigation Component matching Framer design
const Navigation = () => {
  const navLinks = [
    { label: "Portfolio", href: "/portfolio" },
    { label: "Vision", href: "/vision" },
    { label: "Team", href: "/team" },
    { label: "Newsroom", href: "/newsroom" },
    { label: "FAQ", href: "/faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[rgb(18,18,18)]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-white text-xl font-light tracking-wider">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-light transition-colors ${link.href === '/newsroom' ? 'text-white' : 'text-white/70 hover:text-white'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <Secondary 
          text="Contact" 
          link="/contact"
          style={{ transform: 'scale(0.9)' }}
        />
      </div>
    </header>
  );
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
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />
      
      {/* Hero Section with Video Background */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Video 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-2 mb-6 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5">
              Latest Updates
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-6" data-testid="text-newsroom-title">
              <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>Newsroom</span>
            </h1>
            <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
              Latest updates, insights, and announcements from the Anker team and our portfolio companies.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="py-24 max-w-7xl mx-auto px-6">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-12"
        >
          <Link href="/" className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </motion.div>

        {/* Filters */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap gap-3 mb-12" 
          data-testid="filter-container"
        >
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-5 py-2 rounded-full text-sm font-light transition-all border ${
                activeFilter === filter 
                  ? 'bg-white text-black border-white' 
                  : 'bg-transparent text-white/70 border-white/20 hover:border-white/40'
              }`}
              data-testid={`button-filter-${filter.toLowerCase()}`}
            >
              {filter}
            </button>
          ))}
        </motion.div>

        {/* News Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredNews.map((item, idx) => (
            <motion.div
              key={item.slug}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
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
            <p className="text-white/50">No articles found for this filter.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
