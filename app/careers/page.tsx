import Link from "next/link";
import { ArrowRight, Heart, Compass, Zap, Globe2 } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import {
  EditorialHero,
  EditorialCta,
} from "@/components/landing/editorial-page";
import e from "@/components/landing/editorial.module.css";
export const metadata = {
  title: "Careers | Build with Anker",
  description:
    "Explore opportunities to help build the operating system for venture.",
};
const roles = [
  {
    team: "Engineering",
    title: "Senior full-stack engineer",
    location: "Berlin / Remote (EU timezones)",
    type: "Full-time",
  },
  {
    team: "Engineering",
    title: "AI / ML engineer",
    location: "Remote",
    type: "Full-time",
  },
  {
    team: "Engineering",
    title: "Platform / infrastructure engineer",
    location: "Remote",
    type: "Full-time",
  },
  {
    team: "Product",
    title: "Product manager — Venture studio",
    location: "Remote",
    type: "Full-time",
  },
  {
    team: "Design",
    title: "Product designer",
    location: "Remote",
    type: "Full-time",
  },
  {
    team: "Go-to-market",
    title: "Founding GTM (fund relationships)",
    location: "Berlin / London / Remote",
    type: "Full-time",
  },
  {
    team: "Operations",
    title: "Customer success — Family offices",
    location: "Berlin / Remote (EU timezones)",
    type: "Full-time",
  },
];

const values = [
  {
    icon: Heart,
    title: "Founders first",
    body: "Every decision starts with: does this make the founder's job easier? If the answer's no, we don't ship it.",
  },
  {
    icon: Compass,
    title: "Boring infrastructure, magical UX",
    body: "Stable, secure, fast under the hood. The product surface should feel like the future. Both, not either.",
  },
  {
    icon: Zap,
    title: "Ship weekly",
    body: "The platform improves every Tuesday. Long roadmaps are a planning failure; short cycles teach us what to build.",
  },
  {
    icon: Globe2,
    title: "Distributed by design",
    body: "We hire wherever the best people are. Async-first, written-first, generous time off when you've earned it.",
  },
];

const benefits = [
  "Competitive salary + meaningful equity",
  "Full remote with quarterly in-person team weeks",
  "Latest hardware + $1,500 home-office stipend",
  "Health insurance in every major hiring geography",
  "Generous time off — minimum 25 days + local holidays",
  "Annual learning budget — courses, books, conferences",
  "Co-working stipend if you prefer working out of the house",
  "Sabbatical after 4 years",
];

export default function CareersPage() {
  return (
    <main id="main-content" className={`marketing-light ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Careers at Anker"
        title="Build the infrastructure behind the next generation of companies."
        description="Bring your perspective to the work connecting founders, venture funds, and limited partners."
        image="building"
        action={{ label: "Explore roles", href: "#open-roles" }}
      />
      <section className={e.section}>
        <div className={e.container}>
          <span className={e.eyebrow}>How we work</span>
          <h2>
            Ideas become useful
            <br />
            when someone builds them.
          </h2>
          <div className="grid md:grid-cols-2 gap-x-16 gap-y-10 mt-12">
            {values.map((value) => (
              <div key={value.title} className={e.card}>
                <h3>{value.title}</h3>
                <p>{value.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.silver}`} id="open-roles">
        <div className={e.container}>
          <span className={e.eyebrow}>Opportunities</span>
          <h2>Find your next contribution.</h2>
          <div className="mt-12">
            {roles.map((role) => (
              <Link
                href="/contact"
                key={role.title}
                className="grid sm:grid-cols-[160px_1fr_24px] gap-4 py-7 border-t border-foreground/20 group"
              >
                <span className="text-sm text-muted-foreground">
                  {role.team}
                </span>
                <div>
                  <h3 className="font-serif text-2xl group-hover:underline underline-offset-4">
                    {role.title}
                  </h3>
                  <p className="mt-3 text-muted-foreground text-sm">
                    {role.location} · {role.type}
                  </p>
                </div>
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className={e.section}>
        <div className={`${e.container} ${e.split}`}>
          <div>
            <span className={e.eyebrow}>Working at Anker</span>
            <h2>
              Space to do
              <br />
              meaningful work.
            </h2>
          </div>
          <ul className="space-y-5">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="border-b border-foreground/15 pb-5 leading-relaxed"
              >
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <EditorialCta
        title="See a different way to contribute?"
        label="Start a conversation"
      />
      <FooterSection />
    </main>
  );
}
