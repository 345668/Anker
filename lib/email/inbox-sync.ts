/**
 * Provider-agnostic inbound sync (P2-9 of docs/founder-outreach-audit.md).
 *
 * Fans reply retrieval out across every configured mailbox provider and reports
 * per-provider results, so adding a provider is one entry here rather than a
 * change at every call site. Today IMAP is wired; Gmail send + OAuth exist
 * (lib/email/gmail.ts) but inbound polling is not built yet — it is a labelled
 * extension point below so the shape is ready.
 */
import { pollInbox, isImapConfigured, type PollResult } from "./imap-poller"
import { isGmailOAuthConfigured } from "./gmail"

export interface ProviderPoll {
  provider: string
  result: PollResult | { skipped: true; error: string }
}

export interface MultiPollResult {
  providers: ProviderPoll[]
  totalNewReplies: number
}

export async function pollAllMailboxes(opts: { limit?: number } = {}): Promise<MultiPollResult> {
  const limit = opts.limit ?? 100
  const providers: ProviderPoll[] = []

  // ── IMAP (wired) ────────────────────────────────────────────────────────
  if (isImapConfigured()) {
    const result = await pollInbox({ limit }).catch(
      (e: any) => ({ skipped: true as const, error: e?.message ?? "imap poll failed" }),
    )
    providers.push({ provider: "imap", result })
  } else {
    providers.push({ provider: "imap", result: { skipped: true, error: "IMAP not configured" } })
  }

  // ── Gmail (extension point) ─────────────────────────────────────────────
  // Gmail sending + OAuth exist; inbound polling (messages.list / history) is
  // not implemented yet. When it lands, add a pollGmailInbox() and push its
  // result here — the poll-cron and callers need no change.
  if (isGmailOAuthConfigured()) {
    providers.push({ provider: "gmail", result: { skipped: true, error: "Gmail inbound polling not implemented yet" } })
  }

  const totalNewReplies = providers.reduce(
    (n, p) => n + (("newReplies" in p.result ? p.result.newReplies : 0) ?? 0),
    0,
  )
  return { providers, totalNewReplies }
}
