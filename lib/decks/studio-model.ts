import { z } from "zod"

export const slideSchema = z.object({
  kind: z.enum(["title", "content", "closer"]).default("content"),
  title: z.string().trim().min(1).max(100),
  subtitle: z.string().max(160).default(""),
  bullets: z.array(z.string().max(180)).max(5).default([]),
  notes: z.string().max(5000).default(""),
})
export const deckInput = z.object({
  title: z.string().trim().min(1).max(100),
  roundId: z.string().max(200).nullable().default(null),
  slides: z.array(slideSchema).min(1).max(30),
  revision: z.number().int().min(0),
  orgId: z.string().min(1),
})
export type StudioSlide = z.infer<typeof slideSchema>
export type StudioContext = { orgId: string; name: string; persona: string; roundId: string | null; roundName: string | null; fundId: string | null }
export type StudioDeck = { id: string; title: string; templateKey: string; context: StudioContext; slides: StudioSlide[]; revision: number; updatedAt: string }
function slide(title: string, bullets: string[]): StudioSlide { return { kind: "content", title, subtitle: "", bullets, notes: "Sample structure. Replace prompts with verified facts and sources before sharing." } }
export const STUDIO_TEMPLATES = [
  { key: "founder-pitch", name: "Founder pitch", persona: "founder", description: "An eight-slide fundraising story, from customer problem to use of funds.", slides: [
    { ...slide("Your company", []), kind: "title" as const, subtitle: "Sample founder pitch. Replace with your company’s one-line description." },
    slide("Customer problem", ["Who experiences the problem and how often?", "What does the current workaround cost?", "Add a sourced customer observation."]),
    slide("Product and customer outcome", ["Describe the core product workflow.", "Explain the measurable outcome for the customer.", "Add a product demonstration link in the speaker notes."]),
    slide("Market and timing", ["Define your initial customer segment.", "Size the reachable market using a stated method.", "Explain the change that makes this opportunity timely."]),
    slide("Traction", ["Add dated revenue, usage or pilot evidence.", "Separate paying customers from trials and pipeline.", "Include the measurement period and source."]),
    slide("Business model", ["Describe pricing and who pays.", "State gross margin and customer acquisition assumptions.", "Explain the sales process and expected payback."]),
    slide("Team and execution", ["Introduce the team with relevant evidence.", "Identify the next operating milestones.", "Name the capabilities you still need to hire."]),
    { ...slide("Funding and next milestones", []), kind: "closer" as const, subtitle: "Add the round amount, use of funds, target runway and contact details." },
  ] },
  { key: "investor-update", name: "Investor update", persona: "founder", description: "A six-slide operating review with metrics, runway and clear asks.", slides: [
    { ...slide("Company investor update", []), kind: "title" as const, subtitle: "Sample update. Add company name and reporting period." },
    slide("Progress against plan", ["Report the previous period’s milestones.", "Explain material variances and corrective action."]),
    slide("Operating metrics", ["Include revenue and customer measures with their definitions.", "Compare the current period with the previous period.", "Separate actual results from forecasts."]),
    slide("Cash and runway", ["State cash balance and the measurement date.", "State monthly net cash flow and scenario assumptions.", "Identify any expected financing dependency."]),
    slide("Priorities and risks", ["List the next milestones and their owners.", "Describe the most material unresolved risk."]),
    { ...slide("How investors can help", []), kind: "closer" as const, subtitle: "Add specific introductions, hiring needs or customer requests and a contact." },
  ] },
  { key: "fund-overview", name: "Fund overview", persona: "vc", description: "An eight-slide fund narrative covering mandate, portfolio construction and operations.", slides: [
    { ...slide("Fund overview", []), kind: "title" as const, subtitle: "Sample fund presentation. Replace with the authorized fund’s name and vintage." },
    slide("Investment mandate", ["Define stage, sectors and geography.", "Explain the fund’s differentiation with supporting evidence."]),
    slide("Market opportunity", ["Describe the opportunity and source the market evidence.", "Explain why the mandate fits the current opportunity set."]),
    slide("Portfolio construction", ["State target portfolio size and initial check range.", "Explain reserves, ownership targets and concentration limits."]),
    slide("Sourcing and investment process", ["Describe sourcing channels and screening criteria.", "Explain diligence and investment committee responsibilities."]),
    slide("Portfolio and track record", ["Include only authorized, attributable investment data.", "Label unrealized versus realized performance and the valuation date."]),
    slide("Team and fund operations", ["Introduce the investment team and relevant experience.", "Describe reporting, administration and governance arrangements."]),
    { ...slide("Fundraising and next steps", []), kind: "closer" as const, subtitle: "Add verified fund terms, fundraising status and contact details." },
  ] },
]
