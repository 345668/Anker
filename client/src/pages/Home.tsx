import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Link } from "wouter";
import { 
  ChevronDown, ArrowRight, Cpu, Heart, Building2, Landmark, Film, ShoppingBag, 
  Leaf, Truck, GraduationCap, Sprout, Factory, Car, Rocket, Dna, Plane, Trophy, Scale, Users
} from "lucide-react";

// Import Framer components
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';
import Video from '@/framer/video';

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

// Expanded industry categories - truly industry-agnostic
const industries = [
  { name: "Technology", icon: Cpu },
  { name: "Healthcare", icon: Heart },
  { name: "Real Estate", icon: Building2 },
  { name: "Finance", icon: Landmark },
  { name: "Entertainment", icon: Film },
  { name: "Consumer", icon: ShoppingBag },
  { name: "CleanTech", icon: Leaf },
  { name: "Logistics", icon: Truck },
  { name: "Education", icon: GraduationCap },
  { name: "AgriTech", icon: Sprout },
  { name: "Manufacturing", icon: Factory },
  { name: "Automotive", icon: Car },
  { name: "Aerospace", icon: Rocket },
  { name: "Biotech", icon: Dna },
  { name: "Travel", icon: Plane },
  { name: "Sports", icon: Trophy },
  { name: "Legal", icon: Scale },
  { name: "HR & Work", icon: Users },
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

// Hero Section with video background and parallax
const HeroSection = () => {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  
  // Parallax transformations - video moves slower than scroll
  const videoY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "15%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section 
      ref={heroRef}
      className="relative flex flex-col items-center justify-center overflow-hidden bg-[rgb(18,18,18)]" 
      style={{ height: '100vh', minHeight: '100vh' }}
    >
      {/* Video Background with Parallax */}
      <motion.div 
        className="absolute inset-0 w-full h-full"
        style={{ y: videoY }}
      >
        <Video 
          file="https://framerusercontent.com/assets/vbOBoy0MLbMZbX0cLl9GPpNhA.mp4"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '120%',
            objectFit: 'cover',
          }}
        />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/50" />
      </motion.div>

      <Navigation />

      {/* Hero Content with Parallax */}
      <motion.div 
        className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20"
        style={{ y: contentY, opacity }}
      >
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
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2"
        style={{ opacity }}
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

// Industries Section - compact grid with video background and parallax
const IndustriesSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });
  
  // Subtle parallax for video background
  const videoY = useTransform(scrollYProgress, [0, 1], ["-10%", "10%"]);
  const videoScale = useTransform(scrollYProgress, [0, 1], [1.1, 1]);

  return (
    <section ref={sectionRef} className="relative py-24 overflow-hidden">
      {/* Cinematic Video Background with Parallax */}
      <motion.div 
        className="absolute inset-0"
        style={{ y: videoY, scale: videoScale }}
      >
        <video 
          autoPlay 
          muted 
          loop 
          playsInline
          className="w-full h-full object-cover"
          aria-label="Cinematic montage representing diverse industries"
          poster="https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1920"
        >
          <source src="https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_25fps.mp4" type="video/mp4" />
        </video>
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-[rgb(18,18,18)] via-[rgb(18,18,18)]/85 to-[rgb(18,18,18)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <span className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6 block">INVESTMENT VERTICALS</span>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-2" data-testid="text-industries-title">Truly industry</h2>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white">
          <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>agnostic</span>{" "}
          <span className="text-white/40">investing</span>
        </h2>
        <p className="text-white/50 mt-6 max-w-2xl mx-auto text-lg">
          From cutting-edge tech startups to landmark real estate developments and cinematic productions
        </p>
      </motion.div>

      {/* Compact Industry Grid - 6 columns on desktop */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {industries.map((industry, idx) => {
          const IconComponent = industry.icon;
          return (
            <motion.div
              key={industry.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.03, duration: 0.4 }}
              className="group flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer"
              data-testid={`card-industry-${industry.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <IconComponent className="w-8 h-8 mb-3 text-[rgb(142,132,247)] group-hover:text-white transition-colors" />
              <span className="text-white/80 text-xs sm:text-sm font-medium text-center leading-tight group-hover:text-white transition-colors">
                {industry.name}
              </span>
            </motion.div>
          );
        })}
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
