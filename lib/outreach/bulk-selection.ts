/**
 * What a bulk send is allowed to mean. docs/architecture/46 §1.3 (gap 2).
 *
 * The campaign send route used to send every drafted member when called with an empty body: the recipient set was whatever happened to be drafted at that
 * instant, and the caller never said how many people that was. A send now names its recipients (`memberIds`), or says `all: true` AND the number the caller
 * saw (`expectedCount`), and the server refuses if the number differs. `preview: true` returns the count without sending, so a screen can show it first.
 */
export const MAX_BULK_SEND = 200

export type BulkSelection =
  | { kind: "explicit"; ids: string[]; preview: boolean }
  | { kind: "all"; expectedCount: number | null; preview: boolean }
  | { kind: "invalid"; error: string }

export function parseBulkSelection(body: any): BulkSelection {
  const preview = body?.preview === true
  if (Array.isArray(body?.memberIds)) {
    const ids: string[] = (body.memberIds as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
    if (ids.length === 0) return { kind: "invalid", error: "memberIds is empty. Name the members to send to, or send all: true with the expectedCount you saw." }
    if (ids.length !== body.memberIds.length) return { kind: "invalid", error: "memberIds must be a list of member ids." }
    if (ids.length > MAX_BULK_SEND) return { kind: "invalid", error: `At most ${MAX_BULK_SEND} members per send. Send in batches.` }
    return { kind: "explicit", ids: [...new Set(ids)], preview }
  }
  if (body?.memberIds !== undefined) return { kind: "invalid", error: "memberIds must be a list of member ids." }
  if (body?.all !== true) return { kind: "invalid", error: "Say who to send to: memberIds, or all: true with the expectedCount you saw. A send with no recipients named no longer means everyone." }
  if (preview) return { kind: "all", expectedCount: null, preview }
  const n = body?.expectedCount
  if (!Number.isInteger(n) || n < 0) return { kind: "invalid", error: "all: true needs expectedCount, the number of drafted members you saw. Use preview: true to get it." }
  return { kind: "all", expectedCount: n, preview }
}

/** The server's own count must match what the caller saw, and stay inside the cap. Returns an error message or null. */
export function checkCount(actual: number, expected: number | null): string | null {
  if (actual > MAX_BULK_SEND) return `${actual} drafted members is more than ${MAX_BULK_SEND} in one send. Choose members with memberIds and send in batches.`
  if (expected !== null && actual !== expected) return `You saw ${expected} members but ${actual} are drafted now. Nothing was sent; review and try again.`
  return null
}
