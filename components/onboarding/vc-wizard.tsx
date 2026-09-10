"use client"

import { Wizard, type WizardStep } from "./wizard"
import { Field, Text, Area, Chips, Choices } from "./fields"
import s from "./onboarding.module.css"

const THESES = ["AI/ML", "Fintech", "Health", "Climate", "SaaS", "Consumer", "Deep Tech", "Infra", "Frontier"]
const LP_TYPES = ["Institutional", "Family office", "Fund of funds", "Endowment", "HNWI", "Corporate"]

const steps: WizardStep[] = [
  {
    key: "you",
    eyebrow: "Introduce yourself",
    title: "Your profile",
    sub: "Introduce yourself and your role. You can update these details as your team grows.",
    valid: (d) => !!d.name?.trim(),
    validationMessage: "Enter your full name before continuing.",
    render: (d, set) => (
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Full name" required>
          <Text value={d.name || ""} onChange={(v) => set("name", v)} placeholder="Your full name" autoComplete="name" />
        </Field>
        <Field label="Title">
          <Choices
            value={d.title || ""}
            onChange={(v) => set("title", v)}
            options={[
              { value: "gp", title: "General Partner" },
              { value: "principal", title: "Principal" },
              { value: "analyst", title: "Analyst" },
              { value: "platform", title: "Platform / IR" },
            ]}
          />
        </Field>
        <Field label="LinkedIn">
          <Text value={d.linkedin || ""} onChange={(v) => set("linkedin", v)} placeholder="linkedin.com/in/…" />
        </Field>
      </div>
    ),
  },
  {
    key: "fund",
    eyebrow: "Your fund",
    title: "Your fund",
    sub: "Name the fund or firm you’re setting up. Add investment parameters now, or refine them later.",
    valid: (d) => !!d.firm?.trim(),
    validationMessage: "Enter your firm or fund name before continuing.",
    render: (d, set) => (
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Firm / fund name" required>
          <Text value={d.firm || ""} onChange={(v) => set("firm", v)} placeholder="Aurora Ventures I" />
        </Field>
        <Field label="Website">
          <Text value={d.website || ""} onChange={(v) => set("website", v)} placeholder="aurora.vc" />
        </Field>
        <Field label="Vintage">
          <Text value={d.vintage || ""} onChange={(v) => set("vintage", v)} placeholder="2026" />
        </Field>
        <Field label="Target size" hint="Include a currency. This is a setup note; configure the fund’s reporting currency in fund settings.">
          <Text value={d.size || ""} onChange={(v) => set("size", v)} placeholder="$50M" />
        </Field>
        <Field label="Check size — min">
          <Text value={d.checkMin || ""} onChange={(v) => set("checkMin", v)} placeholder="$250k" />
        </Field>
        <Field label="Check size — max">
          <Text value={d.checkMax || ""} onChange={(v) => set("checkMax", v)} placeholder="$2M" />
        </Field>
      </div>
    ),
  },
  {
    key: "mandate",
    eyebrow: "Your mandate",
    title: "Your investment focus",
    sub: "Select the sectors you invest in and describe your focus. These details become part of your profile.",
    valid: (d) => (d.theses || []).length > 0,
    validationMessage: "Choose at least one investment sector before continuing.",
    render: (d, set) => (
      <>
        <Field label="Investment sectors" required hint="Select all that apply.">
          <Chips options={THESES} value={d.theses || []} onChange={(v) => set("theses", v)} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Stage focus">
            <Text value={d.stageFocus || ""} onChange={(v) => set("stageFocus", v)} placeholder="Pre-seed → Series A" />
          </Field>
          <Field label="Geography">
            <Text value={d.geo || ""} onChange={(v) => set("geo", v)} placeholder="Europe, US" />
          </Field>
        </div>
        <Field label="Thesis notes" hint="Describe your investment approach for your profile.">
          <Area value={d.notes || ""} onChange={(v) => set("notes", v)} placeholder="We back technical founders building…" />
        </Field>
      </>
    ),
  },
  {
    key: "lps",
    eyebrow: "Optional",
    title: "Your LP relationships",
    sub: "Note the types of limited partners you work with. Individual LP records can be added from your fund workspace after setup.",
    optional: true,
    render: (d, set) => (
      <>
        <Field label="LP types">
          <Chips options={LP_TYPES} value={d.lpTypes || []} onChange={(v) => set("lpTypes", v)} />
        </Field>
        <p className={s.notice}>These selections are saved with your setup notes. Add LP records and commitments in fund operations once your workspace is ready. No invitations are sent during setup.</p>
      </>
    ),
  },
]

export function VcWizard() {
  return <Wizard persona="vc" steps={steps} />
}
