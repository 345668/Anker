import { motion, useScroll, useTransform, AnimatePresence, PanInfo } from "framer-motion";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { 
  ChevronDown, ArrowRight, Cpu, Heart, Building2, Landmark, Film, ShoppingBag, 
  Leaf, Truck, GraduationCap, Sprout, Factory, Car, Rocket, Dna, Plane, Trophy, Scale, Users
} from "lucide-react";

// Import Framer components
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';

// Portfolio data - real startups from the network
const portfolioCompanies = [
  {
    name: "FineTaste",
    role: "Authenticating the Italian experience",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/fc6581e83_Screenshot2025-12-16at92632PM.png",
    demoUrl: "https://www.finetaste.it/en/collections/cantina-pisoni-vini-biologici-trentini"
  },
  {
    name: "Kinu Health",
    role: "Personalizing care and accelerating the learning curve for autoimmune disease patients",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/24b487db4_Screenshot2025-12-16at84801PM.png",
    demoUrl: "https://www.kinuhealth.com"
  },
  {
    name: "Perfi",
    role: "3D Printing nature's design with novel freeform manufacturing",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/8191b9b9f_Screenshot2025-12-16at85009PM.png",
    demoUrl: "https://perfi.dk"
  },
  {
    name: "Mint Town",
    role: "Project Toyrium - blending art toys with culture, and aligning its Web3 financial tokenized value",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/1b2883343_Screenshot2025-12-16at102745PM.png",
    demoUrl: "https://minttown.jp"
  },
  {
    name: "Capsero",
    role: "Empowering health by phytointelligence",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/58f533618_Screenshot2025-12-16at84940PM.png",
    demoUrl: "https://capsero.com"
  },
  {
    name: "Alga Biologics",
    role: "Revolutionising bioproduction thanks to microalgae",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/f3c84ab64_Screenshot2025-12-16at85034PM.png",
    demoUrl: "https://www.algabiologics.com/en"
  },
  {
    name: "Melsonic",
    role: "Your AI companion that complements your teaching and amplifies your impact",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/20513527a_Screenshot2025-12-16at101655PM.png",
    demoUrl: "https://www.melsonic.com"
  },
  {
    name: "NXZ Sound",
    role: "Stop buying beats, use NXZSound",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/22ec19f9e_Screenshot2025-12-16at85112PM.png",
    demoUrl: "https://nxzsound.com"
  },
  {
    name: "Nextvisit",
    role: "AI-powered clinical documentation for modern healthcare",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/3736abb26_Screenshot2025-12-16at85149PM.png",
    demoUrl: "https://nextvisit.ai"
  },
  {
    name: "Dotplot",
    role: "At-home breast health monitoring",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/ef34f8e43_Screenshot2025-12-16at84912PM.png",
    demoUrl: "https://dotplot.co"
  },
  {
    name: "Loma Therapeutics",
    role: "Best-in-class treatment of HPV+ cancers",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/5cb6b2fa3_Screenshot2025-12-16at105132PM.png",
    demoUrl: "https://lomatherapeutics.com"
  },
  {
    name: "Cascade Geomatics",
    role: "Advanced sensing and AI modeling to make mountain environments safer",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/aa2b4a3f3_Screenshot2025-12-16at105840PM.png",
    demoUrl: "https://cascadegeomatics.com"
  },
  {
    name: "Doge Brains",
    role: "Your Meme Coin Intelligence Agent",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/9e72c03ff_Screenshot2025-12-16at110350PM.png",
    demoUrl: "https://dogebrains.com"
  },
  {
    name: "Volta - XRPayNet",
    role: "Making the Crypto to Fiat payment process seamless",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/ba6f0230b_Screenshot2025-12-16at113440PM.png",
    demoUrl: "https://xrpaynet.com"
  }
];

// Expanded industry categories with background images
const industries = [
  { name: "Technology", icon: Cpu, description: "AI, SaaS, and digital infrastructure", image: "https://images.pexels.com/photos/373543/pexels-photo-373543.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Healthcare", icon: Heart, description: "Digital health and medical innovation", image: "https://images.pexels.com/photos/4386467/pexels-photo-4386467.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Real Estate", icon: Building2, description: "Property development and PropTech", image: "https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Finance", icon: Landmark, description: "FinTech and financial services", image: "https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Entertainment", icon: Film, description: "Media, gaming, and content creation", image: "https://images.pexels.com/photos/1983046/pexels-photo-1983046.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Consumer", icon: ShoppingBag, description: "E-commerce and consumer brands", image: "https://images.pexels.com/photos/5632399/pexels-photo-5632399.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "CleanTech", icon: Leaf, description: "Renewable energy and sustainability", image: "https://images.pexels.com/photos/9875441/pexels-photo-9875441.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Logistics", icon: Truck, description: "Supply chain and delivery innovation", image: "https://images.pexels.com/photos/4481259/pexels-photo-4481259.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Education", icon: GraduationCap, description: "EdTech and learning platforms", image: "https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "AgriTech", icon: Sprout, description: "Agricultural technology and farming", image: "https://images.pexels.com/photos/2132171/pexels-photo-2132171.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Manufacturing", icon: Factory, description: "Industrial automation and robotics", image: "https://images.pexels.com/photos/3846508/pexels-photo-3846508.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Automotive", icon: Car, description: "Electric vehicles and mobility", image: "https://images.pexels.com/photos/3729464/pexels-photo-3729464.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Aerospace", icon: Rocket, description: "Space technology and aviation", image: "https://images.pexels.com/photos/586063/pexels-photo-586063.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Biotech", icon: Dna, description: "Life sciences and pharmaceuticals", image: "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Travel", icon: Plane, description: "Hospitality and travel technology", image: "https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Sports", icon: Trophy, description: "Sports tech and athletics", image: "https://images.pexels.com/photos/46798/the-ball-stadion-football-the-pitch-46798.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "Legal", icon: Scale, description: "LegalTech and compliance", image: "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=800" },
  { name: "HR & Work", icon: Users, description: "Future of work and HR tech", image: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800" },
];

// Navigation Component matching Framer design
const Navigation = () => {
  const navLinks = [
    { label: "Tesseract", href: "/tesseract" },
    { label: "About", href: "/about" },
    { label: "Vision", href: "/vision" },
    { label: "Team", href: "/team" },
    { label: "Newsroom", href: "/newsroom" },
    { label: "FAQ", href: "/faq" },
    { label: "Platform", href: "/app" },
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
const HeroSection = () => {
  return (
    <section 
      className="relative flex flex-col items-center justify-center overflow-hidden bg-[rgb(18,18,18)]" 
      style={{ height: '100vh', minHeight: '100vh' }}
    >
      {/* Video Background */}
      <div className="absolute inset-0 w-full h-full">
        <video 
          autoPlay 
          muted 
          loop 
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          poster="https://images.pexels.com/photos/373543/pexels-photo-373543.jpeg?auto=compress&cs=tinysrgb&w=1920"
        >
          <source src="https://cdn.coverr.co/videos/coverr-abstract-digital-network-8477/1080p.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/70" />
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
            CONNECTING FOUNDERS WITH INVESTORS
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
          <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Fueling </span>{" "}
          <span className="text-white font-extralight">Vision</span>
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
          We connect visionary projects with the right capital through AI-powered matching across startups, real estate, and creative ventures.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Primary 
            text="Get Started" 
            link="/app"
            style={{ width: 'auto' }}
          />
          <Secondary 
            text="Contact" 
            link="/contact"
            style={{ width: 'auto' }}
          />
        </motion.div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.1 }}
          className="flex items-center justify-center gap-12 mt-12"
        >
          <div className="text-center" data-testid="stat-investment-firms">
            <p className="text-3xl md:text-4xl font-light text-white">19K+</p>
            <p className="text-white/50 text-sm mt-1">Investment Firms</p>
          </div>
          <div className="w-px h-12 bg-white/20" />
          <div className="text-center" data-testid="stat-investors">
            <p className="text-3xl md:text-4xl font-light text-white">60K+</p>
            <p className="text-white/50 text-sm mt-1">Investors</p>
          </div>
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
};

// Industries Section - Premium Swipeable Card Stack with Video Backgrounds
const IndustriesSection = () => {
  const [cardOrder, setCardOrder] = useState(industries.map((_, i) => i));
  const [exitDirection, setExitDirection] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 80;
    const velocity = Math.abs(info.velocity.x);
    
    if (Math.abs(info.offset.x) > threshold || velocity > 500) {
      setExitDirection(info.offset.x > 0 ? 1 : -1);
      setCardOrder(prev => {
        const newOrder = [...prev];
        const topCard = newOrder.shift();
        if (topCard !== undefined) {
          newOrder.push(topCard);
        }
        return newOrder;
      });
    }
  };

  return (
    <section className="relative py-32 bg-[rgb(12,12,12)] overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[rgb(142,132,247)]/3 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[rgb(100,80,200)]/3 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="text-[rgb(142,132,247)] text-xs tracking-[0.3em] uppercase mb-6 block font-medium">INVESTMENT VERTICALS</span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-2" data-testid="text-industries-title">Truly industry</h2>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white">
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>agnostic</span>{" "}
            <span className="text-white/40">investing</span>
          </h2>
          <p className="text-white/50 mt-8 max-w-2xl mx-auto text-lg font-light">
            From cutting-edge tech startups to landmark real estate developments and cinematic productions
          </p>
        </motion.div>

        {/* Swipeable Card Stack */}
        <div className="relative h-[520px] flex items-center justify-center">
          {/* Card Stack */}
          <div className="relative w-[380px] h-[480px]">
            <AnimatePresence mode="popLayout">
              {cardOrder.slice(0, 4).map((industryIndex, stackPosition) => {
                const industry = industries[industryIndex];
                const IconComponent = industry.icon;
                const isTop = stackPosition === 0;
                
                const yOffset = stackPosition * 12;
                const xOffset = stackPosition * 4;
                const scale = 1 - stackPosition * 0.05;
                const cardOpacity = 1 - stackPosition * 0.2;
                const zIndex = 10 - stackPosition;
                const rotation = stackPosition * 2;

                return (
                  <motion.div
                    key={industryIndex}
                    layout
                    initial={{ 
                      scale: 0.8, 
                      opacity: 0,
                      y: 100,
                      rotateZ: 0
                    }}
                    animate={{ 
                      scale,
                      opacity: cardOpacity,
                      y: yOffset,
                      x: xOffset,
                      rotateZ: rotation,
                      transition: { 
                        type: "spring",
                        stiffness: 300,
                        damping: 30
                      }
                    }}
                    exit={{ 
                      x: exitDirection * 400,
                      opacity: 0,
                      rotateZ: exitDirection * 25,
                      scale: 0.9,
                      transition: { 
                        type: "spring",
                        stiffness: 200,
                        damping: 20
                      }
                    }}
                    drag={isTop ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.7}
                    onDragStart={isTop ? handleDragStart : undefined}
                    onDragEnd={isTop ? handleDragEnd : undefined}
                    whileDrag={{ 
                      cursor: "grabbing", 
                      scale: 1.03,
                      boxShadow: "0 30px 60px rgba(0,0,0,0.4)"
                    }}
                    style={{ zIndex }}
                    className={`absolute top-0 left-0 w-full h-full rounded-[28px] overflow-hidden shadow-2xl ${isTop ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    data-testid={`card-industry-${industry.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {/* Image Background */}
                    <div className="absolute inset-0">
                      <img 
                        src={industry.image}
                        alt={industry.name}
                        className="w-full h-full object-cover"
                      />
                      {/* Gradient overlays */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
                      <div className="absolute inset-0 bg-[rgb(142,132,247)]/5" />
                    </div>

                    {/* Glassmorphism border effect */}
                    <div className="absolute inset-0 rounded-[28px] border border-white/20" />

                    {/* Card Content */}
                    <div className="relative z-10 flex flex-col justify-end h-full p-8">
                      {/* Icon Badge */}
                      <div className="absolute top-6 left-6">
                        <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                          <IconComponent className="w-7 h-7 text-white" />
                        </div>
                      </div>

                      {/* Card number */}
                      <div className="absolute top-6 right-6 text-white/30 text-sm font-light">
                        {String(industryIndex + 1).padStart(2, '0')}/{industries.length}
                      </div>
                      
                      {/* Text Content */}
                      <div className="space-y-3">
                        <h3 className="text-3xl font-semibold text-white tracking-tight">
                          {industry.name}
                        </h3>
                        <p className="text-white/70 text-base leading-relaxed">
                          {industry.description}
                        </p>
                      </div>

                      {/* Progress dots */}
                      <div className="flex items-center gap-1.5 mt-6">
                        {industries.slice(0, 8).map((_, i) => (
                          <div 
                            key={i} 
                            className={`h-1 rounded-full transition-all duration-300 ${
                              cardOrder[0] === i 
                                ? 'w-6 bg-[rgb(142,132,247)]' 
                                : 'w-1.5 bg-white/30'
                            }`}
                          />
                        ))}
                        {industries.length > 8 && (
                          <span className="text-white/30 text-xs ml-1">+{industries.length - 8}</span>
                        )}
                      </div>
                    </div>

                    {/* Drag indicator overlay for top card */}
                    {isTop && isDragging && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-[rgb(142,132,247)]/10 pointer-events-none"
                      />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Swipe instruction - centered with card stack */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="absolute -bottom-8 w-[380px] flex items-center justify-center gap-4 text-white/40 text-sm"
          >
            <motion.span
              animate={{ x: [-3, 3, -3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ←
            </motion.span>
            <span className="text-white/30">Swipe to explore</span>
            <motion.span
              animate={{ x: [3, -3, 3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              →
            </motion.span>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// Portfolio Section - horizontal scroll with startup cards
const PortfolioSection = () => {
  const duplicatedCompanies = [...portfolioCompanies, ...portfolioCompanies, ...portfolioCompanies];
  const cardWidth = 288;
  const totalWidth = portfolioCompanies.length * cardWidth;
  
  const handleStartupClick = (startup: typeof portfolioCompanies[0]) => {
    if (startup.demoUrl) {
      window.open(startup.demoUrl, '_blank');
    }
  };
  
  return (
    <section className="py-24 bg-[rgb(18,18,18)] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-start justify-between gap-4 mb-12"
        >
          <div>
            <span className="text-white/50 text-xs tracking-[0.2em] uppercase mb-3 block">OUR COMPANIES</span>
            <h2 className="text-4xl md:text-5xl font-light text-white" data-testid="text-portfolio-title">
              Startups<sup className="text-xl ml-1">({portfolioCompanies.length})</sup>
            </h2>
          </div>
          <Link href="/portfolio">
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[rgb(142,132,247)] text-white text-sm font-medium hover:bg-[rgb(122,112,227)] transition-colors" data-testid="button-view-all">
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </motion.div>
      </div>
      <div className="relative">
        <motion.div 
          className="flex gap-6"
          animate={{ x: [`0px`, `-${totalWidth}px`] }}
          transition={{ 
            x: {
              duration: 50,
              repeat: Infinity,
              repeatType: "loop",
              ease: "linear"
            }
          }}
        >
          {duplicatedCompanies.map((startup, idx) => (
            <motion.div
              key={`${startup.name}-${idx}`}
              className="flex-shrink-0 w-72"
              data-testid={`card-startup-${startup.name.toLowerCase().replace(/\s+/g, '-')}-${idx}`}
            >
              <motion.div 
                className="relative overflow-hidden rounded-lg bg-white h-48 cursor-pointer group"
                onClick={() => handleStartupClick(startup)}
                whileHover="visible"
                initial="hidden"
              >
                <motion.img 
                  src={startup.image} 
                  alt={startup.name}
                  className="w-full h-full object-contain p-6"
                  variants={{
                    hidden: { scale: 1 },
                    visible: { scale: 1.05 }
                  }}
                  transition={{ duration: 0.4 }}
                />
                
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end p-4"
                  variants={{
                    hidden: { opacity: 0, backdropFilter: "blur(0px)" },
                    visible: { opacity: 1, backdropFilter: "blur(2px)" }
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.h3 
                    className="font-serif italic text-lg font-medium text-white mb-1 leading-tight"
                    variants={{
                      hidden: { y: 20, opacity: 0 },
                      visible: { y: 0, opacity: 1 }
                    }}
                  >
                    {startup.name}
                  </motion.h3>
                  <motion.p 
                    className="text-sm text-white/90 leading-tight line-clamp-2"
                    variants={{
                      hidden: { y: 20, opacity: 0 },
                      visible: { y: 0, opacity: 1 }
                    }}
                  >
                    {startup.role}
                  </motion.p>
                </motion.div>
              </motion.div>
            </motion.div>
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
