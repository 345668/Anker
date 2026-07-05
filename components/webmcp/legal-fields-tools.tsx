"use client"

/**
 * WebMCP tools for /dashboard/portfolio/fund/legal/fields.
 *
 * Three actions on legal fields:
 *   - mark_field_approved(key)      : flip a field from Filled -> Approved
 *   - regenerate_narrative(key)     : re-run the AI narrative generator
 *   - open_document(slug)           : jump to /legal/documents/<slug>
 *
 * We reuse the existing toggleApproval / generateField handlers so the
 * approval workflow (locked-when-review-in-flight, credits, etc.) is
 * honoured exactly the same way as when a human clicks the button.
 */
import { useWebMcp } from "@/lib/webmcp/use-web-mcp"
import { useRouter } from "next/navigation"

interface Props {
  toggleApproval: (key: string, approve: boolean) => Promise<void>
  generateField: (key: string) => Promise<void>
  approvalsMap: Record<string, boolean | undefined>
  fundId?: string
}

export function useLegalFieldsWebMcp(props: Props): void {
  const { toggleApproval, generateField, approvalsMap, fundId } = props
  const router = useRouter()

  useWebMcp(
    () => [
      {
        name: "mark_field_approved",
        description: "Approve a filled legal field. Only works when the field has a value. Field keys look like fund_name, delaware_lp_partner_name, etc. Use exact taxonomy keys.",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", description: "Legal field taxonomy key. Case-sensitive." },
          },
          required: ["key"],
        },
        execute: async ({ key }: { key: string }) => {
          if (!key) return "key is required."
          if (approvalsMap[key]) return `${key} is already approved.`
          try {
            await toggleApproval(key, true)
            return `${key} approved.`
          } catch (e: any) {
            return `Approve failed: ${e?.message || "unknown error"}.`
          }
        },
      },
      {
        name: "regenerate_narrative",
        description: "Re-run the AI narrative generator for a specific legal field. Only works for AI-generated narrative fields (e.g. investment_thesis, gp_bio_summary).",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", description: "Legal field key with AI-generated narrative." },
          },
          required: ["key"],
        },
        execute: async ({ key }: { key: string }) => {
          if (!key) return "key is required."
          try {
            await generateField(key)
            return `Regenerated ${key}.`
          } catch (e: any) {
            return `Regenerate failed: ${e?.message || "unknown error"}.`
          }
        },
      },
      {
        name: "open_document",
        description: "Navigate to a specific legal document view (LPA, Cert of Formation, Subscription Agreement, etc.). Use the document slug from the field's supporting-documents list.",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Document slug — matches the docKey from the legal catalogue." },
          },
          required: ["slug"],
        },
        execute: async ({ slug }: { slug: string }) => {
          if (!slug || !fundId) return "Both slug and current fund are required."
          const url = `/dashboard/portfolio/fund/legal/documents/${encodeURIComponent(slug)}`
          router.push(url)
          return `Navigating to document ${slug}.`
        },
      },
    ],
    [toggleApproval, generateField, approvalsMap, fundId, router],
  )
}
/** Backward-compat component wrapper. Prefer useLegalFieldsWebMcp(). */
export function LegalFieldsWebMcpTools(props: Props): null {
  useLegalFieldsWebMcp(props)
  return null
}
