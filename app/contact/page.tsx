"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  EditorialHero,
  EditorialCta,
} from "@/components/landing/editorial-page";
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
  { value: "demo", label: "Product demo" },
  { value: "other", label: "Other" },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    inquiryType: "",
    message: "",
  });
  const [isPending, startTransition] = useTransition();
  const [submitStatus, setSubmitStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    try {
      const intent = new URLSearchParams(window.location.search).get("intent");
      if (intent === "demo" || intent === "founder") {
        setFormData((current) => ({ ...current, inquiryType: intent }));
      }
    } catch {
      // The form remains usable when URL APIs are unavailable.
    }
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus(null);

    startTransition(async () => {
      const result = await submitContactForm(formData);
      setSubmitStatus(result);
      if (result.success) {
        setFormData({
          name: "",
          email: "",
          company: "",
          inquiryType: "",
          message: "",
        });
      }
    });
  };

  return (
    <main
      id="main-content"
      className="marketing-site editorial-document min-h-screen bg-background text-foreground"
    >
      <Navigation />

      <EditorialHero
        eyebrow="Contact Anker"
        title="What are you building next?"
        description="Tell us about your company, fund, or workflow. We’ll explore where Anker can help."
      />

      {/* Contact Form Section */}
      <section
        id="contact-form"
        className="py-16 lg:py-24 border-t border-foreground/10 scroll-mt-24"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-12 gap-16 lg:gap-24">
            {/* Form */}
            <div className="lg:col-span-7">
              <h2 className="font-serif text-3xl mb-8">Send us a message</h2>

              <form
                aria-busy={isPending}
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="contact-name"
                      className="block font-mono text-xs text-muted-foreground uppercase mb-2"
                    >
                      Name *
                    </label>
                    <input
                      type="text"
                      required
                      id="contact-name"
                      name="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="contact-email"
                      className="block font-mono text-xs text-muted-foreground uppercase mb-2"
                    >
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      id="contact-email"
                      name="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="contact-company"
                      className="block font-mono text-xs text-muted-foreground uppercase mb-2"
                    >
                      Company
                    </label>
                    <input
                      type="text"
                      id="contact-company"
                      name="company"
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                      placeholder="Your company"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="contact-inquiryType"
                      className="block font-mono text-xs text-muted-foreground uppercase mb-2"
                    >
                      Inquiry Type *
                    </label>
                    <select
                      required
                      id="contact-inquiryType"
                      name="inquiryType"
                      value={formData.inquiryType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          inquiryType: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-transparent border border-foreground/20 text-foreground focus:outline-none focus:border-foreground transition-colors"
                    >
                      <option value="" className="bg-background">
                        Select type
                      </option>
                      {inquiryTypes.map((type) => (
                        <option
                          key={type.value}
                          value={type.value}
                          className="bg-background"
                        >
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    className="block font-mono text-xs text-muted-foreground uppercase mb-2"
                  >
                    Message *
                  </label>
                  <textarea
                    required
                    rows={6}
                    id="contact-message"
                    name="message"
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
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
                  <p
                    role="status"
                    aria-live="polite"
                    className={`mt-4 text-sm ${submitStatus.success ? "text-green-600" : "text-red-600"}`}
                  >
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
                    <p className="text-muted-foreground text-lg">
                      {headquarters.country}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-8 bg-foreground/5 border border-foreground/10">
                <h3 className="font-serif text-xl mb-4">Connect with us</h3>
                <p className="text-muted-foreground mb-6">
                  Follow our journey and stay updated on the latest from Anker
                  AI.
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

      <EditorialCta
        title="Raising a round? Start with your story."
        label="Submit your startup"
        href="/apply"
      />

      <FooterSection />
    </main>
  );
}
