import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft, Building2, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Startup } from "@shared/schema";

import Secondary from '@/framer/secondary';
import Video from '@/framer/video';

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
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <Link href="/" className="text-white text-xl font-light tracking-wider" data-testid="link-logo">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-light transition-colors ${link.href === '/portfolio' ? 'text-white' : 'text-white/70 hover:text-white'}`}
              data-testid={`link-nav-${link.label.toLowerCase()}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <Secondary 
          text="Contact" 
          link="/contact"
          style={{ transform: 'scale(0.9)' }}
          data-testid="button-nav-contact"
        />
      </div>
    </header>
  );
};

// Color palette for startup cards based on industry
const industryColors: Record<string, string> = {
  "Technology": "rgb(142, 132, 247)",
  "Healthcare": "rgb(254, 212, 92)",
  "Finance": "rgb(196, 227, 230)",
  "Crypto": "rgb(251, 194, 213)",
  "Fintech": "rgb(142, 132, 247)",
  "SaaS": "rgb(142, 132, 247)",
  "AI": "rgb(196, 227, 230)",
  "E-commerce": "rgb(254, 212, 92)",
  "Climate": "rgb(196, 227, 230)",
  "default": "rgb(142, 132, 247)"
};

export default function Portfolio() {
  const [activeCategory, setActiveCategory] = useState("All");

  // Fetch real startups from the database
  const { data: startups = [], isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups"],
  });

  // Get unique industries for filter categories
  const categories = useMemo(() => {
    const industries = new Set<string>();
    startups.forEach(s => {
      if (s.industry) industries.add(s.industry);
    });
    return ["All", ...Array.from(industries).sort()];
  }, [startups]);

  // Filter startups by selected category
  const filteredStartups = activeCategory === "All" 
    ? startups 
    : startups.filter(s => s.industry === activeCategory);

  // Get color for startup based on industry
  const getColor = (industry: string | null) => {
    if (!industry) return industryColors.default;
    return industryColors[industry] || industryColors.default;
  };

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
        {/* Video Background */}
        <div className="absolute inset-0 w-full h-full">
          <Video 
            file="https://framerusercontent.com/assets/vbOBoy0MLbMZbX0cLl9GPpNhA.mp4"
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

        {/* Hero Content */}
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span 
              className="inline-block px-4 py-2 mb-6 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
              data-testid="badge-portfolio"
            >
              Our Startups
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-6" data-testid="text-portfolio-title">
              Startups Using
              <br />
              <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>
                Anker
              </span>
            </h1>
            <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
              Meet the ambitious founders using our platform to connect with investors and grow their businesses.
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
          <Link href="/" className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </motion.div>

        {/* Category Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap gap-3 mb-12"
        >
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-5 py-2 rounded-full text-sm font-light transition-colors border ${
                category === activeCategory 
                  ? 'bg-white text-black border-white' 
                  : 'border-white/20 text-white/70 hover:text-white hover:border-white/40'
              }`}
              data-testid={`filter-${category.toLowerCase()}`}
            >
              {category}
            </button>
          ))}
        </motion.div>

        {/* Portfolio Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
          </div>
        ) : filteredStartups.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">No startups found in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredStartups.map((startup, idx) => (
              <motion.div
                key={startup.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + idx * 0.05 }}
                data-testid={`portfolio-card-${startup.id}`}
              >
                <div 
                  className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                  style={{ borderTopColor: getColor(startup.industry), borderTopWidth: '3px' }}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: getColor(startup.industry) + '30' }}
                    >
                      {startup.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-medium text-lg">{startup.name}</h3>
                      {startup.industry && (
                        <span 
                          className="inline-block px-2 py-1 rounded-full text-xs mt-1"
                          style={{ backgroundColor: getColor(startup.industry) + '20', color: getColor(startup.industry) }}
                        >
                          {startup.industry}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {startup.tagline && (
                    <p className="text-white/70 text-sm mb-4 line-clamp-2">{startup.tagline}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 text-xs text-white/40">
                    {startup.stage && (
                      <span className="px-2 py-1 rounded bg-white/5">{startup.stage}</span>
                    )}
                    {startup.location && (
                      <span className="px-2 py-1 rounded bg-white/5">{startup.location}</span>
                    )}
                    {startup.fundingTarget && (
                      <span className="px-2 py-1 rounded bg-white/5">{startup.fundingTarget}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
