"use client";

import { useEffect, useState } from "react";

// Attributions are intentionally anonymous — role/title only, no names or
// company names.
const testimonials = [
  {
    quote: "Anker helped us find investors who truly understood our vision. We closed our seed round in 6 weeks.",
    role: "Founder & CEO",
    metric: "$8M Seed Round",
  },
  {
    quote: "The AI matching saved us months of cold outreach. Every intro was warm and relevant to our space.",
    role: "Co-Founder",
    metric: "3x faster close",
  },
  {
    quote: "From pitch deck feedback to investor intros, Anker was instrumental in our Series A success.",
    role: "CEO",
    metric: "$170M raised",
  },
  {
    quote: "The investor database is incredible. We found LPs and family offices we never knew existed.",
    role: "Co-Founder",
    metric: "40K+ investor contacts",
  },
];

export function TestimonialsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % testimonials.length);
        setIsAnimating(false);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeTestimonial = testimonials[activeIndex];

  return (
    <section className="relative py-32 lg:py-40 border-t border-foreground/10 lg:pb-14">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Section Label */}
        <div className="flex items-center gap-4 mb-16">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            What people say
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="font-mono text-xs text-muted-foreground">
            {String(activeIndex + 1).padStart(2, "0")} / {String(testimonials.length).padStart(2, "0")}
          </span>
        </div>

        {/* Main Quote */}
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-8">
            <blockquote
              className={`transition-all duration-300 ${
                isAnimating ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
              }`}
            >
              <p className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-foreground">
                "{activeTestimonial.quote}"
              </p>
            </blockquote>

            {/* Author */}
            <div
              className={`mt-12 flex items-center gap-6 transition-all duration-300 delay-100 ${
                isAnimating ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center">
                <span className="font-display text-2xl text-foreground/60">&ldquo;</span>
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">{activeTestimonial.role}</p>
                <p className="text-muted-foreground">Verified Anker founder</p>
              </div>
            </div>
          </div>

          {/* Metric Highlight */}
          <div className="lg:col-span-4 flex flex-col justify-center">
            <div
              className={`p-8 border border-foreground/10 transition-all duration-300 ${
                isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"
              }`}
            >
              <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-4">
                Key Result
              </span>
              <p className="font-display text-3xl md:text-4xl text-foreground">
                {activeTestimonial.metric}
              </p>
            </div>

            {/* Navigation Dots */}
            <div className="flex gap-2 mt-8">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsAnimating(true);
                    setTimeout(() => {
                      setActiveIndex(idx);
                      setIsAnimating(false);
                    }, 300);
                  }}
                  className={`h-2 transition-all duration-300 ${
                    idx === activeIndex
                      ? "w-8 bg-foreground"
                      : "w-2 bg-foreground/20 hover:bg-foreground/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
