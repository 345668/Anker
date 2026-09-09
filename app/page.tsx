import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { EditorialPlatform } from "@/components/landing/editorial-platform";
import e from "@/components/landing/editorial.module.css";
import s from "@/components/landing/home-editorial.module.css";

export const metadata = {
  title: "Anker | The next interface for venture",
  description:
    "An AI-native operating system connecting fundraising, investor relationships, deal flow, fund operations, and LP reporting.",
  alternates: { canonical: "https://www.an-ker.de" },
  openGraph: {
    title: "Anker | The next interface for venture",
    description:
      "Founders, funds, and limited partners. One connected capital lifecycle.",
    url: "https://www.an-ker.de",
    type: "website",
  },
};
const audiences = [
  {
    label: "For founders",
    title: "Build your next chapter.",
    description:
      "Find relevant investors, prepare your raise, and manage the conversations that move it forward.",
    href: "/solutions/founders",
  },
  {
    label: "For venture funds",
    title: "See the whole picture.",
    description:
      "Connect deal flow, fund operations, and investor relationships in one working environment.",
    href: "/solutions/vcs",
  },
  {
    label: "For limited partners",
    title: "Stay close to your capital.",
    description:
      "Access fund information, capital activity, and the documents behind your investments.",
    href: "/solutions/lps",
  },
];
export default function Home() {
  return (
    <main id="main-content" className={`marketing-light ${e.page}`}>
      <Navigation />
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <span className={e.eyebrow}>The next interface for venture</span>
          <h1>
            Connect capital.
            <br />
            <em>Build what’s next.</em>
          </h1>
          <p>
            Anker brings intelligence, relationships, and operations together
            for the people building and backing companies.
          </p>
          <div className={e.actions}>
            <Link href="/contact" className={e.button}>
              Explore Anker with us
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href="#platform" className={e.textLink}>
              Discover the platform
            </a>
          </div>
        </div>
        <Image
          src="/editorial/convergence.webp"
          alt="Silver architectural spans converge toward an open horizon."
          width={1536}
          height={1024}
          priority
          sizes="(max-width: 767px) 100vw, 50vw"
          className={s.heroArt}
        />
      </section>
      <section className={e.container} aria-label="Who Anker serves">
        <div className={s.audiences}>
          {audiences.map((a) => (
            <Link key={a.href} href={a.href} className={s.audience}>
              <span>{a.label}</span>
              <h2>{a.title}</h2>
              <p>{a.description}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className={e.section}>
        <div className={e.container}>
          <div className={e.sectionHeading}>
            <div>
              <span className={e.eyebrow}>Our perspective</span>
              <h2>
                Venture works through relationships.
                <br />
                Its tools should, too.
              </h2>
            </div>
          </div>
          <div className={e.grid}>
            {[
              [
                "Intelligence in context",
                "Bring investor discovery and AI-assisted research into the same environment as your pipeline and relationships.",
                "/products/discover",
              ],
              [
                "Continuity from start to scale",
                "Keep the work connected as a founder’s raise becomes a fund’s investment and an LP’s portfolio.",
                "/products/fund-os",
              ],
              [
                "Your judgment, supported",
                "Use AI to prepare, organize, and analyze. Keep the decisions that matter with the people accountable for them.",
                "/vision",
              ],
            ].map(([title, description, href], i) => (
              <div key={title} className={e.card}>
                <span className={e.number}>0{i + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <Link href={href} className={e.textLink}>
                  Explore
                  <ArrowRight size={16} aria-hidden="true" />
                  <span className="sr-only"> {title}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
      <EditorialPlatform />
      <section className={e.section}>
        <div className={`${e.container} ${e.split}`}>
          <div>
            <Image
              src="/editorial/perspective.webp"
              alt="Layered glass and silver architecture frame a distant blue horizon."
              width={1536}
              height={1024}
              sizes="(max-width: 767px) 100vw, 50vw"
              className={e.art}
            />
            <h2 className={s.resourceLead}>
              A clearer perspective
              <br />
              on private capital.
            </h2>
            <p className={e.sectionIntro}>
              Ideas, analysis, and practical resources for the decisions ahead.
            </p>
            <Link href="/newsroom" className={e.textLink}>
              Visit the newsroom
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div>
            <span className={e.eyebrow}>Insights & resources</span>
            <div className={s.resourceLinks}>
              <Link href="/fundraising-guide">
                <h3>Prepare for the conversations that count.</h3>
                <p>
                  A fundraising guide to your narrative, investor shortlist,
                  diligence, and the close.
                </p>
              </Link>
              <Link href="/pitch-deck-templates">
                <h3>Make your investment case clear.</h3>
                <p>
                  Pitch deck structures and guidance to turn your company’s
                  story into a focused discussion.
                </p>
              </Link>
              <Link href="/newsroom/anker-plugins-for-claude">
                <h3>Anker, in your AI workflow.</h3>
                <p>
                  Explore Anker Plugins for Claude and the next step in
                  connected private-capital operations.
                </p>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.silver}`}>
        <div className={`${e.container} ${e.split}`}>
          <div>
            <span className={e.eyebrow}>Built around your work</span>
            <h2>
              Your relationships.
              <br />
              Your data. Your AI.
            </h2>
          </div>
          <div>
            <p className={e.sectionIntro}>
              Bring your own AI provider and connect intelligence to the work
              already happening across your organization. Anker brings research,
              outreach, and fund operations into one place.
            </p>
            <div className={e.actions}>
              <Link href="/security" className={e.textLink}>
                Security at Anker
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/products/outreach" className={e.textLink}>
                Connected outreach
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className={e.cta}>
        <div className={e.container}>
          <h2>
            What could your team
            <br />
            build with a clearer view?
          </h2>
          <Link href="/contact" className={e.button}>
            Let’s talk
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <FooterSection />
    </main>
  );
}
