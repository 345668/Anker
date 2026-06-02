/**
 * Folk CRM client.
 *
 * Folk's REST API does NOT send emails — it's a relationship CRM that
 * captures activity. Our integration is one-way: after Resend sends an
 * outreach email, we POST /v1/interactions to log it against the Folk
 * person (or company) so it shows up alongside the contact in Folk.
 *
 * Endpoints touched:
 *   GET  /v1/people?search=<email>     — look up by email
 *   POST /v1/people                    — create a person
 *   POST /v1/interactions              — log the email (type='message')
 *
 * Auth: bearer token from env FOLK_API_KEY.
 *
 * Failure mode: every public fn returns { ok: true } | { ok: false, error }.
 * Callers must NOT throw on Folk errors — outreach send-success should not
 * roll back because the CRM log failed.
 */

const FOLK_BASE = "https://api.folk.app/v1"

function folkKey(): string | null {
  const k = (process.env.FOLK_API_KEY || "").trim()
  if (!k) return null
  return k
}

async function folkFetch(method: string, path: string, body?: any): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const key = folkKey()
  if (!key) return { ok: false, status: 0, error: "FOLK_API_KEY not set" }
  const url = `${FOLK_BASE}${path}`
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* keep null */ }
    if (!res.ok) {
      const msg = json?.error?.message || text.slice(0, 300) || `HTTP ${res.status}`
      return { ok: false, status: res.status, error: msg }
    }
    return { ok: true, data: json?.data ?? json }
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message ?? "network error" }
  }
}

export interface FolkPerson {
  id: string
  fullName?: string
  email?: string
}

/** Find a person by email — Folk's people index supports a `search` query. */
export async function findFolkPersonByEmail(email: string): Promise<{ ok: true; person: FolkPerson | null } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase()
  if (!e) return { ok: true, person: null }
  const r = await folkFetch("GET", `/people?search=${encodeURIComponent(e)}&limit=10`)
  if (!r.ok) return { ok: false, error: r.error }
  const items: any[] = r.data?.items ?? []
  // Filter to exact email matches — Folk's search is a contains-match across fields.
  for (const it of items) {
    const emails: string[] = []
    if (Array.isArray(it.emails)) for (const x of it.emails) if (typeof x?.value === "string") emails.push(x.value.toLowerCase())
    if (typeof it.email === "string") emails.push(it.email.toLowerCase())
    if (emails.includes(e)) {
      return { ok: true, person: { id: it.id, fullName: it.fullName, email: e } }
    }
  }
  return { ok: true, person: null }
}

/** Create a person in Folk. Returns the new id. */
export async function createFolkPerson(input: {
  email: string
  firstName?: string
  lastName?: string
  fullName?: string
  groupId?: string
}): Promise<{ ok: true; person: FolkPerson } | { ok: false; error: string }> {
  const body: any = {
    emails: [{ value: input.email, type: "work" }],
  }
  if (input.firstName) body.firstName = input.firstName
  if (input.lastName) body.lastName = input.lastName
  if (input.fullName && !body.firstName && !body.lastName) {
    const parts = input.fullName.trim().split(/\s+/)
    body.firstName = parts[0] ?? ""
    body.lastName = parts.slice(1).join(" ") || undefined
  }
  if (input.groupId) body.groups = [{ id: input.groupId }]
  const r = await folkFetch("POST", "/people", body)
  if (!r.ok) return { ok: false, error: r.error }
  const data = r.data
  if (!data?.id) return { ok: false, error: "Folk created person but returned no id" }
  return { ok: true, person: { id: data.id, fullName: data.fullName, email: input.email } }
}

/** Look up or create. Returns the Folk person id. */
export async function findOrCreateFolkPerson(input: {
  email: string
  fullName?: string
  groupId?: string
}): Promise<{ ok: true; personId: string; created: boolean } | { ok: false; error: string }> {
  const lookup = await findFolkPersonByEmail(input.email)
  if (!lookup.ok) return { ok: false, error: `lookup: ${lookup.error}` }
  if (lookup.person) return { ok: true, personId: lookup.person.id, created: false }
  const create = await createFolkPerson(input)
  if (!create.ok) return { ok: false, error: `create: ${create.error}` }
  return { ok: true, personId: create.person.id, created: true }
}

/** Log a sent email as a Folk interaction. type='message' is the closest
 *  generic type Folk supports — their enum does NOT include 'email'. */
export async function logFolkEmailInteraction(input: {
  folkPersonId: string
  subject: string
  body: string
  sentAt: Date | string
}): Promise<{ ok: true; interactionId: string } | { ok: false; error: string }> {
  const dt =
    typeof input.sentAt === "string"
      ? input.sentAt
      : input.sentAt.toISOString()
  // Folk only allows the closed enum below. We tag the subject in the
  // title so it's scannable from the contact's timeline.
  const payload = {
    entity: { id: input.folkPersonId },
    dateTime: dt,
    title: `Email: ${input.subject || "(no subject)"}`.slice(0, 240),
    content: (input.body || "").slice(0, 9500), // safety cap — Folk doesn't doc a hard limit
    type: "message" as const,
  }
  const r = await folkFetch("POST", "/interactions", payload)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, interactionId: r.data?.id ?? "" }
}

export function isFolkConfigured(): boolean {
  return !!folkKey()
}
