import "server-only"
import { decryptSecret } from "@/lib/db/secrets"
import { sql } from "@/lib/db"
import { latestBrief, listTurns, type SessionRow } from "./sessions"
import { latestNotes } from "./notes"

/** A finished call as one Markdown document (docs/architecture/62 section 9): notes, figures with their sentences, the transcript with times and speakers, and the suggestions that were shown. */
const mmss = (ms: number | null) => (ms == null ? "" : `[${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}] `)
const bullets = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "Not recorded")
export async function exportMarkdown(s: SessionRow, opts: { suggestions?: boolean; includeEmail?: boolean } = {}): Promise<string> {
  const [turns, notes, brief] = [await listTurns(s.id, { limit: 20000 }), await latestNotes(s.id), await latestBrief(s.id)]
  const out: string[] = [`# ${s.title || "Halyard call"}`, `${new Date(s.started_at).toISOString().slice(0, 16).replace("T", " ")} UTC · ${s.mode} · ${Math.round(s.audio_seconds / 60)} min of audio`]
  if (notes) {
    const n = notes.body
    out.push("## Summary", n.summary || "Not recorded", "## Key points", bullets(n.keyPoints), "## Decisions", bullets(n.decisions), "## Action items", bullets(n.actionItems), "## Follow-up", bullets(n.followUp))
    if (n.figures.length) out.push("## Figures", n.figures.map((f) => `- **${f.value}**${f.who ? ` (${f.who})` : ""}: ${f.context}`).join("\n"))
    if (n.email && opts.includeEmail !== false) out.push("## Follow-up email (draft)", n.email.split("\n").map((l) => `> ${l}`).join("\n"))
  } else out.push("## Notes", "No notes were written for this call.")
  if (brief?.brief) out.push("## Running brief", brief.brief)
  out.push("## Transcript", turns.length ? turns.map((t) => `${mmss(t.startedMs)}**${t.channel === "you" ? "You" : t.channel === "them" ? "Them" : "Speaker"}:** ${t.text}`).join("\n\n") : "No transcript.")
  if (opts.suggestions) {
    const sug = (await sql`SELECT action, text_enc, requested_at FROM halyard_suggestions WHERE session_id = ${s.id} ORDER BY requested_at`) as any[]
    if (sug.length) out.push("## Suggestions shown", sug.map((r) => `- **${r.action}** — ${(decryptSecret(r.text_enc) ?? "").replace(/\n+/g, " ")}`).join("\n"))
  }
  return out.join("\n\n") + "\n"
}
