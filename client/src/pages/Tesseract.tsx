import { motion } from "framer-motion";
import { Link } from "wouter";
import { Shield, Users, Calendar, Building2, Landmark, Home as HomeIcon, TrendingUp, CheckCircle, Sparkles, MessageCircle, UserCheck } from "lucide-react";

import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';

const Navigation = () => {
  const navLinks = [
    { label: "Tesseract", href: "/tesseract" },
    { label: "About", href: "/about" },
    { label: "Vision", href: "/vision" },
    { label: "Team", href: "/team" },
    { label: "Newsroom", href: "/newsroom" },
    { label: "FAQ", href: "/faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-transparent">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <Link href="/" className="text-white text-xl font-light tracking-wider" data-testid="link-logo">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-light transition-colors ${link.href === '/tesseract' ? 'text-white' : 'text-white/70 hover:text-white'}`}
              data-testid={`link-nav-${link.label.toLowerCase()}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <Primary 
          text="Request Access" 
          link="/contact"
          style={{ transform: 'scale(0.9)' }}
          data-testid="button-request-access"
        />
      </div>
    </header>
  );
};

const assetClasses = [
  {
    icon: TrendingUp,
    title: "Venture Capital",
    description: "Backing innovation from early to growth stages - from AI to PropTech and FinTech to ClimateTech - fueling the next generation of transformative companies."
  },
  {
    icon: Landmark,
    title: "Private Debt",
    description: "Flexible lending and credit structures supporting global enterprise - from corporate lending to infrastructure and special situations finance."
  },
  {
    icon: HomeIcon,
    title: "Real Estate",
    description: "From residential and logistics to data centers and education - co-invest with real estate developers and institutional funds."
  },
  {
    icon: Building2,
    title: "Private Equity",
    description: "From growth and pre-IPO rounds to distressed and sector-specific buyouts, members back real companies creating enduring value."
  }
];

const trustPillars = [
  {
    icon: Shield,
    title: "Built on Trust",
    description: "Background screening ensures every applicant aligns with the highest ethical and financial standards."
  },
  {
    icon: CheckCircle,
    title: "Confirmed Capital",
    description: "Financial validation confirms your capacity to invest and participate meaningfully in curated opportunities brought by other members."
  },
  {
    icon: UserCheck,
    title: "Refreshingly Human",
    description: "Multi-layered verification confirms that who you are in the real world matches who you are online."
  }
];

const features = [
  {
    icon: MessageCircle,
    title: "Collaborate Privately",
    description: "Trust and privacy are the pillars of the Inner Circle."
  },
  {
    icon: Users,
    title: "Aligned Intelligence",
    description: "Meet like-minded high caliber individuals looking to collaborate."
  },
  {
    icon: Calendar,
    title: "Events & Circles",
    description: "Gather in private settings built for trust and insight."
  }
];

export default function Tesseract() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />

      {/* Hero Section with Globe Video */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <video 
            autoPlay
            loop
            muted
            playsInline
            poster="https://images.pexels.com/photos/355935/pexels-photo-355935.jpeg?auto=compress&cs=tinysrgb&w=1920"
            className="absolute top-0 left-0 w-full h-full object-cover"
          >
            <source src="https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[rgb(18,18,18)]" />
        </div>

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto pt-32">
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 leading-tight"
            data-testid="text-tesseract-title"
          >
            <span className="italic" style={{ fontFamily: 'serif' }}>The Global Network</span>
            <br />
            for the Next Era of
            <br />
            <span className="text-[rgb(200,170,130)]">Investing</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10"
          >
            A trusted circle of sovereign families, investors, and deal sponsors redefining wealth, culture, and longevity in the age of AI.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Primary 
              text="Request Access" 
              link="/contact"
              data-testid="button-hero-request-access"
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-white/50 text-sm mt-16"
          >
            In Partnership with <span className="text-white/80 font-medium">Leading Investors</span>
            <br />
            and <span className="text-white/80 font-medium">Global Investment Associations</span>
          </motion.p>
        </div>
      </section>

      {/* Inner Circle Section */}
      <section className="py-32 px-6 bg-gradient-to-b from-[rgb(18,18,18)] to-[rgb(245,240,235)]">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <span className="inline-flex items-center gap-2 text-[rgb(200,170,130)] text-sm">
              <Sparkles className="w-4 h-4" />
              It's not about volume - it's about quality.
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-light text-[rgb(30,30,30)] mb-6"
            style={{ fontFamily: 'serif' }}
            data-testid="text-inner-circle"
          >
            Inner Circle
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-[rgb(80,80,80)] text-lg max-w-xl mx-auto mb-10"
          >
            Our invitation-only membership for those shaping the future of private capital.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Link 
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[rgb(200,150,100)] text-white rounded-full hover:bg-[rgb(180,130,80)] transition-colors font-medium"
              data-testid="button-inner-request-access"
            >
              Request Access
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features Section - Dark Theme */}
      <section className="py-24 px-6 bg-[rgb(35,30,25)]">
        <div className="max-w-6xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-white/60 text-center text-lg mb-16 max-w-2xl mx-auto"
          >
            The Inner Circle combines vetted networks, intelligent deal matching, and human connection.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-[rgb(45,40,35)] rounded-2xl p-8 border border-white/5"
              >
                <feature.icon className="w-8 h-8 text-white/80 mb-6" />
                <h3 className="text-xl font-medium text-white mb-3" data-testid={`text-feature-${index}`}>
                  {feature.title}
                </h3>
                <p className="text-white/50 text-sm">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capital Focus Section - Light Theme */}
      <section className="py-24 px-6 bg-[rgb(245,240,235)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)] mb-6 leading-tight" style={{ fontFamily: 'serif' }} data-testid="text-capital-focus">
                Capital Finds Its
                <br />
                Focus
              </h2>
              <p className="text-[rgb(80,80,80)] text-lg">
                A multi-asset ecosystem spanning private equity, private credit, and real estate - curated for conviction-driven investors.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 gap-4">
              {assetClasses.map((asset, index) => (
                <motion.div
                  key={asset.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white rounded-xl p-6 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-[rgb(200,170,130)]/20 flex items-center justify-center mb-4">
                    <asset.icon className="w-5 h-5 text-[rgb(160,120,70)]" />
                  </div>
                  <h3 className="text-lg font-medium text-[rgb(30,30,30)] mb-2" data-testid={`text-asset-${index}`}>
                    {asset.title}
                  </h3>
                  <p className="text-[rgb(100,100,100)] text-sm leading-relaxed">
                    {asset.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust Pillars Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)] mb-6"
            style={{ fontFamily: 'serif' }}
            data-testid="text-curated-connected"
          >
            Curated. Connected.
            <br />
            Confidential.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[rgb(80,80,80)] text-lg max-w-2xl mx-auto mb-16"
          >
            Every attribute of Inner Circle advances one goal: to create the most trusted, vetted investment network in the world.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-8">
            {trustPillars.map((pillar, index) => (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-[rgb(200,170,130)]/10 border border-[rgb(200,170,130)]/20 flex items-center justify-center mb-6">
                  <pillar.icon className="w-6 h-6 text-[rgb(160,120,70)]" />
                </div>
                <h3 className="text-xl font-medium text-[rgb(30,30,30)] mb-3" data-testid={`text-pillar-${index}`}>
                  {pillar.title}
                </h3>
                <p className="text-[rgb(100,100,100)] text-sm leading-relaxed">
                  {pillar.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Visionaries Section */}
      <section className="py-24 px-6 bg-[rgb(250,248,245)]">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)] mb-6"
            style={{ fontFamily: 'serif' }}
            data-testid="text-private-circle"
          >
            A Private Circle
            <br />
            of Visionaries
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[rgb(80,80,80)] text-lg max-w-2xl mx-auto mb-16"
          >
            The Inner Circle brings together a select global community through private gatherings, shared insights, and meaningful experience.
          </motion.p>

          {/* Image Gallery */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex gap-4 justify-center items-center overflow-hidden"
          >
            <div className="w-48 h-64 rounded-xl overflow-hidden opacity-50 blur-[1px] transform -rotate-3">
              <img 
                src="https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400" 
                alt="Team collaboration"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-64 h-80 rounded-xl overflow-hidden shadow-xl z-10">
              <img 
                src="https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=600" 
                alt="Business meeting"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-48 h-64 rounded-xl overflow-hidden opacity-50 blur-[1px] transform rotate-3">
              <img 
                src="https://images.pexels.com/photos/3184306/pexels-photo-3184306.jpeg?auto=compress&cs=tinysrgb&w=400" 
                alt="Conference"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1920" 
            alt="Team"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-light text-white mb-6 leading-tight" style={{ fontFamily: 'serif' }} data-testid="text-private-nature">
              Private by Nature.
              <br />
              Powerful by Design.
            </h2>
            <p className="text-white/70 text-lg mb-8">
              Our Inner Circle membership connects verified family offices, sovereign investors, and elite dealmakers shaping the next century of private capital.
            </p>
            <Secondary 
              text="Request Access" 
              link="/contact"
              data-testid="button-final-request-access"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-right"
          >
            <div className="inline-block bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
              <p className="text-white/90 text-lg italic mb-6">
                "You can automate everything except credibility."
              </p>
              <div className="flex items-center justify-end gap-4">
                <div>
                  <p className="text-white font-medium">Philippe Masindet</p>
                  <p className="text-white/60 text-sm">CEO & Founder, Anker</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[rgb(142,132,247)] flex items-center justify-center text-white font-medium">
                  PM
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-[rgb(18,18,18)] border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="text-white text-xl font-light tracking-wider">
            Anker<sup className="text-xs">®</sup>
          </Link>
          <p className="text-white/40 text-sm">
            © 2026 Anker. All rights reserved.
          </p>
        </div>
      </footer>
    </motion.div>
  );
}
