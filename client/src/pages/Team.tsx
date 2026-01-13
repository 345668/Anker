import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft, ExternalLink } from "lucide-react";

// Import Framer component
import TeamCard from '@/framer/team-card';
import Secondary from '@/framer/secondary';
import Video from '@/framer/video';

// Team data from CSV
const teamMembers = [
  {
    slug: "emily-wilson",
    name: "Emily Wilson",
    position: "Managing Partner",
    headshot: "https://framerusercontent.com/images/V9L0OiiTBWevgOY7tK4HfRECaY.jpg",
  },
  {
    slug: "alex-harrison",
    name: "Alex Harrison",
    position: "Partner",
    headshot: "https://framerusercontent.com/images/1vZgYMKCk5JZ6UzVmWrvnmhiJc.jpg",
  },
  {
    slug: "elizabeth-green",
    name: "Elizabeth Green",
    position: "Venture Partner",
    headshot: "https://framerusercontent.com/images/OndI3quMEpsGPfWrKjjAFuyRai4.jpg",
  },
  {
    slug: "ryan-jenkins",
    name: "Ryan Jenkins",
    position: "Principal",
    headshot: "https://framerusercontent.com/images/m4Wf80qlzZfjWoTVfwlxJDr0SM.jpg",
  },
  {
    slug: "matthew-sullivan",
    name: "Matthew Sullivan",
    position: "Associate",
    headshot: "https://framerusercontent.com/images/OjRZwqubMLMpZawHFBAFqfXk.jpg",
  },
  {
    slug: "christopher-martin",
    name: "Christopher Martin",
    position: "Investment Analyst",
    headshot: "https://framerusercontent.com/images/WZ8Qk7sSHkxsUILT0QvC1pnQnw.jpg",
  },
];

// Careers data from CSV
const careers = [
  { slug: "investment-analyst", title: "Investment Analyst", location: "San Francisco, CA" },
  { slug: "portfolio-manager", title: "Portfolio Manager", location: "New York, NY" },
  { slug: "startup-scout", title: "Startup Scout", location: "Berlin, Germany" },
  { slug: "business-development-associate", title: "Business Development Associate", location: "London, UK" },
  { slug: "financial-modeling-specialist", title: "Financial Modeling Specialist", location: "Singapore" },
  { slug: "growth-strategy-consultant", title: "Growth Strategy Consultant", location: "Shanghai, China" },
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
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[rgb(18,18,18)]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-white text-xl font-light tracking-wider">
          Anker<sup className="text-xs">®</sup>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-light transition-colors ${link.href === '/team' ? 'text-white' : 'text-white/70 hover:text-white'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <Secondary 
          text="Contact" 
          link="/contact"
          style={{ transform: 'scale(0.9)' }}
        />
      </div>
    </header>
  );
};

export default function Team() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[rgb(18,18,18)]"
    >
      <Navigation />
      
      {/* Hero Section with Video Background */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Video 
            file="https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-2 mb-6 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5">
              Our Team
            </span>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-light text-white mb-6">
              Meet the <span className="italic" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgb(142, 132, 247)' }}>Team</span>
            </h1>
            <p className="text-xl text-white/50 font-light max-w-2xl mx-auto">
              Experienced investors and operators dedicated to supporting founders on their journey.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="py-24 max-w-7xl mx-auto px-6">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-12"
        >
          <Link href="/" className="inline-flex items-center text-white/50 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <h1 className="text-5xl md:text-6xl font-light text-white mb-6" data-testid="text-team-title">
            Our Team
          </h1>
          <p className="text-xl text-white/50 font-light">
            A diverse group of investors, engineers, and builders united by a passion for innovation.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {teamMembers.map((member, i) => (
            <motion.div
              key={member.slug}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              data-testid={`card-team-${member.slug}`}
            >
              <TeamCard
                name={member.name}
                position={member.position}
                image={{ src: member.headshot, alt: member.name }}
                style={{ width: '100%', height: 'auto' }}
              />
            </motion.div>
          ))}
        </div>
        
        {/* Careers Section with Film Set Video Background */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-32 relative rounded-3xl overflow-hidden"
        >
          {/* Video Background */}
          <div className="absolute inset-0">
            <video 
              autoPlay 
              muted 
              loop 
              playsInline
              className="w-full h-full object-cover"
            >
              <source src="https://videos.pexels.com/video-files/7988912/7988912-uhd_2560_1440_25fps.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-black/70" />
          </div>
          
          <div className="relative z-10 py-20 px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-light text-white mb-4" data-testid="text-careers-title">
                Join Our Team
              </h2>
              <p className="text-white/50 max-w-xl mx-auto font-light">
                We are always looking for exceptional talent to join our investment and platform teams.
              </p>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {careers.map((job, idx) => (
                <motion.div
                  key={job.slug}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05, duration: 0.4 }}
                >
                  <div 
                    className="p-6 rounded-lg border border-white/10 hover:border-white/30 transition-all cursor-pointer group bg-black/30 backdrop-blur-sm"
                    data-testid={`card-job-${job.slug}`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="font-medium text-white mb-1 group-hover:text-[rgb(142,132,247)] transition-colors">{job.title}</h3>
                        <p className="text-white/40 text-sm">{job.location}</p>
                      </div>
                      <ExternalLink className="w-5 h-5 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors flex-shrink-0" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-12">
              <button className="px-8 py-3 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all text-sm font-light" data-testid="button-view-all-jobs">
                View All Open Positions
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
