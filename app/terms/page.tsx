import Link from "next/link"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Terms of Service — Anker",
  description: "The terms that govern your use of the Anker platform.",
}

const LAST_UPDATED = "June 22, 2026"

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      <section className="border-b border-foreground/10">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Legal · Last updated {LAST_UPDATED}
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">Terms of Service</h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground leading-relaxed">
            By using Anker you agree to these terms. They're written to be understandable.
            If something's unclear, email <a href="mailto:legal@an-ker.de" className="underline">legal@an-ker.de</a>.
          </p>
        </div>
      </section>

      <article className="article-body max-w-3xl mx-auto px-6 lg:px-12 py-16 lg:py-20 text-foreground leading-[1.7]">
        <h2>1. What Anker is</h2>
        <p>
          Anker is an AI platform for venture funds and the founders they back. We provide
          tools to discover investors, draft pitch materials, manage outreach, track portfolio
          companies, run capital calls, distribute proceeds, publish a newsroom, and run an LP
          portal. The exact features available to you depend on your account tier.
        </p>

        <h2>2. Your account</h2>
        <ul>
          <li>You must be 16 or older to create an account.</li>
          <li>One person per account. Share access with teammates via team invites, not credentials.</li>
          <li>Keep your password secure. If you suspect compromise, rotate it immediately and notify us.</li>
          <li>You're responsible for anything done with your account.</li>
        </ul>

        <h2>3. Acceptable use</h2>
        <p>You agree NOT to:</p>
        <ul>
          <li>Reverse-engineer, scrape, or copy the platform other than as expressly permitted</li>
          <li>Use Anker to send unsolicited bulk messages outside the lawful use cases of fundraising and portfolio communications</li>
          <li>Upload content you don't have the right to upload</li>
          <li>Upload malware, illegal content, or content that infringes intellectual property</li>
          <li>Attempt to access another user's account, content, or data</li>
          <li>Use the platform to violate any applicable law, sanctions regime, or court order</li>
        </ul>
        <p>
          We may suspend or terminate accounts for material breach. For clear-cut violations
          (e.g. uploading malware) we may act without notice.
        </p>

        <h2>4. Your content</h2>
        <p>
          You retain ownership of everything you upload — pitch decks, company profiles, LP
          letters, contacts, files in the data room. You grant Anker a limited license to host,
          process, and display that content only to provide the platform to you and your
          authorised collaborators.
        </p>
        <p>
          You do <strong>not</strong> grant us a license to train shared AI models on your
          private content. Per-account fine-tuning is opt-in and clearly labelled.
        </p>

        <h2>5. AI outputs</h2>
        <p>
          Anker uses AI to draft text, generate matches, and synthesise reports. AI outputs are
          probabilistic — verify before sending or publishing. You're responsible for any
          content you publish or send via Anker, including AI-assisted drafts. We're not
          liable for decisions you make based on AI outputs.
        </p>

        <h2>6. Payments</h2>
        <p>
          Paid tiers are billed monthly or annually in advance. Failed payments after a grace
          period result in downgrade to the free tier. You can cancel at any time; we don't
          refund partial months. Disputes: email <a href="mailto:billing@an-ker.de">billing@an-ker.de</a>{" "}
          before initiating a chargeback so we can resolve.
        </p>

        <h2>7. Service availability</h2>
        <p>
          We aim for high uptime but don't promise it. Some operations (AI drafting, large
          file uploads, web crawling) can fail transiently. We're not liable for losses caused
          by downtime, slow responses, or third-party provider outages.
        </p>

        <h2>8. Third-party integrations</h2>
        <p>
          Anker integrates with third-party services (Supabase, Vercel, Anthropic, OpenAI,
          Google, Alibaba, Resend, Vercel Blob, news APIs, others). Their terms apply to your
          use of those services. We're not responsible for their availability, behaviour, or
          data practices.
        </p>

        <h2>9. Termination</h2>
        <p>
          You can terminate your account at any time from Settings. We can terminate yours
          for material breach or for legal reasons; we'll notify you and give you a reasonable
          window to export your data unless legally prohibited.
        </p>

        <h2>10. Disclaimer</h2>
        <p>
          The platform is provided "as is." We disclaim all warranties to the maximum extent
          permitted by law. Nothing in Anker is financial, legal, or investment advice.
        </p>

        <h2>11. Limitation of liability</h2>
        <p>
          To the extent permitted by law, Anker's aggregate liability under these terms is
          limited to the greater of (a) what you paid us in the 12 months before the claim or
          (b) €100. We're not liable for indirect, consequential, or punitive damages.
        </p>

        <h2>12. Governing law</h2>
        <p>
          These terms are governed by the laws of Germany. Disputes will be brought in the
          courts of Berlin. EU consumers retain mandatory rights under their local laws.
        </p>

        <h2>13. Changes</h2>
        <p>
          We may update these terms. Material changes will be announced via email at least 30
          days before they take effect. Continued use of the platform after the effective
          date counts as acceptance.
        </p>

        <h2>14. Contact</h2>
        <p>
          Legal questions: <a href="mailto:legal@an-ker.de">legal@an-ker.de</a>. Privacy
          questions: see the <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </article>

      <FooterSection />
    </main>
  )
}
