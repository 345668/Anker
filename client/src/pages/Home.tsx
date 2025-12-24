import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";

// Import Framer components
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';

// Portfolio data
const portfolioItems = [
  { slug: "aurora", company: "Aurora", category: "Crypto", description: "Aurora provides advanced security solutions for blockchain-based applications.", color: "rgb(251, 194, 213)", logo: "https://framerusercontent.com/images/PrSGvwLO0tHXY6EY4gs79Fe6HQ.svg", image: "https://framerusercontent.com/images/I0JLD4ZrkQ2m8SgO1b7ObGpY0Y.jpg" },
  { slug: "apexion", company: "Apexion", category: "Technology", description: "Challenging the status quo to create a new generation of financial services.", color: "rgb(142, 132, 247)", logo: "https://framerusercontent.com/images/NXhk88b8iOn638CFd6tFo00tQ.svg", image: "https://framerusercontent.com/images/UsUSF8fVDcDg541n4L2rJAhIxNY.jpg" },
  { slug: "medify", company: "Medify", category: "Healthcare", description: "Medify offers a telemedicine platform for modern healthcare.", color: "rgb(254, 212, 92)", logo: "https://framerusercontent.com/images/o1uwcdsdeMENOeMrzUaeDZsi4.svg", image: "https://framerusercontent.com/images/QPbxJzSomgVjzBqsCDWlXDen47g.jpg" },
  { slug: "prospera", company: "Prospera", category: "Finance", description: "Prospera offers a digital platform for personal finance management.", color: "rgb(196, 227, 230)", logo: "https://framerusercontent.com/images/YGxUjYBwXZLXIfUZxCfokIc92Pk.svg", image: "https://framerusercontent.com/images/gtxhO5eQb8zTp6csYDNAsGA9k.jpg" },
  { slug: "nexus", company: "Nexus", category: "Technology", description: "Nexus creates innovative IoT solutions for the connected world.", color: "rgb(142, 132, 247)", logo: "https://framerusercontent.com/images/E9yjc6twTHgT29S1YaPojVb7p8.svg", image: "https://framerusercontent.com/images/Rf6AGJdqHXAyTMdqgeIEMydTW4.jpg" },
  { slug: "vitalis", company: "Vitalis", category: "Healthcare", description: "Vitalis develops personalized medicine solutions.", color: "rgb(254, 212, 92)", logo: "https://framerusercontent.com/images/ZqpqGN9yNO7oBAtX47EYanCjdW8.svg", image: "https://framerusercontent.com/images/FgA1lEYmTjFwXZKDZbC2INNrVg.jpg" },
];

const categories = [
  { name: "Crypto", description: "Investing in blockchain and cryptocurrency companies that are shaping the future of decentralized finance and digital assets.", color: "rgb(251, 194, 213)" },
  { name: "Technology", description: "Backing innovative tech companies building the infrastructure of tomorrow.", color: "rgb(142, 132, 247)" },
  { name: "Healthcare", description: "Supporting healthcare innovation from telemedicine to personalized medicine.", color: "rgb(254, 212, 92)" },
  { name: "Finance", description: "Empowering the next generation of fintech solutions.", color: "rgb(196, 227, 230)" },
];

const values = [
  { number: "01", title: "Innovation", description: "Embracing bold ideas and new solutions that transform industries, drive growth, and create new opportunities for people and businesses." },
  { number: "02", title: "Integrity", description: "Building trust through transparency, honest collaboration, and unwavering commitment to ethical practices in everything we do." },
  { number: "03", title: "Community", description: "Fostering a global ecosystem of developers, creators, and users united by a shared vision for the future." },
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
    {/* Video Background - Full viewport coverage */}
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover"
        src="https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4"
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

// Portfolio Section
const PortfolioSection = () => (
  <section className="py-32 bg-[rgb(18,18,18)]">
    <div className="max-w-7xl mx-auto px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mb-16"
      >
        <h2 className="text-4xl md:text-5xl font-light text-white mb-4" data-testid="text-portfolio-title">
          Our Portfolio
        </h2>
        <p className="text-white/50 text-lg max-w-xl">
          Backing the most ambitious founders across crypto, technology, healthcare, and finance.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {portfolioItems.map((item, idx) => (
          <motion.div
            key={item.slug}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            data-testid={`card-portfolio-${item.slug}`}
          >
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5" style={{ aspectRatio: '4/3' }}>
              <img src={item.image} alt={item.company} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <img src={item.logo} alt="" className="w-8 h-8" />
                  <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: item.color, color: 'rgb(18,18,18)' }}>{item.category}</span>
                </div>
                <h3 className="text-xl font-medium text-white mb-2">{item.company}</h3>
                <p className="text-white/60 text-sm">{item.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

// Categories Section
const CategoriesSection = () => (
  <section className="py-32 bg-[rgb(24,24,24)]">
    <div className="max-w-7xl mx-auto px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-20"
      >
        <h2 className="text-4xl md:text-5xl font-light text-white mb-4" data-testid="text-categories-title">
          Investment Focus
        </h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          We invest across four key sectors driving innovation and growth.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map((cat, idx) => (
          <motion.div
            key={cat.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            data-testid={`card-category-${cat.name.toLowerCase()}`}
          >
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5 h-full">
              <div className="w-12 h-12 rounded-full mb-6" style={{ backgroundColor: cat.color }} />
              <h3 className="text-xl font-medium text-white mb-3">{cat.name}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{cat.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

// Values Section
const ValuesSection = () => (
  <section className="py-32 bg-[rgb(18,18,18)]">
    <div className="max-w-7xl mx-auto px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-20"
      >
        <h2 className="text-4xl md:text-5xl font-light text-white mb-4" data-testid="text-values-title">
          Our Values
        </h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          We are driven by a core set of principles that guide our investment decisions and partnerships.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {values.map((value, idx) => (
          <motion.div
            key={value.number}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.15, duration: 0.5 }}
            data-testid={`card-value-${value.number}`}
          >
            <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
              <span className="text-[rgb(142,132,247)] text-sm font-mono mb-4 block">{value.number}</span>
              <h3 className="text-2xl font-medium text-white mb-4">{value.title}</h3>
              <p className="text-white/50 leading-relaxed">{value.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
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
            <a href="#" className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/40 hover:text-white hover:border-white/40 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
            </a>
            <a href="#" className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/40 hover:text-white hover:border-white/40 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
          </div>
        </div>
      </div>
      
      <div className="mt-16 pt-8 border-t border-white/10 text-center text-white/30 text-sm">
        © 2024 Anker Inc. All rights reserved.
      </div>
    </div>
  </footer>
);

export default function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col bg-[rgb(18,18,18)]"
    >
      <HeroSection />
      <PortfolioSection />
      <CategoriesSection />
      <ValuesSection />
      <FooterSection />
    </motion.div>
  );
}
