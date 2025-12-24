import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronDown, ArrowRight } from "lucide-react";

// Import Framer components
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';
import Video from '@/framer/video';
import CategoryCard from '@/framer/category-card';

// Portfolio data from CSV - all companies for scrolling marquee
const portfolioCompanies = [
  { slug: "luminary", company: "Luminary", year: "2018", logo: "https://framerusercontent.com/images/KgtAGtRTufv55T47HQMdiGABrc.svg" },
  { slug: "aurora", company: "Aurora", year: "2018", logo: "https://framerusercontent.com/images/PrSGvwLO0tHXY6EY4gs79Fe6HQ.svg" },
  { slug: "finaura", company: "Finaura", year: "2017", logo: "https://framerusercontent.com/images/veK2JAOjmzwCRHDofEnkmrWBs.svg" },
  { slug: "prospera", company: "Prospera", year: "2020", logo: "https://framerusercontent.com/images/YGxUjYBwXZLXIfUZxCfokIc92Pk.svg" },
  { slug: "vitalis", company: "Vitalis", year: "2018", logo: "https://framerusercontent.com/images/ZqpqGN9yNO7oBAtX47EYanCjdW8.svg" },
  { slug: "paragon", company: "Paragon", year: "2019", logo: "https://framerusercontent.com/images/eNE4yl81pqH1MYfJmvrkEr6qQIc.svg" },
  { slug: "apexion", company: "Apexion", year: "2020", logo: "https://framerusercontent.com/images/NXhk88b8iOn638CFd6tFo00tQ.svg" },
  { slug: "nexus", company: "Nexus", year: "2023", logo: "https://framerusercontent.com/images/E9yjc6twTHgT29S1YaPojVb7p8.svg" },
];

// Industry categories matching Framer design exactly
const industries = [
  { 
    name: "Crypto", 
    description: "Investing in blockchain and cryptocurrency companies that are shaping the future of decentralized finance and digital assets.",
    fill: "rgb(251, 194, 213)"
  },
  { 
    name: "Technology", 
    description: "Backing innovative tech companies that are driving advancements in AI, cybersecurity, cloud computing, and more.",
    fill: "rgb(142, 132, 247)"
  },
  { 
    name: "Finance", 
    description: "Investing in financial technology companies that are transforming the way people bank, invest, and manage risk through fintech, lending, and insurtech solutions.",
    fill: "rgb(196, 227, 230)"
  },
  { 
    name: "Healthcare", 
    description: "Supporting healthcare companies that are improving patient outcomes through digital health, medical devices, biotech, and healthtech innovations.",
    fill: "rgb(254, 212, 92)"
  },
];

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
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <Link href="/" className="text-white text-xl font-light tracking-wider" data-testid="link-logo">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="flex items-center gap-6">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className="text-white/70 text-sm font-light hover:text-white transition-colors"
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
    </motion.header>
  );
};

// Hero Section with video background
const HeroSection = () => (
  <section className="relative flex flex-col items-center justify-center overflow-hidden bg-[rgb(18,18,18)]" style={{ height: '100vh', minHeight: '100vh' }}>
    {/* Video Background - Framer Video Component */}
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
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/50" />
    </div>

    <Navigation />

    {/* Hero Content */}
    <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20">
      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="inline-block mb-8"
      >
        <span 
          className="px-4 py-2 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
          data-testid="badge-companies"
        >
          BACKING OVER 50+ COMPANIES
        </span>
      </motion.div>

      {/* Main Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="text-5xl md:text-7xl lg:text-8xl font-light leading-tight mb-8"
        data-testid="text-hero-title"
      >
        <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Fueling</span>{" "}
        <span className="text-white font-extralight">Startups</span>
        <br />
        <span className="text-white font-extralight">with Capital</span>
      </motion.h1>

      {/* Subtext */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="text-white/60 text-lg md:text-xl max-w-xl mx-auto mb-12 font-light"
        data-testid="text-hero-description"
      >
        We invest in people, ideas, and companies with the potential to change the world.
      </motion.p>

      {/* CTA Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.9 }}
        className="flex flex-wrap items-center justify-center gap-4"
      >
        <Primary 
          text="Our Companies" 
          link="/portfolio"
          style={{ width: 'auto' }}
        />
        <Secondary 
          text="Contact" 
          link="/contact"
          style={{ width: 'auto' }}
        />
      </motion.div>
    </div>

    {/* Scroll Indicator */}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 1.2 }}
      className="absolute bottom-12 left-1/2 -translate-x-1/2"
    >
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-white/40"
      >
        <ChevronDown className="w-8 h-8" />
      </motion.div>
    </motion.div>
  </section>
);

// Industries Section - matching Framer design exactly using Framer CategoryCard
const IndustriesSection = () => (
  <section className="py-24 bg-[rgb(18,18,18)]">
    <div className="max-w-7xl mx-auto px-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-20"
      >
        <span className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6 block">INVESTMENT VERTICALS</span>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-2" data-testid="text-industries-title">
          We invest in innovative
        </h2>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white">
          <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>industries</span>{" "}
          <span className="text-white/40">focused on:</span>
        </h2>
      </motion.div>

      {/* Industry Cards - 4 columns using Framer CategoryCard component */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {industries.map((industry, idx) => (
          <motion.div
            key={industry.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            data-testid={`card-industry-${industry.name.toLowerCase()}`}
          >
            <CategoryCard
              category={industry.name}
              description={industry.description}
              fill={industry.fill}
              style={{ width: '100%', height: '100%', minHeight: '320px' }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

// Portfolio Section - horizontal scroll matching Framer design with marquee animation
const PortfolioSection = () => {
  // Duplicate array for seamless loop
  const duplicatedCompanies = [...portfolioCompanies, ...portfolioCompanies];
  
  return (
    <section className="py-24 bg-[rgb(18,18,18)] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-start justify-between mb-12"
        >
          <div>
            <span className="text-white/50 text-xs tracking-[0.2em] uppercase mb-3 block">OUR COMPANIES</span>
            <h2 className="text-4xl md:text-5xl font-light text-white" data-testid="text-portfolio-title">
              Portfolio
            </h2>
          </div>
          <Link href="/portfolio">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[rgb(142,132,247)] text-white text-sm font-medium hover:bg-[rgb(122,112,227)] transition-colors" data-testid="button-view-all">
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </motion.div>
      </div>

      {/* Portfolio Cards - scrolling marquee from right to left */}
      <div className="relative">
        <motion.div 
          className="flex gap-4"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ 
            x: {
              duration: 30,
              repeat: Infinity,
              ease: "linear"
            }
          }}
        >
          {duplicatedCompanies.map((company, idx) => (
            <div
              key={`${company.slug}-${idx}`}
              className="flex-shrink-0 w-[200px]"
              data-testid={`card-portfolio-${company.slug}-${idx}`}
            >
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors h-full">
                {/* Logo */}
                <div className="h-24 flex items-center justify-center mb-4">
                  <img src={company.logo} alt={company.company} className="h-12 w-auto object-contain invert opacity-80" />
                </div>
                {/* Company Info */}
                <div className="border-t border-white/10 pt-4">
                  <h3 className="text-base font-medium text-white">{company.company}</h3>
                  <p className="text-white/40 text-sm">{company.year}</p>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

// Team Section - matching Framer design with hero image
const TeamSection = () => (
  <section className="relative h-[80vh] min-h-[600px] overflow-hidden">
    {/* Background Image */}
    <div className="absolute inset-0">
      <img 
        src="https://framerusercontent.com/images/gtxhO5eQb8zTp6csYDNAsGA9k.jpg" 
        alt="Team" 
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/40" />
    </div>

    {/* Content */}
    <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-4xl md:text-6xl lg:text-7xl font-light text-white mb-8"
        data-testid="text-team-title"
      >
        We commit
        <br />
        <span className="italic" style={{ fontFamily: 'serif' }}>as one team.</span>
      </motion.h2>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Link href="/team">
          <button className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/30 text-white text-sm font-medium hover:bg-white/10 transition-colors" data-testid="button-meet-us">
            Meet Us <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </motion.div>
    </div>
  </section>
);

// Footer Section
const FooterSection = () => (
  <footer className="py-16 bg-[rgb(18,18,18)] border-t border-white/10">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
        <div>
          <Link href="/" className="text-white text-xl font-light tracking-wider block mb-6">
            Anker<sup className="text-xs">®</sup>
          </Link>
          <p className="text-white/40 text-sm leading-relaxed">
            Investing in the future of decentralized finance and digital assets.
          </p>
        </div>
        
        <div>
          <h4 className="text-white font-medium mb-6">Company</h4>
          <div className="flex flex-col gap-4">
            <Link href="/team" className="text-white/40 hover:text-white transition-colors text-sm">Team</Link>
            <Link href="/newsroom" className="text-white/40 hover:text-white transition-colors text-sm">Newsroom</Link>
            <Link href="/contact" className="text-white/40 hover:text-white transition-colors text-sm">Contact</Link>
          </div>
        </div>
        
        <div>
          <h4 className="text-white font-medium mb-6">Legal</h4>
          <div className="flex flex-col gap-4">
            <Link href="#" className="text-white/40 hover:text-white transition-colors text-sm">Privacy Policy</Link>
            <Link href="#" className="text-white/40 hover:text-white transition-colors text-sm">Terms of Service</Link>
          </div>
        </div>
        
        <div>
          <h4 className="text-white font-medium mb-6">Social</h4>
          <div className="flex gap-4">
            <a href="#" className="text-white/40 hover:text-white transition-colors text-sm">Twitter</a>
            <a href="#" className="text-white/40 hover:text-white transition-colors text-sm">LinkedIn</a>
          </div>
        </div>
      </div>
      
      <div className="mt-16 pt-8 border-t border-white/10 text-center">
        <p className="text-white/30 text-sm">
          © 2024 Anker. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
);

// Main Home Page Component
export default function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-[rgb(18,18,18)]"
    >
      <HeroSection />
      <IndustriesSection />
      <PortfolioSection />
      <TeamSection />
      <FooterSection />
    </motion.div>
  );
}
