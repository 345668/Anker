"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

const categories = [
  { id: "founders", label: "For Founders" },
  { id: "investors", label: "For Investors" },
  { id: "platform", label: "Platform" },
  { id: "general", label: "General" },
];

const faqs = {
  founders: [
    {
      question: "What stages do you invest in?",
      answer: "We invest across Pre-seed, Seed, and Series A rounds. Our typical check sizes range from $100K to $2M, with the ability to follow on in subsequent rounds.",
    },
    {
      question: "What sectors do you focus on?",
      answer: "We're sector-agnostic but have deep expertise in Fintech, Healthtech, Agritech, Logistics, and Enterprise SaaS. We look for companies solving real problems at scale.",
    },
    {
      question: "How long does your investment process take?",
      answer: "Our AI-powered screening helps us move fast. From first meeting to term sheet, we typically take 4-6 weeks. We believe founders shouldn't wait months for a decision.",
    },
    {
      question: "What do you look for in founders?",
      answer: "We look for exceptional founders with deep domain expertise, a clear vision, and the resilience to build category-defining companies. Prior startup experience is a plus but not required.",
    },
    {
      question: "Do you lead rounds?",
      answer: "Yes, we frequently lead rounds and can also co-invest alongside other VCs. We're flexible and focus on what's best for the company.",
    },
  ],
  investors: [
    {
      question: "How can I invest in Anker's funds?",
      answer: "We welcome accredited investors and institutional LPs. Please contact us through our platform to discuss investment opportunities and fund details.",
    },
    {
      question: "What is your fund structure?",
      answer: "We manage multiple vehicles including our flagship European venture fund, sector-specific funds, and co-investment opportunities for our LPs.",
    },
    {
      question: "What is your track record?",
      answer: "Since 2019, we've deployed capital across 120+ companies with a portfolio-wide average MOIC of 3.2x. Our top quartile companies have achieved 10x+ returns.",
    },
    {
      question: "How do you source deals?",
      answer: "Our proprietary AI platform analyzes thousands of companies across Europe and beyond. Combined with our extensive network, we see over 3,000 companies annually.",
    },
  ],
  platform: [
    {
      question: "What is Anker?",
      answer: "Anker is our AI-powered venture intelligence platform. It helps founders find investors, investors discover opportunities, and everyone make better decisions with data.",
    },
    {
      question: "Is the platform free to use?",
      answer: "Basic access is free for founders. We offer premium features for power users and custom enterprise solutions for firms needing advanced capabilities.",
    },
    {
      question: "How does the AI matching work?",
      answer: "Our ML models analyze hundreds of data points including sector, stage, geography, and investment thesis to match founders with the most relevant investors.",
    },
    {
      question: "Can I use the platform without seeking funding?",
      answer: "Absolutely. Many users leverage our research tools, market intelligence, and networking features without active fundraising.",
    },
  ],
  general: [
    {
      question: "Where is Anker headquartered?",
      answer: "We're headquartered in Berlin, Germany with a distributed team across Europe and beyond. We operate globally with a focus on European venture markets.",
    },
    {
      question: "Are you hiring?",
      answer: "We're always looking for exceptional talent. Check our careers page or reach out directly if you're passionate about building the operating system for venture.",
    },
    {
      question: "How can I partner with Anker?",
      answer: "We collaborate with accelerators, corporate partners, and ecosystem builders. Reach out through our contact page to explore partnership opportunities.",
    },
  ],
};

export default function FAQPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState("founders");
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
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

  const currentFaqs = faqs[activeCategory as keyof typeof faqs];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-32 pb-16 lg:pt-40 lg:pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            FAQ
          </span>
          <div className="max-w-3xl">
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight mb-6">
              {["Frequently", "asked", "questions"].map((word, i) => (
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
            <p className="text-xl text-muted-foreground">
              Everything you need to know about Anker and our platform. 
              Can&apos;t find what you&apos;re looking for? <Link href="/contact" className="underline underline-offset-4 hover:text-foreground transition-colors">Get in touch</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex overflow-x-auto py-6 gap-2 -mx-6 px-6 lg:mx-0 lg:px-0">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  setOpenQuestion(null);
                }}
                className={`px-5 py-2.5 font-mono text-sm whitespace-nowrap transition-all duration-300 ${
                  activeCategory === category.id
                    ? "bg-foreground text-background"
                    : "bg-foreground/5 text-foreground hover:bg-foreground/10"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="py-16 lg:py-24 border-t border-foreground/10">
        <div className="max-w-4xl mx-auto px-6 lg:px-12">
          <div className="space-y-0">
            {currentFaqs.map((faq, idx) => {
              const isOpen = openQuestion === faq.question;
              return (
                <div 
                  key={faq.question}
                  className="border-b border-foreground/10"
                >
                  <button
                    onClick={() => setOpenQuestion(isOpen ? null : faq.question)}
                    className="w-full py-6 flex items-start justify-between gap-4 text-left group"
                  >
                    <div className="flex items-start gap-6">
                      <span className="font-mono text-sm text-muted-foreground shrink-0">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-serif text-xl lg:text-2xl text-foreground group-hover:translate-x-2 transition-transform duration-300">
                        {faq.question}
                      </h3>
                    </div>
                    <ChevronDown 
                      className={`w-5 h-5 text-muted-foreground shrink-0 mt-1 transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                      }`} 
                    />
                  </button>
                  <div 
                    className={`overflow-hidden transition-all duration-500 ${
                      isOpen ? "max-h-96 pb-6" : "max-h-0"
                    }`}
                  >
                    <div className="pl-12 lg:pl-16">
                      <p className="text-muted-foreground leading-relaxed max-w-2xl">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 lg:py-32 border-t border-foreground/10 bg-foreground/[0.02]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
                Still have questions?
              </span>
              <h2 className="font-serif text-4xl lg:text-5xl tracking-tight mb-6">
                We&apos;re here to help
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-md">
                Our team is available to answer any questions and help you get started 
                on the platform.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link 
                  href="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:bg-foreground/90 transition-colors group"
                >
                  Contact Us
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link 
                  href="/platform"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground text-sm font-medium rounded-full hover:border-foreground hover:bg-foreground/5 transition-all"
                >
                  Explore Platform
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-8 border border-foreground/10">
                <span className="font-serif text-3xl text-foreground block mb-2">24hr</span>
                <p className="text-sm text-muted-foreground">Average response time</p>
              </div>
              <div className="p-8 border border-foreground/10">
                <span className="font-serif text-3xl text-foreground block mb-2">10K+</span>
                <p className="text-sm text-muted-foreground">Users supported</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
