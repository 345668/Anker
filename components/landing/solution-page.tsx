import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { SIGNUP_CTA_VISIBLE } from "@/lib/auth/signups";
import e from "./editorial.module.css";

export type SolutionContent = {
  eyebrow: string;
  title: string;
  lede: string;
  editorial?: {
    image: "convergence" | "perspective" | "building";
    premise: string;
    context: string;
  };
  accent: string;
  features: { title: string; desc: string; icon: LucideIcon }[];
  steps: { label: string; body: string }[];
  /** Carta-style numbered deep-dive sections (heading + numeral + point list + mock panel). */
  sections?: {
    kicker: string;
    intro: string;
    points: { title: string; body: string }[];
  }[];
  quote?: { text: string; name: string; role: string };
};

export function SolutionPage({ c }: { c: SolutionContent }) {
  const art = c.editorial?.image || "perspective";
  return (
    <main id="main-content" className={`marketing-light ${e.page}`}>
      <Navigation />
      <section className={c.sections ? e.splitHero : e.hero}>
        <div className={c.sections ? e.splitHeroCopy : e.container}>
          <span className={e.eyebrow}>{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p className={e.lede}>{c.lede}</p>
          <div className={e.actions}>
            <Link href="/contact" className={e.button}>
              Discuss your workflow
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href={SIGNUP_CTA_VISIBLE ? "/register" : "/login"}
              className={e.textLink}
            >
              {SIGNUP_CTA_VISIBLE ? "Get started" : "Sign in to Anker"}
            </Link>
          </div>
        </div>
        {c.sections && (
          <Image
            src={`/editorial/${art}.webp`}
            alt=""
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 767px) 100vw, 50vw"
            className={e.splitHeroImage}
          />
        )}
      </section>
      {!c.sections && c.editorial && (
        <section className={`${e.section} ${e.silver}`}>
          <div className={`${e.container} ${e.split}`}>
            <Image
              src={`/editorial/${art}.webp`}
              alt=""
              width={1536}
              height={1024}
              sizes="(max-width: 767px) 100vw, 50vw"
              className={e.art}
            />
            <div>
              <span className={e.eyebrow}>The opportunity</span>
              <h2>{c.editorial.premise}</h2>
              <p className={e.sectionIntro}>{c.editorial.context}</p>
            </div>
          </div>
        </section>
      )}
      <section className={e.section} id="capabilities">
        <div className={e.container}>
          <div className={e.sectionHeading}>
            <div>
              <span className={e.eyebrow}>Capabilities</span>
              <h2>
                {c.sections
                  ? "Built around your responsibilities."
                  : "The detail behind the workflow."}
              </h2>
            </div>
          </div>
          <div className={e.grid}>
            {c.features.map((feature, i) => (
              <div key={feature.title} className={e.card}>
                <span className={e.number}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {c.sections?.map((section, i) => (
        <section
          key={section.kicker}
          className={`${e.section} ${i % 2 === 0 ? e.silver : ""}`}
        >
          <div className={e.container}>
            <div className={e.split}>
              <div>
                <span className={e.eyebrow}>0{i + 1} / In practice</span>
                <h2>{section.kicker}</h2>
                <p className={e.sectionIntro}>{section.intro}</p>
              </div>
              <div className={e.rows}>
                {section.points.map((point) => (
                  <div
                    key={point.title}
                    className="py-6 border-b border-foreground/15"
                  >
                    <h3 className="font-serif text-2xl mb-3">{point.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {point.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
      <section className={`${e.section} ${e.dark}`}>
        <div className={e.container}>
          <span className={e.eyebrow}>How it works</span>
          <h2>From intent to action.</h2>
          <div className={`${e.grid} mt-12`}>
            {c.steps.map((step, i) => (
              <div key={step.label} className={e.card}>
                <span className={e.number}>
                  Step {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{step.label}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={e.cta}>
        <div className={e.container}>
          <h2>
            Bring your next challenge.
            <br />
            We’ll explore it together.
          </h2>
          <Link href="/contact" className={e.button}>
            Request a conversation
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FooterSection />
    </main>
  );
}
