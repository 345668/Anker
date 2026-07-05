"use client"

/**
 * WebMCP tools for /dashboard/outreach/lp-campaign.
 *
 * Three tools that drive the LP-outreach studio:
 *
 *   - enrich_from_xlsx     : takes a file path/id already uploaded to
 *                            the page and kicks off enrichment. The
 *                            actual file upload is human-only (Web MCP
 *                            can't attach binary; this tool triggers the
 *                            enrichment once an XLSX has been dropped).
 *   - generate_drafts       : run the two-voice Qwen generator against
 *                            the currently-parsed profiles.
 *   - apply_template        : swap in a stored template (e.g. SVS Fund II
 *                            managing partner voice).
 *
 * The heavy lifting stays in the existing async handlers on
 * lp-campaign-content — this file just calls them.
 */
import { useWebMcp } from "@/lib/webmcp/use-web-mcp"

interface Props {
  hasFile: boolean
  onEnrich: () => Promise<{ ok: boolean; msg?: string; rows?: number }>
  onGenerateDrafts: (voice: "founder" | "managing_partner" | "auto") => Promise<{ ok: boolean; msg?: string; drafts?: number }>
  onApplyTemplate: (templateId: string) => Promise<{ ok: boolean; msg?: string }>
}

export function useLpCampaignWebMcp(props: Props): void {
  const { hasFile, onEnrich, onGenerateDrafts, onApplyTemplate } = props
  useWebMcp(
    () => [
      {
        name: "enrich_from_xlsx",
        description: "Enrich the LP list you just uploaded on this page. Adds firm intel, AUM, ticket size, and a research summary per row via Qwen. Requires that an XLSX/CSV has already been dropped on the Import tab.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          if (!hasFile) return "No file uploaded. Drop an XLSX/CSV on the Import tab first."
          const r = await onEnrich()
          if (!r.ok) return `Enrichment failed: ${r.msg || "unknown error"}.`
          return typeof r.rows === "number" ? `Enriched ${r.rows} row(s).` : "Enrichment complete."
        },
      },
      {
        name: "generate_drafts",
        description: "Generate two-voice outreach drafts (email + LinkedIn DM) for each parsed profile using Qwen. Voice controls the tone.",
        inputSchema: {
          type: "object",
          properties: {
            voice: {
              type: "string",
              enum: ["founder", "managing_partner", "auto"],
              description: "founder = warm/personal, managing_partner = senior/institutional, auto = pick per profile.",
            },
          },
          required: ["voice"],
        },
        execute: async ({ voice }: { voice: "founder" | "managing_partner" | "auto" }) => {
          const r = await onGenerateDrafts(voice)
          if (!r.ok) return `Generate failed: ${r.msg || "unknown error"}.`
          return typeof r.drafts === "number" ? `Generated ${r.drafts} draft(s) in ${voice} voice.` : "Drafts generated."
        },
      },
      {
        name: "apply_template",
        description: "Apply a stored template to every draft in the current campaign — signature, boilerplate, tracking-link placeholders. Use before Export.",
        inputSchema: {
          type: "object",
          properties: {
            template_id: { type: "string", description: "Stored template id (e.g. svs_fund_ii_mp_v3)." },
          },
          required: ["template_id"],
        },
        execute: async ({ template_id }: { template_id: string }) => {
          const r = await onApplyTemplate(template_id)
          if (!r.ok) return `Apply template failed: ${r.msg || "unknown error"}.`
          return `Template ${template_id} applied to all drafts.`
        },
      },
    ],
    [hasFile, onEnrich, onGenerateDrafts, onApplyTemplate],
  )
}
/** Backward-compat component wrapper. Prefer useLpCampaignWebMcp(). */
export function LpCampaignWebMcpTools(props: Props): null {
  useLpCampaignWebMcp(props)
  return null
}
