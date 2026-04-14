"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

const portfolioCompanies = [
  {
    name: "FineTaste",
    role: "Authenticating the Italian experience",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/fc6581e83_Screenshot2025-12-16at92632PM.png",
    demoUrl: "https://www.finetaste.it/en/collections/cantina-pisoni-vini-biologici-trentini"
  },
  {
    name: "Kinu Health",
    role: "Personalizing care for autoimmune disease patients",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/24b487db4_Screenshot2025-12-16at84801PM.png",
    demoUrl: "https://www.kinuhealth.com"
  },
  {
    name: "Perfi",
    role: "3D Printing nature&apos;s design with novel manufacturing",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/8191b9b9f_Screenshot2025-12-16at85009PM.png",
    demoUrl: "https://perfi.dk"
  },
  {
    name: "Mint Town",
    role: "Blending art toys with culture and Web3",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/1b2883343_Screenshot2025-12-16at102745PM.png",
    demoUrl: "https://minttown.jp"
  },
  {
    name: "Capsero",
    role: "Empowering health by phytointelligence",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/58f533618_Screenshot2025-12-16at84940PM.png",
    demoUrl: "https://capsero.com"
  },
  {
    name: "Alga Biologics",
    role: "Revolutionising bioproduction with microalgae",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/f3c84ab64_Screenshot2025-12-16at85034PM.png",
    demoUrl: "https://www.algabiologics.com/en"
  },
  {
    name: "Melsonic",
    role: "AI companion that amplifies teaching impact",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/20513527a_Screenshot2025-12-16at101655PM.png",
    demoUrl: "https://www.melsonic.com"
  },
  {
    name: "NXZ Sound",
    role: "Stop buying beats, use NXZSound",
    image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d18e565bc98c79f2262c8f/22ec19f9e_Screenshot2025-12-16at85112PM.png",
    demoUrl: "https://nxzsound.com"
  },
];

export function PortfolioSection() {
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

  const duplicatedCompanies = [...portfolioCompanies, ...portfolioCompanies];

  return (
    <section
      id="portfolio"
      ref={sectionRef}
      className="relative py-24 lg:py-32 border-t border-foreground/10"
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 mb-16">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Our Companies
            </span>
            <h2
              className={`text-4xl lg:text-6xl font-display tracking-tight transition-all duration-700 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              Portfolio
              <span className="text-muted-foreground ml-4 text-2xl lg:text-3xl">
                ({portfolioCompanies.length})
              </span>
            </h2>
          </div>
          
          <Link 
            href="/portfolio" 
            className={`hidden lg:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all duration-500 group ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            View all companies
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>

      {/* Marquee */}
      <div className="relative">
        {/* Gradient Masks */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        {/* Scrolling Container */}
        <div 
          className={`flex gap-6 marquee transition-opacity duration-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {duplicatedCompanies.map((startup, idx) => (
            <a
              key={`${startup.name}-${idx}`}
              href={startup.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex-shrink-0 w-80"
            >
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-foreground/10 hover:border-foreground/20 transition-colors duration-500">
                <Image
                  src={startup.image}
                  alt={startup.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                
                {/* Content Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="font-display text-xl font-bold text-foreground mb-2 group-hover:translate-x-1 transition-transform duration-500">
                    {startup.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {startup.role}
                  </p>
                </div>

                {/* Hover Arrow */}
                <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-foreground/10 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 border border-foreground/10">
                  <ArrowUpRight className="w-4 h-4 text-foreground" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Mobile View All */}
      <div className="lg:hidden max-w-[1400px] mx-auto px-6 lg:px-12 mt-12">
        <Link 
          href="/portfolio" 
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all companies
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
