"use client";

import { useEffect, useState, useRef } from "react";
import { Shield, Lock, Eye, FileCheck } from "lucide-react";
import { SecurityCard } from "./product-mockups";

const securityFeatures = [
  {
    icon: Shield,
    title: "Bank-grade security",
    description: "Your pitch decks, financials, and investor communications are encrypted at rest and in transit.",
  },
  {
    icon: Lock,
    title: "Secure data rooms",
    description: "Share documents with investors knowing exactly who views what and when. Revoke access anytime.",
  },
  {
    icon: Eye,
    title: "Privacy by design",
    description: "Your startup data is never shared with other founders. Each account is completely isolated.",
  },
  {
    icon: FileCheck,
    title: "GDPR compliant",
    description: "Full compliance with European data protection regulations. Your data, your rights.",
  },
];

const certifications = ["SOC 2", "GDPR", "256-bit SSL", "2FA", "SSO"];

export function SecuritySection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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
    <section id="security" ref={sectionRef} className="relative py-24 lg:py-32 bg-foreground/[0.02] overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-[#e5380f]" />
              Security
            </span>
            <h2 className="text-4xl lg:text-6xl font-serif tracking-tight mb-8">
              Your data is
              <br />
              sacred.
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-12">
              Fundraising involves your most sensitive information. We protect it 
              with the same security standards used by financial institutions.
            </p>

            {/* Certifications */}
            <div className="flex flex-wrap gap-3">
              {certifications.map((cert, index) => (
                <span
                  key={cert}
                  className={`px-4 py-2 border border-foreground/10 text-sm font-mono transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 50 + 200}ms` }}
                >
                  {cert}
                </span>
              ))}
            </div>
          </div>

          {/* Right: mockup + features in a device frame */}
          <div className="relative rounded-3xl border border-foreground/10 bg-gradient-to-br from-foreground/[0.04] to-[#e5380f]/[0.04] p-6 sm:p-8">
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "22px 22px", opacity: 0.05 }} />
            <div className="relative">
              <div className="mx-auto max-w-[360px]"><SecurityCard /></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {securityFeatures.map((feature, index) => (
                  <div
                    key={feature.title}
                    className={`rounded-xl border border-foreground/10 bg-card/60 p-4 transition-all duration-500 group ${
                      isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                    }`}
                    style={{ transitionDelay: `${index * 80}ms` }}
                  >
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-foreground/10 text-[#e5380f] group-hover:bg-[#e5380f] group-hover:text-white transition-colors duration-300">
                      <feature.icon className="h-4.5 w-4.5" />
                    </div>
                    <h3 className="text-sm font-medium">{feature.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
