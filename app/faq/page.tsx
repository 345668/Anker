import Link from "next/link";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import {
  EditorialHero,
  EditorialCta,
} from "@/components/landing/editorial-page";
import e from "@/components/landing/editorial.module.css";
export const metadata = {
  title: "Frequently asked questions | Anker",
  description:
    "Answers about Anker for founders, funds, and LPs, including platform access and AI providers.",
};
const categories = [
  {
    id: "founders",
    label: "For founders",
    questions: [
      [
        "How does Anker support a fundraise?",
        "Anker brings investor discovery, outreach, your raise pipeline, cap table, and data room into one workspace. The Founder Suite connects these activities so you can keep the context behind each investor conversation.",
      ],
      [
        "Can I submit my startup without an account?",
        "Yes. The public Pitch us form lets you share your company details and deck. Review the participation terms on that form before submitting. You receive a reference to track your submission.",
      ],
      [
        "Does using Anker guarantee funding?",
        "No. Anker supports the fundraising process. Investor interest, diligence, terms, and funding decisions remain with the participants.",
      ],
    ],
  },
  {
    id: "investors",
    label: "For funds & LPs",
    questions: [
      [
        "What can venture funds manage in Anker?",
        "Fund workflows include deal flow and investment committee materials, LP relationships, investments, valuations, capital calls, distributions, and reporting. Explore the Venture Funds page for the full workflow.",
      ],
      [
        "What is the Investor Room?",
        "The Investor Room gives limited partners access to their fund information, capital activity, and documents, subject to the access provided by their fund.",
      ],
      [
        "Is Anker a fund or a software platform?",
        "Anker is an AI-native operating system for private capital. The website describes software workflows for founders, funds, and LPs; using the platform is not an investment in a fund.",
      ],
    ],
  },
  {
    id: "platform",
    label: "The platform",
    questions: [
      [
        "Can I use my own AI provider?",
        "Anker supports a bring-your-own-provider approach. Your configured provider is used for supported AI workflows. Contact us to discuss the models and setup your organization needs.",
      ],
      [
        "How is my information handled?",
        "Access, data handling, and processing are described on the Security and Privacy pages. Review those pages before sharing sensitive information, and contact us with requirements specific to your organization.",
      ],
      [
        "Where can I follow product changes?",
        "The changelog records product features, improvements, and fixes. The newsroom covers announcements and perspectives on venture and private capital.",
      ],
    ],
  },
  {
    id: "general",
    label: "Getting started",
    questions: [
      [
        "How do I get access?",
        "Registration is currently by invitation. Request early access or contact Anker to discuss your workflow. Existing users can sign in from the website navigation.",
      ],
      [
        "Can I discuss Anker with someone first?",
        "Yes. Use the contact form to tell us about your role, your company or fund, and the work you want to bring into Anker.",
      ],
      [
        "Where is Anker based?",
        "Anker is based in Berlin, Germany, and is being built for the private-capital lifecycle across founders, venture funds, and limited partners.",
      ],
    ],
  },
];
export default function FaqPage() {
  return (
    <main id="main-content" className={`marketing-light ${e.page}`}>
      <Navigation />
      <EditorialHero
        eyebrow="Questions & answers"
        title="A clearer place to start."
        description="Explore how Anker fits your work, from a founder’s first raise to fund operations and LP reporting."
      />
      <section className={e.section}>
        <div className={e.container}>
          <div className="grid lg:grid-cols-[220px_minmax(0,760px)] gap-12 lg:gap-20 justify-center">
            <nav aria-label="Question categories">
              <ul className="lg:sticky lg:top-36 border-t-2 border-foreground pt-4">
                {categories.map((category) => (
                  <li key={category.id}>
                    <a
                      href={`#${category.id}`}
                      className="block py-3 text-base text-muted-foreground hover:text-foreground"
                    >
                      {category.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div>
              {categories.map((category) => (
                <section
                  key={category.id}
                  id={category.id}
                  className="mb-14 scroll-mt-36"
                >
                  <h2 className="!text-3xl mb-8">{category.label}</h2>
                  {category.questions.map(([question, answer]) => (
                    <details
                      key={question}
                      className="border-t border-foreground/20 py-5 group"
                    >
                      <summary className="cursor-pointer text-lg font-medium pr-5 leading-relaxed">
                        {question}
                      </summary>
                      <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                        {answer}
                      </p>
                    </details>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className={`${e.section} ${e.silver}`}>
        <div className={e.container}>
          <div className={e.grid}>
            {[
              ["Request access", "/early-access"],
              ["Privacy policy", "/privacy"],
              ["Security at Anker", "/security"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="font-serif text-2xl underline underline-offset-4 py-4"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <EditorialCta title="Still have a question?" label="Contact Anker" />
      <FooterSection />
    </main>
  );
}
