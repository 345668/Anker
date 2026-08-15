import Link from "next/link"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Privacy Policy — Anker",
  description: "How Anker collects, uses, and protects personal information.",
}

const LAST_UPDATED = "June 22, 2026"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      <section className="border-b border-foreground/10">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Legal · Last updated {LAST_UPDATED}
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">Privacy Policy</h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground leading-relaxed">
            This policy explains what we collect, why we collect it, and what choices you have.
            It applies to Anker's website, dashboard, and any related services.
          </p>
        </div>
      </section>

      <article className="article-body max-w-3xl mx-auto px-6 lg:px-12 py-16 lg:py-20 text-foreground leading-[1.7]">
        <h2>1. Who we are</h2>
        <p>
          Anker AI ("Anker", "we", "us") operates the venture platform at an-ker.de. For the
          purposes of GDPR and equivalent data protection laws, Anker AI is the data controller
          for personal information processed through the platform. Contact:{" "}
          <a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>.
        </p>

        <h2>2. What we collect</h2>
        <p>We collect three categories of information:</p>
        <ul>
          <li>
            <strong>Account data</strong> — name, email, organisation, role, password hash.
            Required to give you an account.
          </li>
          <li>
            <strong>Content you upload</strong> — pitch decks, company profiles, LP letters,
            investor lists, contacts, files in the data room. Used to deliver the features you
            asked for.
          </li>
          <li>
            <strong>Usage data</strong> — pages viewed, features used, timestamps, IP address,
            browser type. Used to keep the platform reliable and to improve it.
          </li>
        </ul>

        <h2>3. How we use it</h2>
        <ul>
          <li>To provide the features you request (matching, drafting, reporting)</li>
          <li>To send service emails (account, billing, security)</li>
          <li>To send product update emails — opt-out at any time</li>
          <li>To keep the platform secure (rate-limiting, anomaly detection)</li>
          <li>To comply with legal obligations (tax, accounting, lawful requests)</li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal data. We do not show third-party ads. We do
          not train shared AI models on your private content.
        </p>

        <h2>4. AI processing</h2>
        <p>
          Some features use AI providers (Anthropic, OpenAI, Google, Alibaba Cloud, and local
          models). When you use one of those features, the relevant content is sent to the
          configured provider for processing. We choose providers that contractually agree not
          to train models on customer prompts. You can see and override the active provider in
          Settings → API Keys.
        </p>

        <h2>5. Sharing</h2>
        <p>We share personal data only with:</p>
        <ul>
          <li>Service providers that process data on our behalf (hosting, email delivery, error logging) under a contract that restricts their use to providing the service</li>
          <li>Authorities when legally compelled (warrant, court order) — we'll notify you unless prohibited</li>
          <li>An acquirer in a merger or asset sale — we'll notify you in advance with the right to delete</li>
        </ul>

        <h2>6. International transfers</h2>
        <p>
          Anker is operated from the EU. Some sub-processors (e.g. our AI providers) are
          located in the United States or other jurisdictions. We rely on Standard Contractual
          Clauses and equivalent safeguards where required.
        </p>

        <h2>7. Retention</h2>
        <p>
          We keep account data for as long as your account is active, and for up to 12 months
          after closure unless we're legally required to keep it longer (e.g. tax records, 10
          years). You can request deletion of specific records at any time — see Your Rights below.
        </p>

        <h2>8. Your rights</h2>
        <p>Under GDPR and equivalent laws you have the right to:</p>
        <ul>
          <li>Access — a copy of your data</li>
          <li>Rectification — correct inaccurate data</li>
          <li>Erasure — delete data we don't have a legal basis to keep</li>
          <li>Portability — get your data in a portable format</li>
          <li>Objection / restriction — to specific processing activities</li>
          <li>Lodge a complaint with a supervisory authority</li>
        </ul>
        <p>
          To exercise any of these, email <a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>. We'll
          respond within 30 days.
        </p>

        <h2>9. Cookies and tracking</h2>
        <p>
          When you first visit, we ask for your consent before setting any non-essential cookie.
          You can accept all, reject non-essential, or choose per category. We group cookies into
          three categories:
        </p>
        <ul>
          <li>
            <strong>Strictly necessary</strong> — session, authentication, security (CSRF), and
            remembering your cookie choice. Always on; the site can't run without them, so they
            need no consent.
          </li>
          <li>
            <strong>Functional</strong> — remember preferences such as theme, language, and saved
            views. Off unless you allow them.
          </li>
          <li>
            <strong>Analytical</strong> — aggregate, privacy-preserving usage measurement
            (Vercel Analytics). No advertising and no cross-site tracking. Off unless you allow them.
          </li>
        </ul>
        <p>
          You can change or withdraw your choice at any time via the{" "}
          <strong>Cookie settings</strong> link in the footer, or by clearing cookies in your
          browser. We re-ask for consent at least every 12 months and whenever this policy
          materially changes.
        </p>

        <h2>10. Security</h2>
        <p>
          We follow the practices described on our <Link href="/security" className="underline">Security</Link>{" "}
          page — encryption in transit and at rest, least-privilege access, audit logs, and
          regular security review. No system is perfect; if we discover a breach affecting
          your data we'll notify you within 72 hours.
        </p>

        <h2>11. Children</h2>
        <p>
          Anker is for business use. We don't knowingly collect data from anyone under 16. If
          you believe a child has signed up, email us and we'll remove the account.
        </p>

        <h2>12. Changes to this policy</h2>
        <p>
          When we make material changes we'll update the "Last updated" date at the top and
          notify active users via email. Material changes that expand our use of your data
          will require your renewed consent before taking effect.
        </p>

        <h2>13. Contact</h2>
        <p>
          Privacy questions, data requests, or complaints:{" "}
          <a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>.
        </p>
      </article>

      <FooterSection />
    </main>
  )
}
