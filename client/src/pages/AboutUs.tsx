import { motion } from "framer-motion";
import { Link } from "wouter";
import { Target, Heart, Globe, Zap, Users, Shield, Award, TrendingUp } from "lucide-react";

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
              className={`text-sm font-light transition-colors ${link.href === '/about' ? 'text-white' : 'text-white/70 hover:text-white'}`}
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

const values = [
  {
    icon: Target,
    title: "Purpose-Driven",
    description: "Every connection we facilitate serves a greater purpose: enabling visionaries to build tomorrow's defining companies."
  },
  {
    icon: Heart,
    title: "Human-Centered",
    description: "Technology amplifies, but relationships drive. We believe the best deals happen when trust is established first."
  },
  {
    icon: Globe,
    title: "Globally Connected",
    description: "Capital knows no borders. Our network spans continents, cultures, and asset classes to create opportunities everywhere."
  },
  {
    icon: Zap,
    title: "Innovation-First",
    description: "We leverage AI and deep technology to surface insights and matches that would be impossible to find manually."
  }
];

const stats = [
  { value: "500+", label: "Investors Connected" },
  { value: "$2B+", label: "Capital Deployed" },
  { value: "40+", label: "Countries Represented" },
  { value: "95%", label: "Match Satisfaction" }
];

const milestones = [
  { year: "2023", title: "Founded", description: "Anker was born from a simple idea: what if finding the right investor was as easy as finding the right product?" },
  { year: "2024", title: "Platform Launch", description: "Launched our AI-powered matching platform, connecting founders with vetted investors across multiple asset classes." },
  { year: "2025", title: "Global Expansion", description: "Expanded to serve family offices, sovereign wealth funds, and institutional investors across 40+ countries." },
  { year: "2026", title: "Inner Circle", description: "Introduced our exclusive Inner Circle membership for ultra-high-net-worth individuals and institutional partners." }
];

export default function AboutUs() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />

      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <video 
            autoPlay
            loop
            muted
            playsInline
            poster="https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=1920"
            className="absolute top-0 left-0 w-full h-full object-cover"
          >
            <source src="https://videos.pexels.com/video-files/3195440/3195440-uhd_2560_1440_25fps.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[rgb(18,18,18)]" />
        </div>

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto pt-32">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-block px-4 py-2 mb-8 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
            data-testid="badge-about"
          >
            About Anker
          </motion.span>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 leading-tight"
            data-testid="text-about-title"
          >
            We Connect
            <br />
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Vision</span> with{" "}
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Capital</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto"
          >
            Anker is the trusted platform where ambitious founders meet conviction-driven investors. We're redefining how capital finds its best home.
          </motion.p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6 bg-[rgb(18,18,18)]">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-light text-[rgb(142,132,247)] mb-2" data-testid={`text-stat-${index}`}>
                {stat.value}
              </div>
              <div className="text-white/50 text-sm">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Story Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-[rgb(142,132,247)] text-sm font-medium tracking-[0.2em] uppercase mb-4 block">
              Our Story
            </span>
            <h2 className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)] mb-6" style={{ fontFamily: 'serif' }} data-testid="text-our-story">
              Built by Founders,
              <br />
              for Founders
            </h2>
            <p className="text-[rgb(80,80,80)] text-lg max-w-2xl mx-auto">
              We experienced the fundraising journey firsthand. The endless cold emails, the mismatched meetings, the frustration of not finding the right fit. Anker was born to change that.
            </p>
          </motion.div>

          {/* Timeline */}
          <div className="space-y-8">
            {milestones.map((milestone, index) => (
              <motion.div
                key={milestone.year}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex gap-6 items-start"
              >
                <div className="w-20 shrink-0">
                  <span className="text-[rgb(142,132,247)] font-medium">{milestone.year}</span>
                </div>
                <div className="flex-1 pb-8 border-l-2 border-[rgb(142,132,247)]/20 pl-6 relative">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[rgb(142,132,247)]" />
                  <h3 className="text-xl font-medium text-[rgb(30,30,30)] mb-2" data-testid={`text-milestone-${index}`}>
                    {milestone.title}
                  </h3>
                  <p className="text-[rgb(100,100,100)]">
                    {milestone.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-24 px-6 bg-[rgb(245,243,240)]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-[rgb(142,132,247)] text-sm font-medium tracking-[0.2em] uppercase mb-4 block">
              Our Values
            </span>
            <h2 className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)]" style={{ fontFamily: 'serif' }} data-testid="text-values">
              What Drives Us
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm"
              >
                <div className="w-12 h-12 rounded-xl bg-[rgb(142,132,247)]/10 flex items-center justify-center mb-6">
                  <value.icon className="w-6 h-6 text-[rgb(142,132,247)]" />
                </div>
                <h3 className="text-xl font-medium text-[rgb(30,30,30)] mb-3" data-testid={`text-value-${index}`}>
                  {value.title}
                </h3>
                <p className="text-[rgb(100,100,100)] leading-relaxed">
                  {value.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="relative py-32 px-6 overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://images.pexels.com/photos/3184416/pexels-photo-3184416.jpeg?auto=compress&cs=tinysrgb&w=1920" 
            alt="Mission"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[rgb(18,18,18)]/80" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Award className="w-12 h-12 text-[rgb(142,132,247)] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-light text-white mb-8" style={{ fontFamily: 'serif' }} data-testid="text-mission">
              Our Mission
            </h2>
            <p className="text-white/80 text-xl md:text-2xl font-light leading-relaxed mb-10 max-w-3xl mx-auto">
              "To democratize access to capital by creating the most intelligent, trusted, and human-centered platform connecting visionary founders with conviction-driven investors."
            </p>
            <Primary 
              text="Join the Network" 
              link="/contact"
              data-testid="button-join-network"
            />
          </motion.div>
        </div>
      </section>

      {/* Leadership Preview */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-[rgb(142,132,247)] text-sm font-medium tracking-[0.2em] uppercase mb-4 block">
              Leadership
            </span>
            <h2 className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)] mb-6" style={{ fontFamily: 'serif' }} data-testid="text-leadership">
              Meet the Team
            </h2>
            <p className="text-[rgb(80,80,80)] text-lg max-w-2xl mx-auto mb-10">
              Our team brings together decades of experience in venture capital, technology, and entrepreneurship.
            </p>
            <Link 
              href="/team"
              className="inline-flex items-center gap-2 text-[rgb(142,132,247)] hover:text-[rgb(120,110,230)] transition-colors font-medium"
              data-testid="link-view-team"
            >
              View Full Team
              <TrendingUp className="w-4 h-4" />
            </Link>
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
