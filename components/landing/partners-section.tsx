import Link from "next/link";
import { ArrowRight } from "lucide-react";
import e from "./editorial.module.css";
import p from "./partners.module.css";
import { listedPartners } from "@/lib/marketing/partners";

/** The homepage strip: the partners' names, typeset, with a link to the full page. */
export function PartnersStrip() {
  const partners = listedPartners();
  if (!partners.length) return null;
  return (
    <section className={e.section} aria-labelledby="partners-heading">
      <div className={e.container}>
        <div className={e.sectionHeading}>
          <div>
            <span className={e.eyebrow}>Partners</span>
            <h2 id="partners-heading">Built with the people who build ventures.</h2>
          </div>
        </div>
        <ul className={p.strip}>
          {partners.map((x) => <li key={x.slug}>{x.name}</li>)}
        </ul>
        <p style={{ marginTop: "2rem" }}>
          <Link href="/partners" className={e.textLink}>
            Meet our partners
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}
