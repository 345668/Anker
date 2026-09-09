"use client"

import { Wizard, type WizardStep } from "./wizard"
import { Field, Text, Area, Chips, Choices, Drop } from "./fields"

const SECTORS = ["AI/ML", "Fintech", "Health", "Climate", "SaaS", "Consumer", "Deep Tech", "Marketplace", "Dev Tools"]

async function uploadDeck(file: File, set: (key: string, value: any) => void) {
  set("deckUpload", "uploading")
  const form = new FormData()
  form.append("file", file)
  form.append("section", "fundraising")
  form.append("itemKey", "pitch_deck")
  form.append("title", file.name)
  try {
    const response = await fetch("/api/dataroom/founder/upload", { method: "POST", body: form })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.ok !== true || !body.id) throw new Error(body.error || "Upload failed")
    set("deckDocumentId", body.id)
    set("deckUpload", "saved")
  } catch (error) {
    set("deckUpload", error instanceof Error ? error.message : "Upload failed — you can retry")
  }
}

const steps: WizardStep[] = [
  {
    key: "you",
    eyebrow: "Introduce yourself",
    title: "You",
    sub: "Start with your name — it powers your profile and warm-intro network.",
    valid: (d) => !!d.name?.trim(),
    render: (d, set) => (
      <div className="grid sm:grid-cols-2 gap-5">
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
    eyebrow: "Your company",
    title: "Your company",
    sub: "Upload your deck to auto-fill, or enter the essentials by hand.",
    valid: (d) => !!d.company?.trim(),
    render: (d, set) => (
      <>
        <Drop fileName={d.deck || ""} onFile={(n, file) => { set("deck", n); if (file) void uploadDeck(file, set) }} title="Upload your deck to auto-fill" sub="PDF · saved to your data room and ready for extraction" />
        {d.deckUpload === "uploading" && <p role="status" className="text-xs text-muted-foreground">Saving {d.deck} to your data room…</p>}
        {d.deckUpload === "saved" && <p className="text-xs text-emerald-700">Deck saved to your fundraising data room.</p>}
        {d.deckUpload && d.deckUpload !== "uploading" && d.deckUpload !== "saved" && <p role="alert" className="text-xs text-destructive">{d.deckUpload}</p>}
        <div className="grid sm:grid-cols-2 gap-5">
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
    eyebrow: "The raise",
    title: "The raise",
    sub: "How much you're raising and on what terms — this seeds your Runway.",
    valid: (d) => !!d.target,
    render: (d, set) => (
      <>
        <div className="grid sm:grid-cols-2 gap-5">
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
    eyebrow: "Optional",
    title: "Assets",
    sub: "Add your deck and a starter data room — or skip and do it later.",
    optional: true,
    render: (d, set) => (
      <>
        <Field label="Pitch deck">
          <Drop fileName={d.deck2 || d.deck || ""} onFile={(n, file) => { set("deck2", n); if (file) void uploadDeck(file, set) }} title="Drop your deck" sub="Saved to your data room for the deck analyzer + investor matching" />
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
