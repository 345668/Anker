"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Mail, MapPin, Linkedin, Play } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { submitContactForm } from "./actions";

const headquarters = {
  city: "Berlin",
  country: "Germany",
  label: "Headquarters",
};

const inquiryTypes = [
  { value: "founder", label: "I'm a founder seeking funding" },
  { value: "investor", label: "I'm an investor interested in Anker" },
  { value: "partnership", label: "Partnership inquiry" },
  { value: "careers", label: "Career opportunities" },
  { value: "press", label: "Press inquiry" },
  { value: "other", label: "Other" },
];

export default function ContactPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    inquiryType: "",
    message: "",
  });
  const [isPending, startTransition] = useTransition();
  const [submitStatus, setSubmitStatus] = useState<{ success: boolean; message: string } | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus(null);
    
    startTransition(async () => {
      const result = await submitContactForm(formData);
      setSubmitStatus(result);
      if (result.success) {
        setFormData({ name: "", email: "", company: "", inquiryType: "", message: "" });
      }
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero — "Let's connect" (Carta layout) */}
      <section ref={heroRef} className="relative pt-32 pb-14 lg:pt-40 lg:pb-16 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="font-serif text-6xl md:text-7xl lg:text-8xl tracking-tight mb-8">
            {["Let's", "connect"].map((word, i) => (
              <span
                key={word}
                className={`inline-block mr-4 last:mr-0 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                {word}
              </span>
            ))}
          </h1>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-7 h-12 bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors group"
            >
              Request a demo
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#contact-form"
              className="inline-flex items-center justify-center gap-2 px-7 h-12 border border-foreground/25 text-foreground text-sm font-medium hover:bg-foreground/5 transition-colors"
            >
              <Play className="w-4 h-4" /> Watch a video tour
            </a>
          </div>
        </div>
      </section>

      {/* Resource cards — Carta "Product / Insights" grid */}
      <section className="pb-16 lg:pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Featured product card */}
            <Link href="/newsroom" className="group relative overflow-hidden bg-[#111] text-white rounded-sm min-h-[320px] flex flex-col justify-end p-8">
              <div
                className="absolute inset-0 opacity-40"
                style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)", backgroundSize: "22px 22px" }}
                aria-hidden
              />
              <div className="absolute top-8 left-8 right-8 flex items-center gap-4">
                <span className="inline-flex items-center rounded border border-white/40 px-3 py-1.5 font-display font-semibold text-sm">Anker</span>
                <span className="text-white/40">·····</span>
                <span className="font-serif text-2xl">Claude</span>
              </div>
              <span className="inline-flex w-fit items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] bg-[#e5380f] text-white px-2.5 py-1 mb-3">
                <span className="w-2 h-2 bg-black/70" /> Product
              </span>
              <h3 className="font-serif text-2xl lg:text-3xl leading-tight max-w-md group-hover:translate-x-1 transition-transform">
                Introducing Anker Plugins for Claude: the future of private capital operations
              </h3>
            </Link>

            {/* Insights stack */}
            <div className="grid grid-rows-2 gap-4">
              {[
                { title: "Fund Economics Report 2025", date: "December 2025", accent: "#3a4a44" },
                { title: "Q4 2025 VC Fund Performance", date: "March 2026", accent: "#1a1a1a" },
              ].map((c) => (
                <Link key={c.title} href="/newsroom" className="group relative overflow-hidden rounded-sm p-8 flex flex-col justify-between min-h-[152px]" style={{ backgroundColor: c.accent }}>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-serif text-xl lg:text-2xl text-white leading-snug max-w-xs group-hover:translate-x-1 transition-transform">{c.title}</h3>
                    <span className="w-14 h-14 rounded-full bg-gradient-to-br from-white/30 to-white/5 shrink-0" aria-hidden />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] bg-[#e5380f] text-white px-2.5 py-1">
                      <span className="w-2 h-2 bg-black/70" /> Insights
                    </span>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-white/50">{c.date}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact-form" className="py-16 lg:py-24 border-t border-foreground/10 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-12 gap-16 lg:gap-24">
            {/* Form */}
            <div className="lg:col-span-7">
              <h2 className="font-serif text-3xl mb-8">Send us a message</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-mono text-xs text-muted-foreground uppercase mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-xs text-muted-foreground uppercase mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-mono text-xs text-muted-foreground uppercase mb-2">
                      Company
                    </label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                      placeholder="Your company"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-xs text-muted-foreground uppercase mb-2">
                      Inquiry Type *
                    </label>
                    <select
                      required
                      value={formData.inquiryType}
                      onChange={(e) => setFormData({ ...formData, inquiryType: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground focus:outline-none focus:border-foreground transition-colors appearance-none"
                    >
                      <option value="" className="bg-background">Select type</option>
                      {inquiryTypes.map((type) => (
                        <option key={type.value} value={type.value} className="bg-background">
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-xs text-muted-foreground uppercase mb-2">
                    Message *
                  </label>
                  <textarea
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors resize-none"
                    placeholder="How can we help you?"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {isPending ? "Sending..." : "Send Message"}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>

                {submitStatus && (
                  <p className={`mt-4 text-sm ${submitStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                    {submitStatus.message}
                  </p>
                )}
              </form>
            </div>

            {/* Headquarters */}
            <div className="lg:col-span-5">
              <h2 className="font-serif text-3xl mb-8">Headquarters</h2>
              
              <div className="py-8 border border-foreground/10 p-8">
                <div className="flex items-start gap-4">
                  <MapPin className="w-6 h-6 text-muted-foreground shrink-0 mt-1" />
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-serif text-2xl text-foreground">
                        {headquarters.city}
                      </h3>
                      <span className="px-2 py-0.5 bg-foreground text-background text-xs font-mono">
                        HQ
                      </span>
                    </div>
                    <p className="text-muted-foreground text-lg">{headquarters.country}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-8 bg-foreground/5 border border-foreground/10">
                <h3 className="font-serif text-xl mb-4">Connect with us</h3>
                <p className="text-muted-foreground mb-6">
                  Follow our journey and stay updated on the latest from Anker AI.
                </p>
                <a 
                  href="https://www.linkedin.com/in/philippe-m-masindet/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-foreground hover:underline"
                >
                  <Linkedin className="w-5 h-5" />
                  Follow on LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Founders CTA */}
      <section className="py-24 lg:py-32 bg-foreground text-background">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 text-center">
          <span className="font-mono text-xs tracking-widest text-background/50 uppercase block mb-6">
            For Founders
          </span>
          <h2 className="font-serif text-4xl lg:text-5xl tracking-tight mb-6">
            Ready to raise your next round?
          </h2>
          <p className="text-lg text-background/60 mb-8 max-w-xl mx-auto">
            Skip the form and go straight to our platform. Connect with investors, 
            submit your pitch, and track your progress in real-time.
          </p>
          <Link 
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-background text-foreground text-sm font-medium rounded-full hover:bg-background/90 transition-colors group"
          >
            Get Started
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
