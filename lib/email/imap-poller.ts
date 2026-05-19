/**
 * IMAP poller — pulls inbound replies for the vc@an-ker.de mailbox and
 * ingests them as outreach_replies rows with classification IS NULL.
 *
 * Threading-match strategy (in order):
 *   1. RFC 2822 In-Reply-To / References → match outreach_messages.email_message_id
 *   2. From-address (lowercased) → match crm_entries.display_email
 *   3. From-address → match investors.email
 *
 * On match: insert outreach_replies row pointing at the original message
 * + crm_entry.  The agent's classify_reply step (or admin via /inbox)
 * picks it up.
 *
 * On miss: skip but keep advancing last_uid so we don't reprocess.
 *
 * Env:
 *   IMAP_HOST    e.g. imap.mailbox.org
 *   IMAP_PORT    993 (default)
 *   IMAP_SECURE  "true" (default)
 *   IMAP_USER    vc@an-ker.de
 *   IMAP_PASS    app password / mailbox password
 *   IMAP_MAILBOX "INBOX" (default)
 *
 * If imapflow / mailparser aren't installed we degrade to no-op + return
 * { error: "imapflow not installed" }.  Both are pure JS, install via:
 *     pnpm add imapflow mailparser
 */

import { sql } from "@/lib/db"

const DEFAULT_MAILBOX = process.env.IMAP_MAILBOX || "INBOX"

export interface PollResult {
  mailbox: string
  pulled: number
  newReplies: number
  matched: number
  unmatched: number
  lastUid: number
  durationMs: number
  error?: string
  skipped?: boolean
}

interface ImapFlowCtor {
  new (opts: {
    host: string; port: number; secure: boolean;
    auth: { user: string; pass: string }
    logger: false
  }): {
    connect(): Promise<void>
    logout(): Promise<void>
    mailboxOpen(name: string): Promise<{ exists: number }>
    search(query: any): Promise<number[]>
    fetch(seq: any, opts: any, fetchOpts?: any): AsyncIterable<any>
  }
}

interface ParsedMail {
  messageId?: string
  inReplyTo?: string
  references?: string | string[]
  from?: { value?: Array<{ address?: string }> }
  text?: string
  html?: string | false
  subject?: string
  date?: Date
}

export function isImapConfigured(): boolean {
  return !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS)
}

export async function pollInbox(opts: {
  mailbox?: string
  limit?: number
} = {}): Promise<PollResult> {
  const t0 = Date.now()
  const user = process.env.IMAP_USER || "vc@an-ker.de"
  const mailboxName = opts.mailbox ?? DEFAULT_MAILBOX
  const key = `${user}:${mailboxName}`
  const cap = Math.max(1, Math.min(200, opts.limit ?? 100))

  if (!isImapConfigured()) {
    return baseResult(key, t0, { skipped: true, error: "IMAP not configured (IMAP_HOST + IMAP_USER + IMAP_PASS)." })
  }

  // Lazy-load to keep startup snappy and avoid hard dep at build time
  let ImapFlow: ImapFlowCtor
  let parseMail: (input: Buffer | string) => Promise<ParsedMail>
  try {
    const flowMod: any = await import("imapflow")
    const parserMod: any = await import("mailparser")
    ImapFlow = flowMod.ImapFlow as ImapFlowCtor
    parseMail = parserMod.simpleParser as any
  } catch (e: any) {
    return baseResult(key, t0, { error: `imapflow/mailparser not installed: ${e?.message ?? "missing dep"}` })
  }

  // Read last_uid checkpoint
  const [stateRow] = await sql`
    SELECT last_uid FROM inbox_poll_state WHERE mailbox = ${key} LIMIT 1
  `
  let lastUid = Number((stateRow as any)?.last_uid ?? 0)

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: (process.env.IMAP_SECURE ?? "true") !== "false",
    auth: { user, pass: process.env.IMAP_PASS! },
    logger: false,
  })

  let pulled = 0, matched = 0, unmatched = 0, newReplies = 0, maxUid = lastUid
  try {
    await client.connect()
    await client.mailboxOpen(mailboxName)
    // Pull only UIDs above the checkpoint
    const uids: number[] = await client.search({ uid: `${lastUid + 1}:*` })
    const slice = uids.slice(0, cap)

    for (const uid of slice) {
      pulled++
      // Fetch the raw envelope + source so we can parse fully
      let raw: Buffer | null = null
      let envelope: any = null
      for await (const msg of client.fetch(uid, { source: true, envelope: true, uid: true }, { uid: true })) {
        raw = msg.source ?? null
        envelope = msg.envelope ?? null
        if (msg.uid && msg.uid > maxUid) maxUid = msg.uid
        break
      }
      if (!raw) continue

      let parsed: ParsedMail
      try { parsed = await parseMail(raw) } catch { continue }

      const messageId = (parsed.messageId ?? envelope?.messageId ?? "").trim()
      const inReplyTo = (parsed.inReplyTo ?? envelope?.inReplyTo ?? "").trim()
      const refs = Array.isArray(parsed.references) ? parsed.references
        : (typeof parsed.references === "string" ? [parsed.references] : [])
      const fromAddr = (parsed.from?.value?.[0]?.address ?? envelope?.from?.[0]?.address ?? "").toLowerCase().trim()
      const subject = parsed.subject ?? envelope?.subject ?? ""
      const text = parsed.text ?? (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, "") : "")

      // ---- Match strategy
      let originalMessageId: string | null = null
      let crmEntryId: string | null = null
      let userId: string | null = null

      // 1. by In-Reply-To / References → outreach_messages.email_message_id
      const lookupIds = [inReplyTo, ...refs].map((s) => String(s ?? "").trim()).filter(Boolean)
      for (const candidate of lookupIds) {
        const [m] = await sql`
          SELECT id, crm_entry_id, user_id
          FROM outreach_messages
          WHERE email_message_id = ${candidate}
          LIMIT 1
        `
        if (m) {
          originalMessageId = (m as any).id
          crmEntryId = (m as any).crm_entry_id
          userId = (m as any).user_id ?? null
          break
        }
      }

      // 2. fallback: from-address → crm_entries.display_email
      if (!crmEntryId && fromAddr) {
        const [e] = await sql`
          SELECT id, user_id FROM crm_entries
          WHERE lower(display_email) = ${fromAddr}
          ORDER BY updated_at DESC
          LIMIT 1
        `
        if (e) {
          crmEntryId = (e as any).id
          userId = (e as any).user_id ?? null
        }
      }

      // 3. fallback: investors.email → look up a crm_entries pointing at that investor
      if (!crmEntryId && fromAddr) {
        const [e] = await sql`
          SELECT ce.id, ce.user_id FROM crm_entries ce
          JOIN investors i ON i.id = ce.investor_id
          WHERE lower(i.email) = ${fromAddr}
          ORDER BY ce.updated_at DESC
          LIMIT 1
        `
        if (e) {
          crmEntryId = (e as any).id
          userId = (e as any).user_id ?? null
        }
      }

      if (!crmEntryId) { unmatched++; continue }
      matched++

      // De-dupe — if we've already ingested this messageId, skip
      if (messageId) {
        const [exists] = await sql`
          SELECT id FROM outreach_replies
          WHERE notes LIKE ${'%[msgid:' + messageId.replace(/[%_]/g, '') + ']%'}
          LIMIT 1
        `
        if (exists) continue
      }

      await sql`
        INSERT INTO outreach_replies (
          user_id, crm_entry_id, in_reply_to_message_id,
          inbound_text, received_at, generated_by, notes,
          created_at, updated_at
        ) VALUES (
          ${userId},
          ${crmEntryId},
          ${originalMessageId},
          ${text || subject || "(empty body)"},
          ${parsed.date ? parsed.date.toISOString() : new Date().toISOString()}::timestamptz,
          ${"imap:" + (process.env.IMAP_HOST ?? "unknown")},
          ${`from=${fromAddr || "?"} subject=${(subject || "").slice(0, 120)} [msgid:${messageId}]`},
          NOW(), NOW()
        )
      `
      newReplies++
    }

    await client.logout().catch(() => {})

    // Persist checkpoint + counters
    await sql`
      INSERT INTO inbox_poll_state (mailbox, last_uid, last_polled_at, last_error, poll_count, new_replies)
      VALUES (${key}, ${maxUid}, NOW(), NULL, 1, ${newReplies})
      ON CONFLICT (mailbox) DO UPDATE SET
        last_uid       = EXCLUDED.last_uid,
        last_polled_at = NOW(),
        last_error     = NULL,
        poll_count     = inbox_poll_state.poll_count + 1,
        new_replies    = ${newReplies}
    `

    return {
      mailbox: key,
      pulled, matched, unmatched, newReplies,
      lastUid: maxUid,
      durationMs: Date.now() - t0,
    }
  } catch (e: any) {
    try { await client.logout() } catch {}
    await sql`
      INSERT INTO inbox_poll_state (mailbox, last_uid, last_polled_at, last_error, poll_count, new_replies)
      VALUES (${key}, ${lastUid}, NOW(), ${e?.message ?? "unknown error"}, 1, 0)
      ON CONFLICT (mailbox) DO UPDATE SET
        last_polled_at = NOW(),
        last_error     = ${e?.message ?? "unknown error"},
        poll_count     = inbox_poll_state.poll_count + 1
    `
    return baseResult(key, t0, { error: e?.message ?? "IMAP poll failed", pulled, matched, unmatched, newReplies, lastUid })
  }
}

function baseResult(mailbox: string, t0: number, extra: Partial<PollResult> = {}): PollResult {
  return {
    mailbox,
    pulled: 0, matched: 0, unmatched: 0, newReplies: 0,
    lastUid: 0,
    durationMs: Date.now() - t0,
    ...extra,
  }
}
