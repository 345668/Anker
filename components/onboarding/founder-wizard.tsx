"use client"

import { Wizard, type WizardStep } from "./wizard"
import { Field, Text, Area, Chips, Choices, Drop } from "./fields"

const SECTORS = ["AI/ML", "Fintech", "Health", "Climate", "SaaS", "Consumer", "Deep Tech", "Marketplace", "Dev Tools"]

const steps: WizardStep[] = [
  {
    key: "you",
    order: "Order — Introduce yourself",
    title: "You",
    serif: "Every soul has a name. Start with yours.",
    valid: (d) => !!d.name?.trim(),
    render: (d, set) => (
      <div className="ob-grid two">
        <Field label="Full name" required>
          <Text value={d.name || ""} onChange={(v) => set("name", v)} placeholder="Ada Founder" />
        </Field>
        <Field label="Title">
          <Text value={d.title || ""} onChange={(v) => set("title", v)} placeholder="CEO & Co-founder" />
        </Field>
        <Field label="LinkedIn" hint="Powers your warm-intro network.">
          <Text value={d.linkedin || ""} onChange={(v) => set("linkedin", v)} placeholder="linkedin.com/in/…" />
        </Field>
        <Field label="Work email">
          <Text value={d.email || ""} onChange={(v) => set("email", v)} placeholder="ada@startup.com" type="email" />
        </Field>
      </div>
    ),
  },
  {
    key: "company",
    order: "Order — Name your company",
    title: "Your Company",
    serif: "The vessel you're raising for.",
    valid: (d) => !!d.company?.trim(),
    render: (d, set) => (
      <>
        <Drop
          fileName={d.deck || ""}
          onFile={(n) => set("deck", n)}
          title="Upload your deck to auto-fill"
          sub="PDF · we read it and pre-fill the fields below (you review)"
        />
        <div className="ob-grid two">
          <Field label="Company name" required>
            <Text value={d.company || ""} onChange={(v) => set("company", v)} placeholder="Northstar Labs" />
          </Field>
          <Field label="Website">
            <Text value={d.website || ""} onChange={(v) => set("website", v)} placeholder="northstar.com" />
          </Field>
        </div>
        <Field label="Stage">
          <Choices
            value={d.stage || ""}
            onChange={(v) => set("stage", v)}
            options={[
              { value: "idea", title: "Idea / building" },
              { value: "pre-seed", title: "Pre-seed" },
              { value: "seed", title: "Seed" },
              { value: "a", title: "Series A+" },
            ]}
          />
        </Field>
        <Field label="Sectors">
          <Chips options={SECTORS} value={d.sectors || []} onChange={(v) => set("sectors", v)} />
        </Field>
        <Field label="One-liner">
          <Area value={d.oneliner || ""} onChange={(v) => set("oneliner", v)} placeholder="We help X do Y so that Z." />
        </Field>
      </>
    ),
  },
  {
    key: "raise",
    order: "Order — Define the raise",
    title: "The Raise",
    serif: "How much, and on what terms.",
    valid: (d) => !!d.target,
    render: (d, set) => (
      <>
        <div className="ob-grid two">
          <Field label="Target amount" required>
            <Text value={d.target || ""} onChange={(v) => set("target", v)} placeholder="$1,500,000" />
          </Field>
          <Field label="Timeline">
            <Text value={d.timeline || ""} onChange={(v) => set("timeline", v)} placeholder="Close in 3 months" />
          </Field>
        </div>
        <Field label="Instrument">
          <Choices
            value={d.instrument || ""}
            onChange={(v) => set("instrument", v)}
            options={[
              { value: "safe", title: "SAFE", desc: "Post-money, fast to close." },
              { value: "priced", title: "Priced round", desc: "Equity with a set valuation." },
              { value: "note", title: "Convertible note" },
            ]}
          />
        </Field>
        <Field label="Use of funds" hint="Seeds your Runway plan.">
          <Area value={d.use || ""} onChange={(v) => set("use", v)} placeholder="Hire 3 engineers, extend runway to 24mo, ship v2…" />
        </Field>
      </>
    ),
  },
  {
    key: "assets",
    order: "Real Moment — Arm your raise",
    title: "Assets",
    serif: "Optional — you can add these later.",
    optional: true,
    render: (d, set) => (
      <>
        <Field label="Pitch deck">
          <Drop fileName={d.deck2 || ""} onFile={(n) => set("deck2", n)} title="Drop your deck" sub="Used by the deck analyzer + investor matching" />
        </Field>
        <Field label="Data room" hint="We scaffold a starter data room you fill later.">
          <Choices
            value={d.dataroom || ""}
            onChange={(v) => set("dataroom", v)}
            options={[
              { value: "create", title: "Create a starter data room", desc: "Financials, cap table, metrics folders." },
              { value: "skip", title: "Skip for now" },
            ]}
          />
        </Field>
      </>
    ),
  },
]

export function FounderWizard() {
  return <Wizard persona="founder" steps={steps} />
}
