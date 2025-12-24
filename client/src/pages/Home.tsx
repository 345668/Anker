import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Import Framer components
import PortfolioCard from '@/framer/portfolio-card';
import ValuesCard from '@/framer/vaues-card';
import CategoryCard from '@/framer/category-card';

// Portfolio data from CSV
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

const HeroSection = () => (
  <section className="relative pt-24 pb-32 overflow-hidden bg-background">
    <div className="container mx-auto px-4 relative z-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl"
      >
        <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-6 border border-primary/20" data-testid="badge-hero">
          Future of Finance
        </span>
        <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-8 text-foreground" data-testid="text-hero-title">
          Building the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-700">Decentralized</span> Future
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl" data-testid="text-hero-description">
          We invest in and incubate blockchain protocols that are reshaping the global financial landscape.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/contact">
            <Button size="lg" className="rounded-full px-8" data-testid="button-hero-cta">
              Start Building
            </Button>
          </Link>
          <Link href="/newsroom">
            <Button variant="outline" size="lg" className="rounded-full px-8" data-testid="button-hero-secondary">
              Read Our Insights
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
    
    <div className="absolute top-0 right-0 -z-10 w-1/2 h-full opacity-5">
      <div className="absolute top-20 right-20 w-96 h-96 bg-primary rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-40 w-80 h-80 bg-blue-600 rounded-full blur-[80px]" />
    </div>
  </section>
);

const PortfolioSection = () => (
  <section className="py-24 bg-secondary/30">
    <div className="container mx-auto px-4">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-16">
        <div>
          <h2 className="text-4xl font-bold mb-4" data-testid="text-portfolio-title">Our Portfolio</h2>
          <p className="text-muted-foreground max-w-xl">
            Backing the most ambitious founders across crypto, technology, healthcare, and finance.
          </p>
        </div>
        <Link href="/newsroom" className="hidden md:block text-primary font-semibold hover:underline" data-testid="link-view-all">
          View All Investments <ArrowRight className="inline w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {portfolioItems.map((item, idx) => (
          <motion.div
            key={item.slug}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            data-testid={`card-portfolio-${item.slug}`}
          >
            <PortfolioCard
              tITle={item.company}
              subText={item.description}
              additional="Learn More"
              background="rgb(18, 18, 18)"
              accent={item.color}
              logo={{ src: item.logo, alt: item.company }}
              style={{ width: '100%', height: 'auto' }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const CategoriesSection = () => (
  <section className="py-24 bg-background">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="text-4xl font-bold mb-4" data-testid="text-categories-title">Investment Focus</h2>
        <p className="text-muted-foreground">
          We invest across four key sectors driving innovation and growth.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map((cat, idx) => (
          <motion.div
            key={cat.name}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            data-testid={`card-category-${cat.name.toLowerCase()}`}
          >
            <CategoryCard
              category={cat.name}
              description={cat.description}
              fill={cat.color}
              style={{ width: '100%', height: 'auto' }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const ValuesSection = () => (
  <section className="py-24 bg-secondary/30">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-20">
        <h2 className="text-4xl font-bold mb-4" data-testid="text-values-title">Our Values</h2>
        <p className="text-muted-foreground">
          We are driven by a core set of principles that guide our investment decisions and partnerships.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {values.map((value, idx) => (
          <motion.div
            key={value.number}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.15 }}
            data-testid={`card-value-${value.number}`}
          >
            <ValuesCard
              number={value.number}
              title={value.title}
              description={value.description}
              style={{ width: '100%', height: 'auto' }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const CTASection = () => (
  <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-primary to-blue-800 opacity-90" />
    <div className="container mx-auto px-4 relative z-10 text-center">
      <TrendingUp className="w-16 h-16 mx-auto mb-6 opacity-80" />
      <h2 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-cta-title">Ready to shape the future?</h2>
      <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
        Join forces with us to build the next generation of transformative companies.
      </p>
      <Link href="/contact">
        <Button variant="secondary" size="lg" className="rounded-full px-10" data-testid="button-cta-partner">
          Partner With Us
        </Button>
      </Link>
    </div>
  </section>
);

export default function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col"
    >
      <HeroSection />
      <PortfolioSection />
      <CategoriesSection />
      <ValuesSection />
      <CTASection />
    </motion.div>
  );
}
