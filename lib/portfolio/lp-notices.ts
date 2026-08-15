import { sql } from "@/lib/db"

/**
 * Per-LP notices log — the Carta "Email" sub-tab under Partners. A read-only
 * union of the notices each LP has been issued: capital calls and distributions.
 * (Quarterly reports are fund-wide and shown on the reporting surface.)
 *
 * There is no separate email-delivery table, so "sent" is the notice's sent_at
 * (capital calls) or created_at (distributions), and "status" is the per-LP line
 * status (pending / sent / paid / notified / …).
 */

export interface LpNotice {
  partner: string
  subject: string
  type: "Capital call" | "Distribution"
  at: string | null
  status: string
  amount: number
}

export async function listLpNotices(fundId: string): Promise<LpNotice[]> {
  try {
    const rows = await sql`
      SELECT partner, subject, type, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS at, status, amount
      FROM (
        SELECT l.lp_name                         AS partner,
               cc.title                          AS subject,
               'Capital call'                    AS type,
               COALESCE(cc.sent_at, cc.created_at) AS at,
               cli.status                        AS status,
               cli.amount                        AS amount
        FROM capital_call_line_items cli
        JOIN capital_calls cc ON cc.id = cli.call_id
        JOIN fund_lps      l  ON l.id  = cli.fund_lp_id
        WHERE cc.fund_id = ${fundId}
        UNION ALL
        SELECT l.lp_name,
               d.title,
               'Distribution',
               d.created_at,
               dli.status,
               dli.amount
        FROM distribution_line_items dli
        JOIN distributions d ON d.id = dli.distribution_id
        JOIN fund_lps      l ON l.id = dli.fund_lp_id
        WHERE d.fund_id = ${fundId}
      ) x
      ORDER BY at DESC NULLS LAST
      LIMIT 300
    `
    return (rows as any[]).map((r) => ({
      partner: r.partner,
      subject: r.subject,
      type: r.type,
      at: r.at ?? null,
      status: r.status ?? "pending",
      amount: Number(r.amount ?? 0),
    }))
  } catch {
    return []
  }
}
