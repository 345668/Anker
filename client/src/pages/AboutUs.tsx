import { motion } from "framer-motion";
import { Link } from "wouter";
import { Target, Heart, Globe, Zap, Users, Shield, Award, TrendingUp, Lightbulb, Handshake } from "lucide-react";

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
    title: "Mission-Oriented",
    description: "Every introduction we facilitate advances a clear objective: empowering entrepreneurs to construct the landmark enterprises of tomorrow."
  },
  {
    icon: Heart,
    title: "Relationship-First",
    description: "While technology enhances our reach, genuine partnerships power outcomes. We prioritize building lasting trust before any transaction."
  },
  {
    icon: Globe,
    title: "Borderless Perspective",
    description: "Investment opportunities transcend geography. Our network reaches across continents and cultures to unlock possibilities everywhere."
  },
  {
    icon: Zap,
    title: "Technology-Enabled",
    description: "We harness artificial intelligence and advanced analytics to uncover connections and insights beyond traditional discovery methods."
  }
];

const stats = [
  { value: "500+", label: "Capital Partners" },
  { value: "$2B+", label: "Facilitated Investments" },
  { value: "40+", label: "Markets Covered" },
  { value: "95%", label: "Partner Satisfaction" }
];

const milestones = [
  { year: "Sep 2025", title: "Conception", description: "The founding vision emerged: what if connecting ambitious ventures with aligned capital was intuitive, intelligent, and immediate?" },
  { year: "Dec 2025", title: "Platform Built", description: "Engineering completed on our proprietary matching engine, combining machine learning with deep market intelligence." },
  { year: "Jan 2026", title: "Official Launch", description: "Anker opened its doors, introducing AI-powered capital matching to founders and investors across multiple asset categories." },
  { year: "Jun 2026", title: "Global Reach", description: "Expanded operations to serve institutional allocators, sovereign entities, and family offices spanning 40+ markets worldwide." },
  { year: "Sep 2026", title: "Tesseract Unveiled", description: "Launched our premium Inner Circle program for ultra-qualified principals and institutional partners seeking exclusive opportunities." }
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

      {/* Hero Section with New Video */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <video 
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="https://images.pexels.com/photos/1181406/pexels-photo-1181406.jpeg?auto=compress&cs=tinysrgb&w=1920"
            className="absolute top-0 left-0 w-full h-full object-cover"
          >
            <source src="https://videos.pexels.com/video-files/3129957/3129957-uhd_2560_1440_30fps.mp4" type="video/mp4" />
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
            Who We Are
          </motion.span>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 leading-tight"
            data-testid="text-about-title"
          >
            Bridging
            <br />
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Ambition</span> with{" "}
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Resources</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto"
          >
            Anker serves as the intelligent bridge where determined founders discover aligned capital partners. We're transforming how investment relationships begin.
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

      {/* Vision Video Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <video 
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1920"
            className="absolute top-0 left-0 w-full h-full object-cover"
          >
            <source src="https://videos.pexels.com/video-files/3255275/3255275-uhd_2560_1440_25fps.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/60" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto text-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Lightbulb className="w-10 h-10 text-[rgb(200,170,130)] mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-light text-white mb-6" style={{ fontFamily: 'serif' }}>
              The Spark Behind Anker
            </h2>
            <p className="text-white/80 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
              We witnessed countless exceptional ventures struggle to find their ideal capital partners. The traditional approach—endless outreach, misaligned meetings, and months of uncertainty—needed reinvention. Anker emerged to solve that friction.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Story Section with Timeline */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-[rgb(142,132,247)] text-sm font-medium tracking-[0.2em] uppercase mb-4 block">
              Our Journey
            </span>
            <h2 className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)] mb-6" style={{ fontFamily: 'serif' }} data-testid="text-our-story">
              Crafted by Operators,
              <br />
              Designed for Builders
            </h2>
            <p className="text-[rgb(80,80,80)] text-lg max-w-2xl mx-auto">
              We navigated the capital-raising journey ourselves. The scattered outreach, the misaligned conversations, the challenge of finding genuine fit. Anker was created to transform that experience.
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
                <div className="w-24 shrink-0">
                  <span className="text-[rgb(142,132,247)] font-medium text-sm">{milestone.year}</span>
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

      {/* Image Gallery Section */}
      <section className="py-16 px-6 bg-[rgb(245,243,240)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative h-64 rounded-xl overflow-hidden"
              data-testid="card-image-strategy"
            >
              <img 
                src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=600" 
                alt="Strategic planning session"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <p className="absolute bottom-4 left-4 text-white text-sm font-medium" data-testid="text-image-strategy">Strategic Sessions</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="relative h-64 rounded-xl overflow-hidden"
              data-testid="card-image-collaboration"
            >
              <img 
                src="https://images.pexels.com/photos/3184287/pexels-photo-3184287.jpeg?auto=compress&cs=tinysrgb&w=600" 
                alt="Collaborative workspace"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <p className="absolute bottom-4 left-4 text-white text-sm font-medium" data-testid="text-image-collaboration">Collaborative Culture</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="relative h-64 rounded-xl overflow-hidden"
              data-testid="card-image-innovation"
            >
              <img 
                src="https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=600" 
                alt="Innovation hub"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <p className="absolute bottom-4 left-4 text-white text-sm font-medium" data-testid="text-image-innovation">Innovation Focus</p>
            </motion.div>
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
              Our Principles
            </span>
            <h2 className="text-4xl md:text-5xl font-light text-[rgb(30,30,30)]" style={{ fontFamily: 'serif' }} data-testid="text-values">
              What Guides Us
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

      {/* Partnership Video Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <video 
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg?auto=compress&cs=tinysrgb&w=1920"
            className="absolute top-0 left-0 w-full h-full object-cover"
          >
            <source src="https://videos.pexels.com/video-files/3209828/3209828-uhd_2560_1440_25fps.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/70" />
        </div>
        
        <div className="relative z-10 max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Handshake className="w-10 h-10 text-[rgb(200,170,130)] mb-6" />
              <h2 className="text-3xl md:text-4xl font-light text-white mb-6" style={{ fontFamily: 'serif' }}>
                Partnership Philosophy
              </h2>
              <p className="text-white/80 text-lg leading-relaxed">
                We don't just connect founders with capital—we cultivate lasting partnerships. Every introduction is carefully considered, every relationship nurtured for long-term success.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10" data-testid="card-stat-curated">
                <div className="text-3xl font-light text-[rgb(200,170,130)] mb-2" data-testid="text-stat-curated">100%</div>
                <p className="text-white/70 text-sm">Curated Matches</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10" data-testid="card-stat-access">
                <div className="text-3xl font-light text-[rgb(200,170,130)] mb-2" data-testid="text-stat-access">24/7</div>
                <p className="text-white/70 text-sm">Platform Access</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10" data-testid="card-stat-assets">
                <div className="text-3xl font-light text-[rgb(200,170,130)] mb-2" data-testid="text-stat-assets">5+</div>
                <p className="text-white/70 text-sm">Asset Categories</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10" data-testid="card-stat-growth">
                <div className="text-3xl font-light text-[rgb(200,170,130)] mb-2" data-testid="text-stat-growth">∞</div>
                <p className="text-white/70 text-sm">Growth Potential</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="relative py-32 px-6 overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://images.pexels.com/photos/3184433/pexels-photo-3184433.jpeg?auto=compress&cs=tinysrgb&w=1920" 
            alt="Strategic direction"
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
              Our Purpose
            </h2>
            <p className="text-white/80 text-xl md:text-2xl font-light leading-relaxed mb-10 max-w-3xl mx-auto">
              "To expand access to capital through the most sophisticated, trustworthy, and human-centric platform that unites visionary builders with conviction-driven allocators."
            </p>
            <Primary 
              text="Become a Partner" 
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
              The People Behind Anker
            </h2>
            <p className="text-[rgb(80,80,80)] text-lg max-w-2xl mx-auto mb-10">
              Our leadership combines decades of expertise spanning private markets, technology innovation, and entrepreneurial ventures.
            </p>
            <Link 
              href="/team"
              className="inline-flex items-center gap-2 text-[rgb(142,132,247)] hover:text-[rgb(120,110,230)] transition-colors font-medium"
              data-testid="link-view-team"
            >
              Explore Full Team
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
