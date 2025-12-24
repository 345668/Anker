import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

import Secondary from '@/framer/secondary';

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

const portfolioItems = [
  { 
    slug: "aurora", 
    company: "Aurora", 
    category: "Crypto", 
    description: "Aurora provides advanced security solutions for blockchain-based applications, protecting digital assets and ensuring secure transactions.", 
    color: "rgb(251, 194, 213)", 
    logo: "https://framerusercontent.com/images/PrSGvwLO0tHXY6EY4gs79Fe6HQ.svg", 
    image: "https://framerusercontent.com/images/I0JLD4ZrkQ2m8SgO1b7ObGpY0Y.jpg",
    year: "2021"
  },
  { 
    slug: "apexion", 
    company: "Apexion", 
    category: "Technology", 
    description: "Challenging the status quo to create a new generation of financial services and enterprise solutions.", 
    color: "rgb(142, 132, 247)", 
    logo: "https://framerusercontent.com/images/NXhk88b8iOn638CFd6tFo00tQ.svg", 
    image: "https://framerusercontent.com/images/UsUSF8fVDcDg541n4L2rJAhIxNY.jpg",
    year: "2020"
  },
  { 
    slug: "medify", 
    company: "Medify", 
    category: "Healthcare", 
    description: "Medify offers a telemedicine platform for modern healthcare, connecting patients with doctors seamlessly.", 
    color: "rgb(254, 212, 92)", 
    logo: "https://framerusercontent.com/images/o1uwcdsdeMENOeMrzUaeDZsi4.svg", 
    image: "https://framerusercontent.com/images/QPbxJzSomgVjzBqsCDWlXDen47g.jpg",
    year: "2022"
  },
  { 
    slug: "prospera", 
    company: "Prospera", 
    category: "Finance", 
    description: "Prospera offers a digital platform for personal finance management, empowering users to take control of their finances.", 
    color: "rgb(196, 227, 230)", 
    logo: "https://framerusercontent.com/images/YGxUjYBwXZLXIfUZxCfokIc92Pk.svg", 
    image: "https://framerusercontent.com/images/gtxhO5eQb8zTp6csYDNAsGA9k.jpg",
    year: "2019"
  },
  { 
    slug: "nexus", 
    company: "Nexus", 
    category: "Technology", 
    description: "Nexus creates innovative IoT solutions for the connected world, building smart infrastructure for tomorrow.", 
    color: "rgb(142, 132, 247)", 
    logo: "https://framerusercontent.com/images/E9yjc6twTHgT29S1YaPojVb7p8.svg", 
    image: "https://framerusercontent.com/images/Rf6AGJdqHXAyTMdqgeIEMydTW4.jpg",
    year: "2021"
  },
  { 
    slug: "vitalis", 
    company: "Vitalis", 
    category: "Healthcare", 
    description: "Vitalis develops personalized medicine solutions using cutting-edge genetic analysis and AI.", 
    color: "rgb(254, 212, 92)", 
    logo: "https://framerusercontent.com/images/ZqpqGN9yNO7oBAtX47EYanCjdW8.svg", 
    image: "https://framerusercontent.com/images/FgA1lEYmTjFwXZKDZbC2INNrVg.jpg",
    year: "2023"
  },
];

const categories = ["All", "Crypto", "Technology", "Healthcare", "Finance"];

export default function Portfolio() {
  const [activeCategory, setActiveCategory] = useState("All");

  const filteredItems = activeCategory === "All" 
    ? portfolioItems 
    : portfolioItems.filter(item => item.category === activeCategory);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />
      
      <div className="pt-32 pb-24 max-w-7xl mx-auto px-6">
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

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <span 
            className="inline-block px-4 py-2 mb-6 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
            data-testid="badge-portfolio"
          >
            Our Portfolio
          </span>
          <h1 className="text-5xl md:text-6xl font-light text-white mb-6" data-testid="text-portfolio-title">
            Companies We've
            <br />
            <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>
              Backed
            </span>
          </h1>
          <p className="text-xl text-white/50 font-light max-w-2xl">
            We partner with ambitious founders building the future across crypto, technology, healthcare, and finance.
          </p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredItems.map((item, idx) => (
            <motion.div
              key={item.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 + idx * 0.1 }}
              className="group"
              data-testid={`portfolio-card-${item.slug}`}
            >
              <div 
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                style={{ aspectRatio: '4/3' }}
              >
                <img 
                  src={item.image} 
                  alt={item.company}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={item.logo} alt="" className="w-8 h-8" />
                    <span 
                      className="px-3 py-1 rounded-full text-xs"
                      style={{ backgroundColor: item.color, color: 'black' }}
                    >
                      {item.category}
                    </span>
                  </div>
                  <h3 className="text-2xl font-light text-white mb-2">{item.company}</h3>
                  <p className="text-white/60 text-sm line-clamp-2">{item.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
