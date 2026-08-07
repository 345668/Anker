"use client"

import { Wizard, type WizardStep } from "./wizard"
import { Field, Text, Area, Chips, Choices } from "./fields"

const THESES = ["AI/ML", "Fintech", "Health", "Climate", "SaaS", "Consumer", "Deep Tech", "Infra", "Frontier"]
const LP_TYPES = ["Institutional", "Family office", "Fund of funds", "Endowment", "HNWI", "Corporate"]

const steps: WizardStep[] = [
  {
    key: "you",
    order: "Order — Introduce yourself",
    title: "You",
    serif: "The allocator behind the fund.",
    valid: (d) => !!d.name?.trim(),
    render: (d, set) => (
      <div className="ob-grid two">
        <Field label="Full name" required>
          <Text value={d.name || ""} onChange={(v) => set("name", v)} placeholder="Rin Partner" />
        </Field>
        <Field label="Title">
          <Choices
            accent="c"
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
    order: "Order — Establish the fund",
    title: "Your Fund",
    serif: "The vehicle you deploy from.",
    valid: (d) => !!d.firm?.trim(),
    render: (d, set) => (
      <>
        <div className="ob-grid two">
          <Field label="Firm / fund name" required>
            <Text value={d.firm || ""} onChange={(v) => set("firm", v)} placeholder="Aurora Ventures I" />
          </Field>
          <Field label="Website">
            <Text value={d.website || ""} onChange={(v) => set("website", v)} placeholder="aurora.vc" />
          </Field>
          <Field label="Vintage">
            <Text value={d.vintage || ""} onChange={(v) => set("vintage", v)} placeholder="2026" />
          </Field>
          <Field label="Target size">
            <Text value={d.size || ""} onChange={(v) => set("size", v)} placeholder="$50M" />
          </Field>
          <Field label="Check size — min">
            <Text value={d.checkMin || ""} onChange={(v) => set("checkMin", v)} placeholder="$250k" />
          </Field>
          <Field label="Check size — max">
            <Text value={d.checkMax || ""} onChange={(v) => set("checkMax", v)} placeholder="$2M" />
          </Field>
        </div>
      </>
    ),
  },
  {
    key: "mandate",
    order: "Order — Set your mandate",
    title: "Mandate",
    serif: "This powers deal sourcing and matching.",
    valid: (d) => (d.theses || []).length > 0,
    render: (d, set) => (
      <>
        <Field label="Thesis — sectors" required>
          <Chips accent="c" options={THESES} value={d.theses || []} onChange={(v) => set("theses", v)} />
        </Field>
        <div className="ob-grid two">
          <Field label="Stage focus">
            <Text value={d.stageFocus || ""} onChange={(v) => set("stageFocus", v)} placeholder="Pre-seed → Series A" />
          </Field>
          <Field label="Geography">
            <Text value={d.geo || ""} onChange={(v) => set("geo", v)} placeholder="Europe, US" />
          </Field>
        </div>
        <Field label="Thesis notes" hint="Free-text theses sharpen Discover + LP matching.">
          <Area value={d.notes || ""} onChange={(v) => set("notes", v)} placeholder="We back technical founders building…" />
        </Field>
      </>
    ),
  },
  {
    key: "lps",
    order: "Real Moment — Your capital base",
    title: "LP Base",
    serif: "Optional — import or add LPs later.",
    optional: true,
    render: (d, set) => (
      <>
        <Field label="LP types">
          <Chips accent="c" options={LP_TYPES} value={d.lpTypes || []} onChange={(v) => set("lpTypes", v)} />
        </Field>
        <Field label="Import LPs" hint="Feeds LP Matchmaking + the fund/LP ledger.">
          <Choices
            accent="c"
            value={d.lpImport || ""}
            onChange={(v) => set("lpImport", v)}
            options={[
              { value: "csv", title: "Upload an LP list (CSV)", desc: "Map columns, then match." },
              { value: "skip", title: "Skip for now" },
            ]}
          />
        </Field>
      </>
    ),
  },
]

export function VcWizard() {
  return <Wizard persona="vc" steps={steps} />
}
