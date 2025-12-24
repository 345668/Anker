import { motion } from "framer-motion";
import { Link } from "wouter";
import PortfolioCard from '@/framer/portfolio-card';
import ValuesCard from '@/framer/vaues-card';
import TestimonialCard from '@/framer/testimonial-card';
import CategoryCard from '@/framer/category-card';

// Types for Unframer components (since we don't have types file)
// We treat them as generic components accepting known props from the analysis
const HeroSection = () => (
  <section className="relative pt-24 pb-32 overflow-hidden bg-background">
    <div className="container mx-auto px-4 relative z-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl"
      >
        <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-6 border border-primary/20">
          Future of Finance
        </span>
        <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-8 text-foreground">
          Building the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-700">Decentralized</span> Future
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl">
          We invest in and incubate blockchain protocols that are reshaping the global financial landscape.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/contact">
            <button className="px-8 py-4 rounded-full bg-foreground text-background font-semibold hover:bg-foreground/90 transition-all hover:scale-105 active:scale-95 shadow-2xl">
              Start Building
            </button>
          </Link>
          <Link href="/newsroom">
            <button className="px-8 py-4 rounded-full bg-background border border-border text-foreground font-semibold hover:bg-secondary transition-all hover:-translate-y-1">
              Read Our Insights
            </button>
          </Link>
        </div>
      </motion.div>
    </div>
    
    {/* Abstract Background Decoration */}
    <div className="absolute top-0 right-0 -z-10 w-1/2 h-full opacity-5">
      <div className="absolute top-20 right-20 w-96 h-96 bg-primary rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-40 w-80 h-80 bg-blue-600 rounded-full blur-[80px]" />
    </div>
  </section>
);

const PortfolioSection = () => (
  <section className="py-24 bg-secondary/30">
    <div className="container mx-auto px-4">
      <div className="flex justify-between items-end mb-16">
        <div>
          <h2 className="text-4xl font-bold mb-4">Our Portfolio</h2>
          <p className="text-muted-foreground max-w-xl">
            Backing the most ambitious founders in Web3.
          </p>
        </div>
        <Link href="/newsroom" className="hidden md:block text-primary font-semibold hover:underline">
          View All Investments &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Using standard wrappers for Framer components to control layout */}
        <div className="h-full">
          <PortfolioCard.Responsive 
            className="w-full h-full"
            pRD0wZ71h="Learn More"
            // Assuming these props map to content based on usage examples
            // We'll trust the visual component handles styling
          />
        </div>
        
        {/* Fallback custom cards since we can't easily iterate data into specific unknown Framer props */}
        <div className="group relative bg-card rounded-2xl p-8 border hover:border-primary/50 transition-all hover:shadow-xl hover:shadow-primary/5 cursor-pointer h-full flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 text-2xl">
              ⚡
            </div>
            <h3 className="text-2xl font-bold mb-3">Lightning Protocol</h3>
            <p className="text-muted-foreground mb-6">
              Layer 2 scaling solution processing 100k TPS with zero-knowledge proofs.
            </p>
          </div>
          <span className="text-primary font-semibold group-hover:translate-x-1 transition-transform inline-block">
            View Details &rarr;
          </span>
        </div>

        <div className="group relative bg-card rounded-2xl p-8 border hover:border-primary/50 transition-all hover:shadow-xl hover:shadow-primary/5 cursor-pointer h-full flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-6 text-2xl">
              🔐
            </div>
            <h3 className="text-2xl font-bold mb-3">Vault Secure</h3>
            <p className="text-muted-foreground mb-6">
              Institutional grade custody infrastructure for digital asset managers.
            </p>
          </div>
          <span className="text-primary font-semibold group-hover:translate-x-1 transition-transform inline-block">
            View Details &rarr;
          </span>
        </div>
      </div>
    </div>
  </section>
);

const ValuesSection = () => (
  <section className="py-24 bg-background">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-20">
        <h2 className="text-4xl font-bold mb-4">Our Values</h2>
        <p className="text-muted-foreground">
          We are driven by a core set of principles that guide our investment decisions and partnerships.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <ValuesCard.Responsive 
          LB_4C2Ibg="01"
          ZXQPBmPwb="Innovation"
          lMRK8Ir3L="Embracing bold ideas and new solutions that transform industries."
        />
        <ValuesCard.Responsive 
          LB_4C2Ibg="02"
          ZXQPBmPwb="Integrity"
          lMRK8Ir3L="Building trust through transparency and honest collaboration."
        />
        <ValuesCard.Responsive 
          LB_4C2Ibg="03"
          ZXQPBmPwb="Community"
          lMRK8Ir3L="Fostering a global ecosystem of developers, creators, and users."
        />
      </div>
    </div>
  </section>
);

export default function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col min-h-screen"
    >
      <HeroSection />
      <PortfolioSection />
      <ValuesSection />
      
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1639322537228-f710d846310a?auto=format&fit=crop&q=80')] opacity-10 bg-cover bg-center" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-8">Ready to shape the future?</h2>
          <Link href="/contact">
            <button className="px-10 py-4 bg-background text-primary rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all">
              Partner With Us
            </button>
          </Link>
        </div>
      </section>
    </motion.div>
  );
}
