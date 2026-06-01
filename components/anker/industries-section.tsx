"use client";

import { useEffect, useRef, useState } from "react";
import { 
  Cpu, Heart, Building2, Landmark, Film, ShoppingBag, 
  Leaf, Truck, GraduationCap, Sprout, Factory, Car, 
  Rocket, Dna, Plane, Trophy, Scale, Users,
  type LucideIcon
} from "lucide-react";

interface Industry {
  number: string;
  name: string;
  icon: LucideIcon;
  description: string;
}

const industries: Industry[] = [
  { number: "01", name: "Technology", icon: Cpu, description: "AI, SaaS, and digital infrastructure powering the next generation of enterprise software." },
  { number: "02", name: "Healthcare", icon: Heart, description: "Digital health platforms and medical innovation transforming patient outcomes." },
  { number: "03", name: "Real Estate", icon: Building2, description: "Property development, PropTech, and commercial real estate opportunities." },
  { number: "04", name: "Finance", icon: Landmark, description: "FinTech solutions disrupting traditional banking and financial services." },
  { number: "05", name: "Entertainment", icon: Film, description: "Media production, gaming studios, and content creation platforms." },
  { number: "06", name: "Consumer", icon: ShoppingBag, description: "E-commerce, D2C brands, and consumer technology products." },
  { number: "07", name: "CleanTech", icon: Leaf, description: "Renewable energy, sustainability solutions, and climate technology." },
  { number: "08", name: "Logistics", icon: Truck, description: "Supply chain optimization and last-mile delivery innovation." },
];

function IndustryCard({ industry, index }: { industry: Industry; index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const IconComponent = industry.icon;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 py-12 lg:py-16 border-b border-foreground/10">
        {/* Number */}
        <div className="shrink-0">
          <span className="font-mono text-sm text-muted-foreground">{industry.number}</span>
        </div>
        
        {/* Content */}
        <div className="flex-1 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-3xl lg:text-4xl font-display mb-4 group-hover:translate-x-2 transition-transform duration-500">
              {industry.name}
            </h3>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {industry.description}
            </p>
          </div>
          
          {/* Visual */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-24 h-24 rounded-2xl bg-foreground/5 border border-foreground/10 flex items-center justify-center group-hover:bg-foreground/10 transition-colors duration-500">
              <IconComponent className="w-10 h-10 text-foreground/60 group-hover:text-foreground transition-colors duration-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IndustriesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="industries"
      ref={sectionRef}
      className="relative py-24 lg:py-32"
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-16 lg:mb-24">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Investment Verticals
          </span>
          <h2
            className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Truly industry agnostic.
            <br />
            <span className="text-muted-foreground">Where vision meets capital.</span>
          </h2>
        </div>

        {/* Industries List */}
        <div>
          {industries.map((industry, index) => (
            <IndustryCard key={industry.number} industry={industry} index={index} />
          ))}
        </div>
        
        {/* Additional Industries Marquee */}
        <div className="mt-16 pt-16 border-t border-foreground/10">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-8 text-center">
            And many more sectors
          </p>
          <div className="flex gap-12 items-center marquee-reverse">
            {[...Array(2)].map((_, setIdx) => (
              <div key={setIdx} className="flex gap-12 items-center shrink-0">
                {[
                  { icon: GraduationCap, name: "Education" },
                  { icon: Sprout, name: "AgriTech" },
                  { icon: Factory, name: "Manufacturing" },
                  { icon: Car, name: "Automotive" },
                  { icon: Rocket, name: "Aerospace" },
                  { icon: Dna, name: "Biotech" },
                  { icon: Plane, name: "Travel" },
                  { icon: Trophy, name: "Sports" },
                  { icon: Scale, name: "Legal" },
                  { icon: Users, name: "HR Tech" },
                ].map(({ icon: Icon, name }) => (
                  <div
                    key={`${setIdx}-${name}`}
                    className="flex items-center gap-3 text-foreground/30 hover:text-foreground transition-colors duration-300"
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-display text-lg whitespace-nowrap">{name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
