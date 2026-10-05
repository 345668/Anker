/**
 * How a caller should treat what the send gate and the provider throw, and how to tell a person about addresses left out of a send.
 * docs/architecture/46 §13. Pure: no I/O.
 */

export type SendErrorClass =
  /** Permanent for this recipient until something changes (they opted out, or consent is needed): skip, say why, do not retry. */
  | { kind: "skip"; reason: string }
  /** The whole sender is stopped (paused workspace, plan or daily allowance, maintenance): stop the loop, leave the rest to send later. */
  | { kind: "stop"; reason: string }
  /** Anything else (provider error, timeout): a failure worth retrying. */
  | { kind: "fail"; message: string }

export function classifySendError(e: unknown): SendErrorClass {
  const err = e as { code?: string; name?: string; message?: string } | null
  const message = String(err?.message ?? "Delivery failed").slice(0, 400)
  if (err?.code === "recipient_suppressed") return { kind: "skip", reason: "Opted out: this address asked not to receive Anker outreach email." }
  if (err?.code === "country_gated") return { kind: "skip", reason: message }
  if (err?.name === "EntitlementRefusal") return { kind: "stop", reason: message }
  return { kind: "fail", message }
}

export interface Dropped { email: string; field: "cc" | "bcc"; reason: "suppressed" | "country_gated" }

const WHY: Record<Dropped["reason"], string> = { suppressed: "opted out", country_gated: "needs recorded consent" }

/** One plain sentence for the person who sent, or null when nothing was left out. */
export function describeDropped(dropped: Dropped[] | undefined | null): string | null {
  if (!dropped?.length) return null
  const parts = dropped.map((d) => `${d.email} (${d.field}, ${WHY[d.reason]})`)
  return `Sent, but not copied to: ${parts.join(", ")}. Those addresses were left out so the message could still go to its recipient.`
}
