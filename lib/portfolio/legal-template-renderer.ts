/**
 * Legal & Compliance — phase 6 template renderer.
 *
 * Takes a template body + the fund's legal-field values and produces
 * a rendered markdown payload PLUS a TBD index so the document
 * viewer can highlight + deep-link any unfilled slots back to the
 * editor (?field=<key>).
 *
 * Supports two slot syntaxes:
 *   {{field_key}}                — top-level value
 *   {{field_key.subkey}}         — nested address parts (line1, city, …)
 *
 * Behaviour for missing values:
 *   - Empty / null / undefined   → TBD pill marker:
 *       <span data-tbd="field_key">[ Field Label · TBD ]</span>
 *   - Approved + filled          → emerald "filled" marker:
 *       <span data-filled="field_key">value</span>
 *   - Filled but not approved    → amber marker so the reviewer sees
 *       what still needs sign-off.
 *
 * The markers are stripped in the download-as-markdown path so the
 * exported file is plain text; they're kept in the in-browser viewer
 * so each TBD becomes a clickable Link.
 */

import { LEGAL_FIELD_BY_KEY } from "@/lib/portfolio/legal-fields-taxonomy"
import type { LegalFieldValues, LegalFieldApprovals } from "@/lib/portfolio/legal-fields"
import { getTemplate, type LegalTemplate } from "@/lib/portfolio/legal-templates"

export interface RenderedTemplate {
  template: LegalTemplate
  body: string
  /** Slot stats so the viewer header can show "12/47 fields filled". */
  stats: {
    totalSlots: number
    filledSlots: number
    approvedSlots: number
    tbdSlots: number
  }
  /** TBD field keys present in order of first appearance. */
  tbdFieldKeys: string[]
}

const SLOT_RE = /\{\{\s*([a-z0-9_]+)(?:\.([a-z0-9_]+))?\s*\}\}/gi

export interface RenderOptions {
  /** Strip TBD/filled markers and return raw text. Used by download/print. */
  plainText?: boolean
}

export function renderTemplate(
  docKey: string,
  values: LegalFieldValues,
  approvals: LegalFieldApprovals,
  opts: RenderOptions = {},
): RenderedTemplate | null {
  const template = getTemplate(docKey)
  if (!template) return null

  const seenSlots = new Set<string>()
  const tbdSet = new Set<string>()
  let totalSlots = 0, filledSlots = 0, approvedSlots = 0

  const body = template.body.replace(SLOT_RE, (_match, key: string, sub?: string) => {
    totalSlots++
    const def = LEGAL_FIELD_BY_KEY[key]
    const raw = values[key]
    let display: string | null = null
    if (sub) {
      // Nested address sub-key.
      if (raw && typeof raw === "object" && !Array.isArray(raw) && raw[sub] != null && raw[sub] !== "") {
        display = String(raw[sub])
      }
    } else if (raw != null && raw !== "" && !(Array.isArray(raw) && raw.length === 0)) {
      display = formatValue(raw, def?.inputType)
    }
    seenSlots.add(key)
    if (display) {
      filledSlots++
      // An approval row exists iff the field is human-approved. Computed
      // fields are auto-approved (no human vetting needed) so they
      // render emerald in the document body without an approvals entry.
      const isApproved = !!approvals[key] || def?.inputType === "computed"
      if (isApproved) approvedSlots++
      if (opts.plainText) return display
      const cls = isApproved ? "filled-approved" : "filled-pending"
      return `<span data-${cls}="${key}">${escapeHtml(display)}</span>`
    }
    tbdSet.add(key)
    if (opts.plainText) {
      const lbl = def?.label ?? key
      return `[ ${lbl}${sub ? ` · ${sub}` : ""} — TBD ]`
    }
    const lbl = def?.label ?? key
    return `<span data-tbd="${key}">[ ${escapeHtml(lbl)}${sub ? ` · ${escapeHtml(sub)}` : ""} · TBD ]</span>`
  })

  return {
    template,
    body,
    stats: { totalSlots, filledSlots, approvedSlots, tbdSlots: tbdSet.size },
    tbdFieldKeys: Array.from(tbdSet),
  }
}

// ── value formatting ────────────────────────────────────────────────────

function formatValue(v: any, type?: string): string {
  if (type === "yes_no") return v === true || v === "yes" ? "Yes" : "No"
  if (type === "currency") {
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return String(v)
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
  }
  if (type === "percent") return `${v}%`
  if (type === "ratio") return `${v}×`
  if (type === "years") return `${v} year${Number(v) === 1 ? "" : "s"}`
  if (type === "months") return `${v} month${Number(v) === 1 ? "" : "s"}`
  if (type === "date") {
    const d = new Date(String(v))
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    }
  }
  if (type === "address" && typeof v === "object") {
    const a = v as Record<string, string>
    return [a.line1, a.line2, a.city, a.region, a.postal, a.country].filter(Boolean).join(", ")
  }
  if (type === "multiple" && Array.isArray(v)) return v.join(", ")
  if (Array.isArray(v)) return v.join(", ")
  return String(v)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
