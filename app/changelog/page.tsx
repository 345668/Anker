import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import s from "@/components/landing/publication-pages.module.css";

export const metadata = {
  title: "Changelog — Anker",
  description: "A concise overview of the latest Anker features and improvements for founders, funds and investors.",
  alternates: { canonical: "https://www.an-ker.de/changelog" },
};

// Public summaries only: keep implementation notes in the repository.
const updates = [
  {
    date: "2026-09", label: "September 2026",
    title: "A better start. A more connected team.",
    summary: "Clearer workspace setup and team management make it easier to get started and collaborate in Anker.",
    highlights: ["Invite teammates, manage access and transfer workspace ownership.", "Request early access through the new Anker waitlist."],
  },
  {
    date: "2026-06", label: "June 2026",
    title: "Less friction in your daily workflow.",
    summary: "Improvements to campaign imports, outreach preparation and navigation help you move between tasks more easily.",
    highlights: ["More flexible spreadsheet imports and better context for outreach drafts.", "Clearer newsroom articles and more consistent account navigation."],
  },
  {
    date: "2026-04", label: "April 2026",
    title: "Plan your raise with more clarity.",
    summary: "Explore ownership and cash-flow scenarios, review fundraising materials and organize investor outreach.",
    highlights: ["Cap table, dilution and runway planning tools.", "Refinements to investor matching, pitch deck review and outreach workflows."],
  },
  {
    date: "2026-03", label: "March 2026",
    title: "Keep relationships and documents organized.",
    summary: "Updates to document sharing, contact management and deal tracking support the day-to-day work behind your raise.",
    highlights: ["Data room sharing and contact management improvements.", "More reliable deal-stage updates in the pipeline."],
  },
];
export default function ChangelogPage() {
  return <main id="main-content" className={`marketing-site ${s.page}`}>
    <Navigation />
    <header className={s.hero}><div className={s.container}>
      <nav aria-label="Breadcrumb" className={s.breadcrumb}><Link href="/">Anker</Link><span aria-hidden="true">/</span><span>Changelog</span></nav>
      <div className={s.heroGrid}>
        <div><p className={s.eyebrow}>Product updates</p><h1>What’s new at Anker.</h1><p className={s.intro}>The latest features and improvements, at a glance.</p></div>
        <p className="text-sm leading-relaxed text-muted-foreground">For founders, funds and investors.<br />Built around the way you work.</p>
      </div>
    </div></header>
    <section aria-label="Product update history" className={`${s.container} ${s.releases}`}>
      {updates.map((update, index) => <article key={update.date} className={s.release} aria-labelledby={`update-${update.date}`}>
        <div className={s.releaseDate}><time dateTime={update.date}>{update.label}</time>{index === 0 && <span className={s.latest}>Latest update</span>}</div>
        <div><h2 id={`update-${update.date}`}>{update.title}</h2><p>{update.summary}</p><ul>{update.highlights.map(highlight => <li key={highlight}>{highlight}</li>)}</ul></div>
      </article>)}
    </section>
    <aside className={`${s.container} ${s.feedback}`} aria-labelledby="feedback-heading">
      <div><h2 id="feedback-heading">Help shape what comes next.</h2><p>Share an idea or tell us what would make your work easier.</p></div>
      <Link href="/contact" className={s.textLink}>Share feedback <ArrowRight size={16} aria-hidden="true" /></Link>
    </aside>
    <FooterSection />
  </main>;
}
