"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Linkedin, Twitter } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

const leadership = [
  {
    name: "Philippe Masindet",
    role: "",
    bio: "Building Anker — a venture operating system for founders, VCs, and LPs.",
    initials: "PM",
    linkedin: "https://www.linkedin.com/in/philippe-m-masindet/",
    twitter: "#",
  },
];

const team: { name: string; role: string; initials: string }[] = [];

const advisors: { name: string; affiliation: string }[] = [];

export default function TeamPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Our Team
          </span>
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight">
              {["The", "people", "behind", "Anker"].map((word, i) => (
                <span
                  key={word}
                  className={`inline-block mr-4 transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  {word}
                </span>
              ))}
            </h1>
            <p className="text-xl text-muted-foreground max-w-md">
              Anker is a one-person project today — an early concept building toward
              a venture operating system for founders, VCs, and LPs.
            </p>
          </div>
        </div>
      </section>

      {/* Leadership Section */}
      <section className="py-16 lg:py-24 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-4 mb-12">
            <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Leadership
            </span>
            <div className="flex-1 h-px bg-foreground/10" />
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-foreground/10">
            {leadership.map((member, idx) => (
              <div 
                key={member.name}
                className="p-8 lg:p-12 bg-background group"
                onMouseEnter={() => setHoveredMember(member.name)}
                onMouseLeave={() => setHoveredMember(null)}
              >
                <div className="flex items-start gap-6">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center border transition-all duration-500 ${
                    hoveredMember === member.name 
                      ? "bg-foreground text-background border-foreground" 
                      : "bg-foreground/5 text-foreground border-foreground/10"
                  }`}>
                    <span className="font-serif text-2xl">{member.initials}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-serif text-2xl text-foreground mb-1 group-hover:translate-x-2 transition-transform duration-300">
                      {member.name}
                    </h3>
                    {member.role && <p className="font-mono text-sm text-muted-foreground mb-4">{member.role}</p>}
                    <p className="text-muted-foreground leading-relaxed mb-6">{member.bio}</p>
                    <div className="flex gap-4">
                      <a href={member.linkedin} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Linkedin className="w-5 h-5" />
                      </a>
                      <a href={member.twitter} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Twitter className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Grid Section */}
      {team.length > 0 && (
      <section className="py-16 lg:py-24 bg-foreground text-background">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-4 mb-12">
            <span className="font-mono text-xs tracking-widest text-background/50 uppercase">
              Investment Team
            </span>
            <div className="flex-1 h-px bg-background/10" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-background/10">
            {team.map((member) => (
              <div 
                key={member.name}
                className="p-6 lg:p-8 bg-foreground hover:bg-background/5 transition-colors duration-300 group"
              >
                <div className="w-12 h-12 rounded-full bg-background/10 flex items-center justify-center mb-4 group-hover:bg-background/20 transition-colors">
                  <span className="font-serif text-lg text-background">{member.initials}</span>
                </div>
                <h3 className="font-serif text-lg text-background group-hover:translate-x-1 transition-transform duration-300">
                  {member.name}
                </h3>
                <p className="font-mono text-xs text-background/50 mt-1">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Advisors Section */}
      {advisors.length > 0 && (
      <section className="py-16 lg:py-24 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center gap-4 mb-12">
            <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Advisory Board
            </span>
            <div className="flex-1 h-px bg-foreground/10" />
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {advisors.map((advisor) => (
              <div 
                key={advisor.name}
                className="p-8 border border-foreground/10 hover:border-foreground/30 transition-colors group"
              >
                <h3 className="font-serif text-xl text-foreground mb-2 group-hover:translate-x-2 transition-transform duration-300">
                  {advisor.name}
                </h3>
                <p className="text-sm text-muted-foreground">{advisor.affiliation}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Join Us CTA */}
      <section className="py-24 lg:py-32 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="max-w-2xl">
            <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
              Careers
            </span>
            <h2 className="font-serif text-4xl lg:text-5xl tracking-tight mb-6">
              Join our team
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              We&apos;re always looking for exceptional people who share our passion for 
              backing Europe&apos;s next generation of world-changing companies.
            </p>
            <Link 
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:bg-foreground/90 transition-colors group"
            >
              View Open Positions
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
