"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function TeamSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="team"
      ref={sectionRef}
      className="relative py-32 lg:py-40 overflow-hidden"
    >
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1920')"
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/80" />
      
      {/* Grid lines overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        {[...Array(6)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/10"
            style={{
              top: `${16.66 * (i + 1)}%`,
              left: 0,
              right: 0,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            {/* Eyebrow */}
            <div 
              className={`mb-8 transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
                <span className="w-8 h-px bg-foreground/30" />
                Our Team
              </span>
            </div>
            
            <h2 
              className={`text-4xl lg:text-6xl font-display tracking-tight mb-8 transition-all duration-700 delay-100 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              We commit
              <br />
              <span className="text-muted-foreground">as one team.</span>
            </h2>
            
            <p 
              className={`text-xl text-muted-foreground leading-relaxed mb-12 max-w-lg transition-all duration-700 delay-200 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Our team brings together decades of experience in venture capital, 
              technology, and entrepreneurship to help founders succeed.
            </p>

            <div 
              className={`transition-all duration-700 delay-300 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <Button 
                size="lg" 
                className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group"
                asChild
              >
                <Link href="/team">
                  Meet the team
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>
          
          {/* Stats */}
          <div 
            className={`grid grid-cols-2 gap-8 transition-all duration-700 delay-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {[
              { value: "50+", label: "Years combined experience" },
              { value: "12", label: "Team members" },
              { value: "4", label: "Continents represented" },
              { value: "100%", label: "Founder commitment" },
            ].map((stat, idx) => (
              <div 
                key={stat.label}
                className="p-8 border border-foreground/10 rounded-2xl bg-background/50 backdrop-blur-sm"
                style={{ transitionDelay: `${400 + idx * 100}ms` }}
              >
                <span className="font-display text-4xl lg:text-5xl text-foreground block mb-2">
                  {stat.value}
                </span>
                <span className="text-sm text-muted-foreground">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
