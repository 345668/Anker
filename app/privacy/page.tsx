import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { PrivacyActions } from "@/components/legal/privacy-actions";
import s from "@/components/landing/publication-pages.module.css";

export const metadata = {
  title: "Privacy Policy — Anker",
  description: "How Anker collects, uses, and protects personal information. Read the policy and manage your privacy choices.",
  alternates: { canonical: "https://www.an-ker.de/privacy" },
};

const sections = [
  { number: "01", title: "Who we are", id: "who-we-are" },
  { number: "02", title: "What we collect", id: "what-we-collect" },
  { number: "03", title: "How we use it", id: "how-we-use-it" },
  { number: "04", title: "AI processing", id: "ai-processing" },
  { number: "05", title: "Sharing", id: "sharing" },
  { number: "06", title: "International transfers", id: "international-transfers" },
  { number: "07", title: "Retention", id: "retention" },
  { number: "08", title: "Your rights", id: "your-rights" },
  { number: "09", title: "Cookies and tracking", id: "cookies-and-tracking" },
  { number: "10", title: "Security", id: "security" },
  { number: "11", title: "Children", id: "children" },
  { number: "12", title: "Changes to this policy", id: "changes-to-this-policy" },
  { number: "13", title: "Contact", id: "contact" },
 ];
function Contents() {
  return <ol className={s.contentsList}>{sections.map(section => <li key={section.id}>
    <a href={`#${section.id}`}><span aria-hidden="true">{section.number}</span>{section.title}</a>
  </li>)}</ol>;
}
export default function PrivacyPage() {
  return <main id="main-content" className={`marketing-site ${s.page}`}>
    <div className={s.siteChrome}><Navigation /></div>
    <header className={s.hero} id="policy-top"><div className={s.container}>
      <nav aria-label="Breadcrumb" className={s.breadcrumb}><Link href="/">Anker</Link><span aria-hidden="true">/</span><span>Legal</span></nav>
      <div className={s.heroGrid}>
        <div><p className={s.eyebrow}>Privacy &amp; data protection</p><h1>Privacy policy</h1>
          <p className={s.intro}>How we collect, use and protect personal information across the Anker website, platform and related services.</p>
        </div>
        <dl className={s.metadata}>
          <div><dt>Last updated</dt><dd><time dateTime="2026-06-22">22 June 2026</time></dd></div>
          <div><dt>Privacy enquiries</dt><dd><a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a></dd></div>
          <div><dt>Related documents</dt><dd><Link href="/terms">Terms of service</Link><span aria-hidden="true"> · </span><Link href="/security">Security</Link></dd></div>
        </dl>
      </div><PrivacyActions className={s.actions} />
    </div></header>
    <div className={`${s.container} ${s.documentGrid}`}>
      <aside className={s.sidebar}>
        <nav aria-label="Policy sections" className={s.desktopContents}><p className={s.eyebrow}>On this page</p><Contents /></nav>
        <details className={s.mobileContents}><summary>Browse policy sections <span aria-hidden="true">↓</span></summary><nav aria-label="Policy sections"><Contents /></nav></details>
      </aside>
      <article className={s.legalBody} aria-label="Privacy policy">
<section id="who-we-are" aria-labelledby="who-we-are-heading"><h2 id="who-we-are-heading"><span aria-hidden="true">01</span>Who we are</h2>

        <p>
          Anker AI ("Anker", "we", "us") operates the venture platform at
          an-ker.de. For the purposes of GDPR and equivalent data protection
          laws, Anker AI is the data controller for personal information
          processed through the platform. Contact:{" "}
          <a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>.
        </p>
</section>
<section id="what-we-collect" aria-labelledby="what-we-collect-heading"><h2 id="what-we-collect-heading"><span aria-hidden="true">02</span>What we collect</h2>

        <p>We collect three categories of information:</p>
        <ul>
          <li>
            <strong>Account data</strong> — name, email, organisation, role,
            password hash. Required to give you an account.
          </li>
          <li>
            <strong>Content you upload</strong> — pitch decks, company profiles,
            LP letters, investor lists, contacts, files in the data room. Used
            to deliver the features you asked for.
          </li>
          <li>
            <strong>Usage data</strong> — pages viewed, features used,
            timestamps, IP address, browser type. Used to keep the platform
            reliable and to improve it.
          </li>
        </ul>
</section>
<section id="how-we-use-it" aria-labelledby="how-we-use-it-heading"><h2 id="how-we-use-it-heading"><span aria-hidden="true">03</span>How we use it</h2>

        <ul>
          <li>
            To provide the features you request (matching, drafting, reporting)
          </li>
          <li>To send service emails (account, billing, security)</li>
          <li>To send product update emails — opt-out at any time</li>
          <li>
            To keep the platform secure (rate-limiting, anomaly detection)
          </li>
          <li>
            To comply with legal obligations (tax, accounting, lawful requests)
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal data. We do not show
          third-party ads. We do not train shared AI models on your private
          content.
        </p>
</section>
<section id="ai-processing" aria-labelledby="ai-processing-heading"><h2 id="ai-processing-heading"><span aria-hidden="true">04</span>AI processing</h2>

        <p>
          Some features use AI providers (Anthropic, OpenAI, Google, Alibaba
          Cloud, and local models). When you use one of those features, the
          relevant content is sent to the configured provider for processing. We
          choose providers that contractually agree not to train models on
          customer prompts. You can see and override the active provider in
          Settings → API Keys.
        </p>
</section>
<section id="sharing" aria-labelledby="sharing-heading"><h2 id="sharing-heading"><span aria-hidden="true">05</span>Sharing</h2>

        <p>We share personal data only with:</p>
        <ul>
          <li>
            Service providers that process data on our behalf (hosting, email
            delivery, error logging) under a contract that restricts their use
            to providing the service
          </li>
          <li>
            Authorities when legally compelled (warrant, court order) — we'll
            notify you unless prohibited
          </li>
          <li>
            An acquirer in a merger or asset sale — we'll notify you in advance
            with the right to delete
          </li>
        </ul>
</section>
<section id="international-transfers" aria-labelledby="international-transfers-heading"><h2 id="international-transfers-heading"><span aria-hidden="true">06</span>International transfers</h2>

        <p>
          Anker is operated from the EU. Some sub-processors (e.g. our AI
          providers) are located in the United States or other jurisdictions. We
          rely on Standard Contractual Clauses and equivalent safeguards where
          required.
        </p>
</section>
<section id="retention" aria-labelledby="retention-heading"><h2 id="retention-heading"><span aria-hidden="true">07</span>Retention</h2>

        <p>
          We keep account data for as long as your account is active, and for up
          to 12 months after closure unless we're legally required to keep it
          longer (e.g. tax records, 10 years). You can request deletion of
          specific records at any time — see Your Rights below.
        </p>
</section>
<section id="your-rights" aria-labelledby="your-rights-heading"><h2 id="your-rights-heading"><span aria-hidden="true">08</span>Your rights</h2>

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
          To exercise any of these, email{" "}
          <a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>. We'll
          respond within 30 days.
        </p>
</section>
<section id="cookies-and-tracking" aria-labelledby="cookies-and-tracking-heading"><h2 id="cookies-and-tracking-heading"><span aria-hidden="true">09</span>Cookies and tracking</h2>

        <p>
          When you first visit, we ask for your consent before setting any
          non-essential cookie. You can accept all, reject non-essential, or
          choose per category. We group cookies into three categories:
        </p>
        <ul>
          <li>
            <strong>Strictly necessary</strong> — session, authentication,
            security (CSRF), and remembering your cookie choice. Always on; the
            site can't run without them, so they need no consent.
          </li>
          <li>
            <strong>Functional</strong> — remember preferences such as theme,
            language, and saved views. Off unless you allow them.
          </li>
          <li>
            <strong>Analytical</strong> — aggregate, privacy-preserving usage
            measurement (Vercel Analytics). No advertising and no cross-site
            tracking. Off unless you allow them.
          </li>
        </ul>
        <p>
          You can change or withdraw your choice at any time via the{" "}
          <strong>Cookie settings</strong> link in the footer, or by clearing
          cookies in your browser. We re-ask for consent at least every 12
          months and whenever this policy materially changes.
        </p>
</section>
<section id="security" aria-labelledby="security-heading"><h2 id="security-heading"><span aria-hidden="true">10</span>Security</h2>

        <p>
          We follow the practices described on our{" "}
          <Link href="/security" className="underline">
            Security
          </Link>{" "}
          page — encryption in transit and at rest, least-privilege access,
          audit logs, and regular security review. No system is perfect; if we
          discover a breach affecting your data we'll notify you within 72
          hours.
        </p>
</section>
<section id="children" aria-labelledby="children-heading"><h2 id="children-heading"><span aria-hidden="true">11</span>Children</h2>

        <p>
          Anker is for business use. We don't knowingly collect data from anyone
          under 16. If you believe a child has signed up, email us and we'll
          remove the account.
        </p>
</section>
<section id="changes-to-this-policy" aria-labelledby="changes-to-this-policy-heading"><h2 id="changes-to-this-policy-heading"><span aria-hidden="true">12</span>Changes to this policy</h2>

        <p>
          When we make material changes we'll update the "Last updated" date at
          the top and notify active users via email. Material changes that
          expand our use of your data will require your renewed consent before
          taking effect.
        </p>
</section>
<section id="contact" aria-labelledby="contact-heading"><h2 id="contact-heading"><span aria-hidden="true">13</span>Contact</h2>

        <p>
          Privacy questions, data requests, or complaints:{" "}
          <a href="mailto:privacy@an-ker.de">privacy@an-ker.de</a>.
        </p>

</section>
        <a href="#policy-top" className={s.backToTop}>Back to top ↑</a>
      </article>
    </div>
    <div className={s.siteChrome}><FooterSection /></div>
  </main>;
}
