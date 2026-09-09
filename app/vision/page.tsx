import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import {
  EditorialHero,
  EditorialCta,
} from "@/components/landing/editorial-page";
import e from "@/components/landing/editorial.module.css";
export const metadata = {
  title: "Our vision | Anker",
  description:
    "The next interface for venture: connected intelligence, relationships, and operations for private capital.",
};
const pillars = [
  {
    number: "I",
    title: "Democratize Access",
    description:
      "Break down barriers between founders and capital. Use technology to level the playing field for entrepreneurs regardless of their network or background.",
  },
  {
    number: "II",
    title: "Intelligence at Scale",
    description:
      "Harness AI and data to make smarter investment decisions. Surface the best opportunities and match them with the right investors.",
  },
  {
    number: "III",
    title: "Build for Europe",
    description:
      "Create solutions designed for European markets. Understand local contexts, navigate regulatory complexity, and celebrate continental diversity.",
  },
];

const beliefs = [
  {
    statement: "Europe will produce the next trillion-dollar company",
    context:
      "With deep technical talent, strong research universities, and a maturing startup ecosystem, the opportunity to build category-defining companies has never been greater.",
  },
  {
    statement: "The best founders are everywhere",
    context:
      "Talent is equally distributed, but opportunity is not. We're using technology to change that equation.",
  },
  {
    statement: "Venture capital needs to evolve",
    context:
      "The traditional VC model was built for Silicon Valley. We're building what venture looks like for Europe and beyond.",
  },
];

export default function VisionPage() {
  return (
    <main id="main-content" className={`marketing-site ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Our vision"
        title="A more connected future for venture."
        description="We see a future where founders, funds, and limited partners work from a connected view of capital, relationships, and opportunity. Built in Europe, with a global horizon."
        image="future-energy"
      />
      <section className={e.section}>
        <div className={e.container}>
          <span className={e.eyebrow}>Our ambition</span>
          <h2>Intelligence that follows the work.</h2>
          <p className={e.sectionIntro}>
            The next interface for venture should connect the full lifecycle.
            Anker is being built to carry context from the first investor
            conversation through investment, operations, and reporting.
          </p>
          <div className={`${e.grid} mt-12`}>
            {pillars.map((p) => (
              <div key={p.number} className={e.card}>
                <span className={e.number}>{p.number}</span>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.silver}`}>
        <div className={e.container}>
          <span className={e.eyebrow}>What we believe</span>
          <h2>The ideas behind Anker.</h2>
          <div className="mt-12">
            {beliefs.map((belief, i) => (
              <div key={belief.statement} className={e.row}>
                <span className={e.number}>0{i + 1}</span>
                <h3>{belief.statement}</h3>
                <p>{belief.context}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={e.section}>
        <div className={`${e.container} ${e.split}`}>
          <div>
            <span className={e.eyebrow}>From conviction to product</span>
            <h2>
              Long-term ambition.
              <br />
              Practical work, today.
            </h2>
          </div>
          <div>
            <p className={e.sectionIntro}>
              Anker began as a research concept in December 2025. We’re at the
              start of the journey: pre-seed, pre-raise, building the platform
              before raising our first round.
            </p>
            <div className={e.actions}>
              <Link href="/about" className={e.textLink}>
                About Anker
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/changelog" className={e.textLink}>
                Follow our progress
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <EditorialCta title="Help shape the next chapter of venture." />
      <FooterSection />
    </main>
  );
}
