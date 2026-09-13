import { EditorialHero } from "@/components/landing/editorial-page";
import e from "@/components/landing/editorial.module.css";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Key,
  Eye,
  Database,
  Bug,
  FileCheck,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

export const metadata = {
  title: "Security — Anker",
  description:
    "How Anker protects your data: encryption, access control, audit logging, vulnerability disclosure, sub-processors.",
};

const practices = [
  {
    icon: Lock,
    title: "Account protection",
    body: "Anker’s account system uses hashed passwords and signed sessions. Restricted workflows check the signed-in user before granting access.",
  },
  {
    icon: Key,
    title: "Administrative controls",
    body: "Administrative tools use server-side access checks. Fund operations and publishing workflows have dedicated access controls.",
  },
  {
    icon: Eye,
    title: "Activity records",
    body: "Audit records support review of recorded administrative activity, including the actor, action, and timestamp. Ask us about coverage and retention for your workflow.",
  },
  {
    icon: Database,
    title: "LP access",
    body: "LP portal access is scoped to an investor and fund. Portal links can be revoked and can carry an expiry date.",
  },
  {
    icon: FileCheck,
    title: "Review before publishing",
    body: "LP reports and letters pass through publication states before they become available in the portal. Teams control what they share with investors.",
  },
  {
    icon: ShieldCheck,
    title: "Deployment requirements",
    body: "Encryption, backups, retention, and AI provider settings depend on the deployment. Contact us to review the configuration and requirements for your organization.",
  },
];

export default function SecurityPage() {
  return (
    <main
      id="main-content"
      className="marketing-site editorial-document min-h-screen bg-background text-foreground"
    >
      <Navigation />

      <EditorialHero
        eyebrow="Trust / Security"
        title="Security is part of the work."
        description="Funds and founders use Anker to hold sensitive material: pitch decks, LP letters, cap tables, and capital calls. Explore the practices behind the platform."
        action={{
          label: "Report a vulnerability",
          href: "mailto:security@an-ker.de",
        }}
        secondary={{ label: "Privacy policy", href: "/privacy" }}
      />

      {/* Practices */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="text-sm font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Practices
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-10">
            Protecting the information behind your decisions.
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {practices.map((p) => (
              <div
                key={p.title}
                className="border border-foreground/10 rounded-none p-6 bg-background"
              >
                <div className="w-9 h-9 rounded-none bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-4">
                  <p.icon className="w-4 h-4 text-foreground/70" />
                </div>
                <h3 className="font-serif text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclosure */}
      <section className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <div className="text-sm font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <Bug className="w-3 h-3" /> Responsible disclosure
          </div>
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight mb-4">
            Find a vulnerability?
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Email{" "}
            <a href="mailto:security@an-ker.de" className="underline">
              security@an-ker.de
            </a>{" "}
            with a description and steps to reproduce. Include the affected page
            or workflow and use a minimal example that does not expose another
            person’s information.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li>
              · Do not exfiltrate data — a single proof-of-access is enough
            </li>
            <li>
              · Do not access other users' accounts without explicit permission
            </li>
            <li>· Do not perform DoS or social engineering</li>
            <li>
              · Give us a reasonable window to fix before public disclosure
            </li>
          </ul>
        </div>
      </section>

      {/* Incident response */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02] py-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <div className="text-sm font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Incident response
          </div>
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight mb-4">
            Discuss your response requirements.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Contact our security team to discuss incident handling, notification
            arrangements, and the documentation your organization needs before
            sharing sensitive material.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-foreground/10">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight">
            Questions?
          </h2>
          <p className="mt-4 text-muted-foreground">
            For security documentation and data-processing questions, email{" "}
            <a href="mailto:security@an-ker.de" className="underline">
              security@an-ker.de
            </a>
            .
          </p>
          <div className="mt-8">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-none bg-foreground text-background hover:bg-foreground/90"
            >
              Get in touch <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
