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
  title: "About Anker | Built for private capital",
  description:
    "Anker connects founders, venture funds, and limited partners through one AI-native operating system.",
};
const values = [
  {
    number: "01",
    title: "Founder First",
    description:
      "Every decision we make starts with one question: how does this help founders succeed? We exist to serve entrepreneurs building the future.",
  },
  {
    number: "02",
    title: "Radical Transparency",
    description:
      "We believe in open communication. Clear information and visible workflows help founders and fund teams understand where the work stands.",
  },
  {
    number: "03",
    title: "Long-term Partnership",
    description:
      "We're building for the long arc of a fund and a company — tools you keep using well beyond any single round.",
  },
  {
    number: "04",
    title: "Data-Driven Conviction",
    description:
      "We combine human intuition with AI-powered analysis to make smarter investment decisions, faster.",
  },
];

const milestones = [
  {
    year: "Dec 2025",
    event: "Anker begins as a research concept",
    metric: "First principles",
  },
  {
    year: "2026",
    event: "Building the venture OS in the open",
    metric: "Pre-seed",
  },
];

export default function AboutPage() {
  return (
    <main id="main-content" className={`marketing-site ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="About Anker"
        title="One system for the people moving venture forward."
        description="Anker is an AI-native operating system for the private-capital lifecycle: founders raising, venture funds operating, and limited partners tracking their capital."
        image="building"
      />
      <section className={e.section}>
        <div className={`${e.container} ${e.split}`}>
          <div>
            <span className={e.eyebrow}>Why we’re building</span>
            <h2>
              The work is connected.
              <br />
              The tools should be, too.
            </h2>
          </div>
          <div>
            <p className={e.sectionIntro}>
              A fundraise begins with a relationship. It becomes a diligence
              process, an investment, and an ongoing responsibility. Too often,
              the context is scattered across documents, inboxes, and separate
              systems.
            </p>
            <p className={e.sectionIntro}>
              Anker brings those workflows together, combining venture
              intelligence with the operating tools founders, funds, and LPs use
              to get things done.
            </p>
            <Link href="/vision" className={e.textLink}>
              Read our vision
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.dark}`}>
        <div className={e.container}>
          <span className={e.eyebrow}>Our principles</span>
          <h2>What guides the work.</h2>
          <div className="grid md:grid-cols-2 gap-x-16 gap-y-10 mt-12">
            {values.map((value) => (
              <div key={value.number} className={e.card}>
                <span className={e.number}>{value.number}</span>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={e.section}>
        <div className={e.container}>
          <span className={e.eyebrow}>Our journey</span>
          <h2>Built from first principles.</h2>
          <p className={e.sectionIntro}>
            Anker began as a research concept in December 2025. We’re building
            the product in the open, at the pre-seed stage, before our first
            funding round.
          </p>
          <div className="mt-12">
            {milestones.map((m) => (
              <div
                key={m.year}
                className="grid sm:grid-cols-[180px_1fr_180px] gap-4 py-8 border-t border-foreground/20"
              >
                <span className="font-serif text-3xl">{m.year}</span>
                <h3 className="text-xl">{m.event}</h3>
                <span className="text-muted-foreground">{m.metric}</span>
              </div>
            ))}
          </div>
          <Link href="/team" className={e.textLink}>
            Meet the founder
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <EditorialCta />
      <FooterSection />
    </main>
  );
}
