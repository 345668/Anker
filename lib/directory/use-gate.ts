/**
 * What a directory source may be used for (docs/architecture/54, slice D1). The decision is a pure function of the source's register row, the purpose and the gate flag,
 * so it can be tested without a database. Restricted, recorded-but-not-permitting and withdrawn sources are enforced always (someone decided that); an unreviewed or
 * unregistered source is only warned about until the platform flag `directory_use_gate` is on, so a source nobody has reviewed yet does not cut off a workspace without notice.
 */
export const PURPOSES = ["internal_matching", "outreach_email", "outreach_linkedin", "display_to_customers", "resale"] as const
export type Purpose = (typeof PURPOSES)[number]
export type SourceStatus = "recorded" | "unreviewed" | "restricted" | "withdrawn"
export interface SourceRow { source: string; status: SourceStatus; permitted_use: string[] }

export interface UseDecision {
  ok: boolean
  /** True when a refusal must stop the action; false when it is only logged. */
  enforce: boolean
  code: "allowed" | "withdrawn" | "not_permitted" | "unreviewed"
  reason: string
}

export function decideUse(row: SourceRow | null | undefined, purpose: Purpose, gateOn: boolean): UseDecision {
  if (row?.status === "withdrawn") return { ok: false, enforce: true, code: "withdrawn", reason: "This contact's source has been withdrawn." }
  if (!row || row.status === "unreviewed") {
    if (purpose === "internal_matching") return { ok: true, enforce: false, code: "allowed", reason: "" }
    return { ok: false, enforce: gateOn, code: "unreviewed", reason: "This contact's source has not been reviewed, so it is not cleared for this use." }
  }
  if (row.permitted_use.includes(purpose)) return { ok: true, enforce: false, code: "allowed", reason: "" }
  return { ok: false, enforce: true, code: "not_permitted", reason: "The licence recorded for this contact's source does not allow this use." }
}

/** A person can be known through several sources; the use is allowed when any one of them allows it. Otherwise the strictest refusal is reported. */
export function decideForSources(rows: Array<SourceRow | null>, purpose: Purpose, gateOn: boolean): UseDecision {
  if (!rows.length) return { ok: true, enforce: false, code: "allowed", reason: "" }
  const ds = rows.map((r) => decideUse(r, purpose, gateOn))
  const allowed = ds.find((d) => d.ok)
  if (allowed) return allowed
  return ds.find((d) => d.enforce) ?? ds[0]
}
