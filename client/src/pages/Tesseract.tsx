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
          link="https://docs.google.com/forms/d/e/1FAIpQLSew58tCd36slSL_j9MyYe0SFR8ntLftplMCMLRjjq5e4bUjww/viewform?usp=dialog"
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
    description: "Supporting breakthrough ventures across technology sectors - from artificial intelligence and sustainable tech to digital health and financial infrastructure."
  },
  {
    icon: Landmark,
    title: "Private Debt",
    description: "Strategic credit solutions and lending structures tailored for established enterprises and infrastructure projects globally."
  },
  {
    icon: HomeIcon,
    title: "Real Estate",
    description: "Premium property investments spanning residential developments, commercial assets, and emerging sectors like data infrastructure."
  },
  {
    icon: Building2,
    title: "Private Equity",
    description: "Growth-stage investments and strategic buyouts in companies demonstrating sustainable competitive advantages."
  }
];

const trustPillars = [
  {
    icon: Shield,
    title: "Verified Integrity",
    description: "Comprehensive due diligence ensures every participant meets rigorous ethical and financial criteria before joining."
  },
  {
    icon: CheckCircle,
    title: "Validated Resources",
    description: "Financial verification confirms genuine investment capacity to meaningfully participate in exclusive opportunities."
  },
  {
    icon: UserCheck,
    title: "Authentic Identity",
    description: "Advanced verification protocols confirm real-world identity matches digital presence across all touchpoints."
  }
];

const features = [
  {
    icon: MessageCircle,
    title: "Secure Collaboration",
    description: "Confidential channels designed for sensitive discussions and deal structuring."
  },
  {
    icon: Users,
    title: "Curated Introductions",
    description: "Strategic connections with verified principals who share your investment philosophy."
  },
  {
    icon: Calendar,
    title: "Exclusive Gatherings",
    description: "Invitation-only forums and intimate sessions designed for meaningful exchange."
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

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[rgb(18,18,18)] via-[rgb(30,25,40)] to-[rgb(18,18,18)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(142,132,247,0.15)_0%,_transparent_70%)]" />
        </div>

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto pt-32">
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 leading-tight"
            data-testid="text-tesseract-title"
          >
            <span className="italic" style={{ fontFamily: 'serif' }}>The Worldwide Alliance</span>
            <br />
            Defining Tomorrow's
            <br />
            <span className="text-[rgb(200,170,130)]">Capital Landscape</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10"
          >
            An exclusive alliance of institutional families, sovereign principals, and strategic dealmakers navigating wealth preservation and growth in the intelligence era.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Primary 
              text="Request Access" 
              link="https://docs.google.com/forms/d/e/1FAIpQLSew58tCd36slSL_j9MyYe0SFR8ntLftplMCMLRjjq5e4bUjww/viewform?usp=dialog"
              data-testid="button-hero-request-access"
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-white/50 text-sm mt-16"
          >
            Aligned with <span className="text-white/80 font-medium">Distinguished Allocators</span>
            <br />
            and <span className="text-white/80 font-medium">Premier Investment Networks</span>
          </motion.p>
        </div>
      </section>

      {/* Inner Circle Section */}
      <section className="py-32 px-6 bg-[rgb(25,25,25)]">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <span className="inline-flex items-center gap-2 text-[rgb(200,170,130)] text-sm">
              <Sparkles className="w-4 h-4" />
              Depth over breadth - substance over scale.
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-6"
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
            className="text-white/70 text-lg max-w-xl mx-auto mb-10"
          >
            A carefully guarded community where tomorrow's capital leaders convene to shape private markets.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <a 
              href="https://docs.google.com/forms/d/e/1FAIpQLSew58tCd36slSL_j9MyYe0SFR8ntLftplMCMLRjjq5e4bUjww/viewform?usp=dialog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[rgb(142,132,247)] text-white rounded-full hover:bg-[rgb(120,110,230)] transition-colors font-medium"
              data-testid="button-inner-request-access"
            >
              Request Access
            </a>
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
            Tesseract merges verified networks, precision-matched opportunities, and authentic relationships into one seamless experience.
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

      {/* Capital Focus Section */}
      <section className="py-24 px-6 bg-[rgb(18,18,18)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-5xl font-light text-white mb-6 leading-tight" style={{ fontFamily: 'serif' }} data-testid="text-capital-focus">
                Strategic Asset
                <br />
                Diversification
              </h2>
              <p className="text-white/70 text-lg">
                A comprehensive investment ecosystem encompassing alternative assets, structured credit, and premium real estate - assembled for discerning allocators.
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
                  className="bg-[rgb(30,30,30)] rounded-xl p-6 border border-white/5"
                >
                  <div className="w-10 h-10 rounded-lg bg-[rgb(200,170,130)]/20 flex items-center justify-center mb-4">
                    <asset.icon className="w-5 h-5 text-[rgb(200,170,130)]" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2" data-testid={`text-asset-${index}`}>
                    {asset.title}
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    {asset.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust Pillars Section */}
      <section className="py-24 px-6 bg-[rgb(25,25,25)]">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-light text-white mb-6"
            style={{ fontFamily: 'serif' }}
            data-testid="text-curated-connected"
          >
            Selective. Secure.
            <br />
            Sovereign.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-white/70 text-lg max-w-2xl mx-auto mb-16"
          >
            Every element of Tesseract serves a singular purpose: cultivating the most rigorous and reliable investment community globally.
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
                <div className="w-12 h-12 rounded-xl bg-[rgb(142,132,247)]/20 border border-[rgb(142,132,247)]/30 flex items-center justify-center mb-6">
                  <pillar.icon className="w-6 h-6 text-[rgb(142,132,247)]" />
                </div>
                <h3 className="text-xl font-medium text-white mb-3" data-testid={`text-pillar-${index}`}>
                  {pillar.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {pillar.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Visionaries Section */}
      <section className="py-24 px-6 bg-[rgb(18,18,18)]">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-light text-white mb-6"
            style={{ fontFamily: 'serif' }}
            data-testid="text-private-circle"
          >
            An Exclusive Assembly
            <br />
            of Pioneers
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-white/70 text-lg max-w-2xl mx-auto mb-16"
          >
            Tesseract unites a distinguished international community through private convenings, shared intelligence, and transformative experiences.
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
                alt="Professional collaboration"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-64 h-80 rounded-xl overflow-hidden shadow-xl z-10">
              <img 
                src="https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=600" 
                alt="Strategic discussion"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-48 h-64 rounded-xl overflow-hidden opacity-50 blur-[1px] transform rotate-3">
              <img 
                src="https://images.pexels.com/photos/3184306/pexels-photo-3184306.jpeg?auto=compress&cs=tinysrgb&w=400" 
                alt="Private summit"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 px-6 bg-gradient-to-br from-[rgb(25,20,35)] via-[rgb(30,25,40)] to-[rgb(20,20,25)]">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-light text-white mb-6 leading-tight" style={{ fontFamily: 'serif' }} data-testid="text-private-nature">
              Discretion First.
              <br />
              Impact Always.
            </h2>
            <p className="text-white/70 text-lg mb-8">
              Tesseract connects authenticated family offices, institutional principals, and distinguished dealmakers orchestrating the next generation of private capital.
            </p>
            <Secondary 
              text="Request Access" 
              link="https://docs.google.com/forms/d/e/1FAIpQLSew58tCd36slSL_j9MyYe0SFR8ntLftplMCMLRjjq5e4bUjww/viewform?usp=dialog"
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
                "Technology amplifies reach, but trust remains the foundation of every meaningful transaction."
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
