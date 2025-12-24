import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

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
              className={`text-sm font-light transition-colors ${link.href === '/vision' ? 'text-white' : 'text-white/70 hover:text-white'}`}
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
    number: "01",
    title: "Innovation",
    description: "Embracing bold ideas and new solutions that transform industries, drive growth, and create new opportunities for people and businesses worldwide.",
    color: "rgb(142, 132, 247)"
  },
  {
    number: "02",
    title: "Integrity",
    description: "Building trust through transparency, honest collaboration, and unwavering commitment to ethical practices in everything we do.",
    color: "rgb(251, 194, 213)"
  },
  {
    number: "03",
    title: "Community",
    description: "Fostering a global ecosystem of developers, creators, and users united by a shared vision for the future.",
    color: "rgb(254, 212, 92)"
  },
  {
    number: "04",
    title: "Excellence",
    description: "Pursuing the highest standards in every investment, partnership, and interaction with our portfolio companies.",
    color: "rgb(196, 227, 230)"
  },
];

const stats = [
  { value: "50+", label: "Portfolio Companies" },
  { value: "$2B+", label: "Assets Under Management" },
  { value: "12", label: "Years of Experience" },
  { value: "95%", label: "Follow-on Investment Rate" },
];

export default function Vision() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />
      
      <div className="pt-32 pb-24">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-7xl mx-auto px-6 mb-12"
        >
          <Link href="/" className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm" data-testid="link-back">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </motion.div>

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <span 
              className="inline-block px-4 py-2 mb-8 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
              data-testid="badge-vision"
            >
              Our Vision
            </span>
            <h1 className="text-5xl md:text-7xl font-light text-white mb-8" data-testid="text-vision-title">
              Building Tomorrow's
              <br />
              <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>
                Industry Leaders
              </span>
            </h1>
            <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
              We partner with visionary founders who are redefining industries and creating lasting impact through innovation and determination.
            </p>
          </motion.div>
        </section>

        {/* Stats Section */}
        <section className="max-w-7xl mx-auto px-6 mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat, idx) => (
              <div 
                key={idx} 
                className="text-center p-8 rounded-2xl border border-white/10 bg-white/5"
                data-testid={`stat-${idx}`}
              >
                <div className="text-4xl md:text-5xl font-light text-white mb-2" style={{ color: 'rgb(142, 132, 247)' }}>
                  {stat.value}
                </div>
                <div className="text-white/50 text-sm">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Values Section */}
        <section className="max-w-7xl mx-auto px-6 mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-light text-white mb-4" data-testid="text-values-title">
              Our Values
            </h2>
            <p className="text-white/50 max-w-lg mx-auto">
              The principles that guide every investment decision and partnership we make.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {values.map((value, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 + idx * 0.1 }}
                className="p-8 rounded-2xl border border-white/10 bg-white/5"
                data-testid={`value-card-${idx}`}
              >
                <div className="flex items-start gap-4">
                  <span 
                    className="text-sm font-mono"
                    style={{ color: value.color }}
                  >
                    {value.number}
                  </span>
                  <div>
                    <h3 className="text-2xl font-light text-white mb-4">{value.title}</h3>
                    <p className="text-white/50 font-light">{value.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Mission Statement */}
        <section className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <blockquote className="text-3xl md:text-4xl font-light text-white mb-8 italic">
              "We believe the best investments come from backing exceptional people with bold visions."
            </blockquote>
            <p className="text-white/50">— The Anker Team</p>
          </motion.div>
        </section>
      </div>
    </motion.div>
  );
}
