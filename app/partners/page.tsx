import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { EditorialHero } from "@/components/landing/editorial-page";
import { InterviewEmbed } from "@/components/landing/interview-embed";
import e from "@/components/landing/editorial.module.css";
import p from "@/components/landing/partners.module.css";
import { RESIDENCY_INTERVIEW, partnersByGroup, listedPartners } from "@/lib/marketing/partners";

export const metadata = {
  title: "Partners | Anker",
  description: "The accelerators, studios, public programmes, investors and design partners Anker has worked with.",
  alternates: { canonical: "https://www.an-ker.de/partners" },
};

export default function PartnersPage() {
  const groups = partnersByGroup();
  const linked = listedPartners().filter((x) => x.url);
  const jsonLd = { "@context": "https://schema.org", "@type": "Organization", name: "Anker", url: "https://www.an-ker.de", ...(linked.length ? { partner: linked.map((x) => ({ "@type": "Organization", name: x.name, url: x.url })) } : {}) };
  return (
    <main id="main-content" className={`marketing-site ${e.page}`}>
      <Navigation />
      <EditorialHero eyebrow="Partners" title="Partners we have worked with." description="Accelerators, studios, public programmes, investors and the fund managers piloting Anker. They build ventures every day; Anker is shaped by working beside them." />
      <section className={e.section}>
        <div className={e.container}>
          {groups.map((g) => (
            <div key={g.key} className={p.group} aria-labelledby={`g-${g.key}`}>
              <h2 id={`g-${g.key}`}>{g.title}</h2>
              <p className={p.groupIntro}>{g.intro}</p>
              <ul className={p.cards}>
                {g.partners.map((x) => (
                  <li key={x.slug} className={e.card}>
                    {x.kind === "pilot" && <span className={p.badge}>Design partner</span>}
                    <h3 className={p.wordmark}>{x.name}</h3>
                    {x.description ? <p>{x.description}</p> : <p className={p.pending}>A partner of Anker.</p>}
                    {x.url && (
                      <a href={x.url} className={e.textLink} rel="noopener noreferrer">
                        Visit {x.name}
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {g.key === "programmes" && <InterviewEmbed interview={RESIDENCY_INTERVIEW} />}
            </div>
          ))}
          <p style={{ marginTop: "4rem" }}>
            Work with us? <Link href="/contact" className={e.textLink}>Get in touch<ArrowRight size={16} aria-hidden="true" /></Link>
          </p>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FooterSection />
    </main>
  );
}
