"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Mail, MapPin, Linkedin } from "lucide-react";
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

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
                <span className="w-8 h-px bg-foreground/30" />
                Contact
              </span>
              <h1 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight mb-6">
                {["Let's", "talk"].map((word, i) => (
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
                Whether you&apos;re a founder, investor, or just curious about what we do, 
                we&apos;d love to hear from you.
              </p>
            </div>
            <div className="flex items-end">
              <div className="w-full border border-foreground/10 p-8">
                <div className="flex items-center gap-4 mb-6">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground uppercase mb-1">Email</p>
                    <a href="mailto:vc@philippemasindet.com" className="text-foreground hover:underline">
                      vc@philippemasindet.com
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <Linkedin className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground uppercase mb-1">LinkedIn</p>
                    <a href="https://www.linkedin.com/in/philippe-m-masindet/" target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
                      Philippe M. Masindet
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground uppercase mb-1">Headquarters</p>
                    <p className="text-foreground">Berlin, Germany</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 lg:py-24 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-12 gap-16 lg:gap-24">
            {/* Form */}
            <div className="lg:col-span-7">
              <h2 className="font-display text-3xl mb-8">Send us a message</h2>
              
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
              <h2 className="font-display text-3xl mb-8">Headquarters</h2>
              
              <div className="py-8 border border-foreground/10 p-8">
                <div className="flex items-start gap-4">
                  <MapPin className="w-6 h-6 text-muted-foreground shrink-0 mt-1" />
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-display text-2xl text-foreground">
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
                <h3 className="font-display text-xl mb-4">Connect with us</h3>
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
          <h2 className="font-display text-4xl lg:text-5xl tracking-tight mb-6">
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
