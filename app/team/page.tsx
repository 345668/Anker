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
  title: "Our team | Anker",
  description:
    "Meet the founder building Anker, the operating system for private capital.",
};
export default function TeamPage() {
  return (
    <main id="main-content" className={`marketing-site ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Our team"
        title="Built by an operator. For the work ahead."
        description="Anker is a founder-led project building toward a connected operating system for founders, venture funds, and limited partners."
      />
      <section className={e.section}>
        <div className={`${e.container} ${e.split}`}>
          <div
            className="aspect-square bg-secondary flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="font-serif text-[clamp(6rem,15vw,12rem)] text-muted-foreground">
              PM
            </span>
          </div>
          <div>
            <span className={e.eyebrow}>Founder</span>
            <h2>Philippe Masindet</h2>
            <p className={e.sectionIntro}>
              Building Anker — a venture operating system for founders, VCs, and
              LPs.
            </p>
            <p className={e.sectionIntro}>
              Anker is a one-person project today, bringing research and
              hands-on product development together around the work of private
              capital.
            </p>
            <a
              href="https://www.linkedin.com/in/philippe-m-masindet/"
              target="_blank"
              rel="noopener noreferrer"
              className={e.textLink}
            >
              Connect on LinkedIn
              <ArrowRight size={18} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </section>
      <EditorialCta
        title="Interested in building with us?"
        label="Explore careers"
        href="/careers"
      />
      <FooterSection />
    </main>
  );
}
