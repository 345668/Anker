"use client"

import { Wizard, type WizardStep, type WizardData } from "./wizard"
import { Field, Text, Area, Chips, Choices, Drop } from "./fields"
import s from "./onboarding.module.css"

const SECTORS = ["AI/ML", "Fintech", "Health", "Climate", "SaaS", "Consumer", "Deep Tech", "Marketplace", "Dev Tools"]

async function uploadDeck(file: File, set: (key: string, value: any) => void, extract: boolean) {
  set("deckExtraction", null)
  if (!file.size || file.size > 4 * 1024 * 1024 || !/\.(pdf|pptx?)$/i.test(file.name)) {
    set("deckUpload", "Choose a PDF or PowerPoint file of 4 MB or less.")
    return
  }
  set("deckUpload", "uploading")
  const form = new FormData()
  form.append("file", file)
  form.append("section", "fundraising")
  form.append("itemKey", "pitch_deck")
  form.append("title", file.name)
  try {
    const response = await fetch("/api/dataroom/founder/upload?onboarding=1", { method: "POST", body: form, signal: AbortSignal.timeout(90000) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.ok !== true || !body.id) throw new Error(body.error || "Upload failed")
    set("deckDocumentId", body.id)
    set("deckUpload", "saved")
    if (!extract) return

    // Run the same extraction workflow used by Find Investors so onboarding
    // produces useful fields instead of merely storing a filename. The
    // extracted values remain editable in the wizard; nothing is silently
    // treated as authoritative.
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      set("deckExtraction", "extracting")
      try {
        const extractionForm = new FormData()
        extractionForm.append("pitch_deck", file)
        const extractionResponse = await fetch("/api/onboarding/extract", { method: "POST", body: extractionForm, signal: AbortSignal.timeout(90000) })
        const extraction = await extractionResponse.json().catch(() => ({}))
        if (!extractionResponse.ok || !extraction.fields) throw new Error(extraction.error || "Deck extraction failed")
        const fields = extraction.fields as Record<string, any>
        if (fields.name) set("company", fields.name)
        if (fields.oneLiner) set("oneliner", fields.oneLiner)
        if (fields.stage) set("stage", fields.stage)
        if (Array.isArray(fields.sectors) && fields.sectors.length) set("sectors", fields.sectors)
        if (fields.askAmount) set("target", String(fields.askAmount))
        set("deckExtracted", fields)
        set("deckExtraction", "ready")
      } catch (error) {
        set("deckExtraction", error instanceof Error ? error.message : "Deck extraction failed — review the fields manually")
      }
    } else {
      set("deckExtraction", "PDF required for automatic extraction; the file is saved and can be reviewed manually")
    }
  } catch (error) {
    set("deckUpload", error instanceof Error ? error.message : "Upload failed — you can retry")
  }
}

function DeckUpload({ data, set, extract }: { data: WizardData; set: (key: string, value: any) => void; extract: boolean }) {
  return <div className="grid gap-3">
    <Drop fileName={data.deck || ""} disabled={data.deckUpload === "uploading" || data.deckExtraction === "extracting"}
      onFile={(name, file) => { set("deck", name); if (file) void uploadDeck(file, set, extract) }}
      title={extract ? "Upload a deck for suggested profile details" : "Add a pitch deck"}
      sub={extract ? "Optional · PDF or PowerPoint, up to 4 MB. PDFs are analysed to suggest editable company details. You can also enter everything manually." : "Optional · PDF or PowerPoint, up to 4 MB. Saved to your fundraising data room; your profile details stay as entered."} />
    {data.deckUpload === "uploading" && <p role="status" className={s.status}>Saving your deck…</p>}
    {data.deckUpload === "saved" && <p role="status" className={s.status}>Deck saved to your fundraising data room.</p>}
    {data.deckUpload && !["uploading", "saved"].includes(data.deckUpload) && <p role="alert" className={`${s.notice} ${s.error}`}>{data.deckUpload} You can choose the file again or continue without it.</p>}
    {data.deckExtraction === "extracting" && <p role="status" className={s.status}>Reading your deck for suggested profile details…</p>}
    {data.deckExtraction === "ready" && <p role="status" className={s.notice}>Details suggested from your deck. Review the company information and raise target before continuing.</p>}
    {data.deckExtraction && !["extracting", "ready"].includes(data.deckExtraction) && <p role="status" className={s.notice}>{data.deckExtraction}</p>}
  </div>
}

const steps: WizardStep[] = [
  {
    key: "you",
    eyebrow: "Introduce yourself",
    title: "Your profile",
    sub: "Introduce yourself to your workspace. Start with your name; the other details are optional.",
    valid: (d) => !!d.name?.trim(),
    validationMessage: "Enter your full name before continuing.",
    render: (d, set) => (
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Full name" required>
          <Text value={d.name || ""} onChange={(v) => set("name", v)} placeholder="Your full name" autoComplete="name" />
        </Field>
        <Field label="Title">
          <Text value={d.title || ""} onChange={(v) => set("title", v)} placeholder="CEO & Co-founder" />
        </Field>
        <Field label="LinkedIn" hint="Add your profile URL. This does not connect or import your network.">
          <Text value={d.linkedin || ""} onChange={(v) => set("linkedin", v)} placeholder="linkedin.com/in/…" />
        </Field>
        <Field label="Work email">
          <Text value={d.email || ""} onChange={(v) => set("email", v)} placeholder="you@company.com" type="email" autoComplete="email" />
        </Field>
      </div>
    ),
  },
  {
    key: "company",
    eyebrow: "Your company",
    title: "Your company",
    sub: "Tell us what you’re building. Enter the essentials, or use your deck to suggest details for your review.",
    valid: (d) => !!d.company?.trim(),
    validationMessage: "Enter your company name before continuing.",
    render: (d, set) => (
      <>
        <DeckUpload data={d} set={set} extract />
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Company name" required>
            <Text value={d.company || ""} onChange={(v) => set("company", v)} placeholder="Northstar Labs" />
          </Field>
          <Field label="Website">
            <Text value={d.website || ""} onChange={(v) => set("website", v)} placeholder="northstar.com" />
          </Field>
        </div>
        <Field label="Company location" hint="Country or region; used as a reference when you prepare your matching profile."><Text value={d.geography || ""} onChange={(v) => set("geography", v)} placeholder="Berlin, Germany" /></Field>
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
    title: "Your fundraising plans",
    sub: "Not fundraising yet? Skip this step. Otherwise, save your plans with the company profile; create an operating round and runway model after setup.",
    optional: true,
    render: (d, set) => (
      <>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Target amount" hint="Include the currency, for example EUR 1,500,000.">
            <Text value={d.target || ""} onChange={(v) => set("target", v)} placeholder="EUR 1,500,000" />
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
              { value: "safe", title: "SAFE" },
              { value: "priced", title: "Priced round", desc: "Equity with a set valuation." },
              { value: "note", title: "Convertible note" },
            ]}
          />
        </Field>
        <Field label="Use of funds" hint="Keep a note of your priorities. This does not create a runway model.">
          <Area value={d.use || ""} onChange={(v) => set("use", v)} placeholder="Hire 3 engineers, extend runway to 24mo, ship v2…" />
        </Field>
      </>
    ),
  },
  {
    key: "assets",
    eyebrow: "Optional",
    title: "Your documents",
    sub: "Add a pitch deck to your fundraising data room, or finish setup and organise your documents later.",
    optional: true,
    render: (d, set) => (
      <>
        <DeckUpload data={d} set={set} extract={false} />
        <p className={s.notice}>You can organise financials, metrics and other documents from the data room after setup. Uploading here saves a document; it does not send it to investors.</p>
      </>
    ),
  },
]

export function FounderWizard() {
  return <Wizard persona="founder" steps={steps} />
}
