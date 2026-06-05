/**
 * Server-side markdown → structured HTML for newsroom articles.
 *
 * The AI-generated article content uses a consistent format:
 *   ### Section heading
 *   Body paragraphs separated by blank lines.
 *   Inline citations like (Bloomberg, 2026a) or [Reuters, 2026b].
 *   Numbered list items "1." / "2." or bullets "- " / "* ".
 *
 * We do NOT want to ship a heavy markdown library to the server bundle.
 * This is a focused parser for the shape the newsroom actually produces:
 *
 *   ##/###     →  <h2>/<h3>
 *   **bold**   →  <strong>
 *   *italic*   →  <em>
 *   - / * / 1. →  <ul>/<ol><li>
 *   blank line →  paragraph break
 *   (Source, Year) →  wrapped in a citation span for styling
 *
 * Output is sanitized: no HTML tags from the input are preserved; only
 * the markdown that we explicitly translate ends up as HTML.  Safe to
 * pass to dangerouslySetInnerHTML.
 */

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c])
}

/** Apply inline-level markdown to escaped text. */
function inline(text: string): string {
  let t = esc(text)
  // **bold**
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  // *italic* — must NOT match within already-bolded segments; we run after bold replace
  t = t.replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,;!?)]|$)/g, "$1<em>$2</em>")
  // [link text](url) — only http(s) URLs
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, href) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  )
  // Citations like (Bloomberg, 2026a) or [Reuters, 2026]
  t = t.replace(
    /(\(|\[)([A-Z][A-Za-z0-9&.\- ]{2,40}),\s*(\d{4}[a-z]?)(\)|\])/g,
    (_m, openB, src, year, closeB) =>
      `<span class="cite">${openB}<span class="cite-src">${src}</span>, <span class="cite-year">${year}</span>${closeB}</span>`,
  )
  return t
}

/** Render newsroom markdown to a structured HTML string. */
export function renderArticleHtml(md: string): string {
  if (!md) return ""
  // Normalise line endings and split into logical blocks on blank lines.
  const blocks = md.replace(/\r\n/g, "\n").replace(/ /g, " ").split(/\n{2,}/)
  const out: string[] = []

  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue

    // Heading
    const h = block.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      const level = Math.min(4, h[1].length)
      const tag = level === 1 ? "h2" : level === 2 ? "h2" : level === 3 ? "h3" : "h4"
      out.push(`<${tag}>${inline(h[2].trim())}</${tag}>`)
      continue
    }

    // Bulleted list (lines starting with - or *)
    const bulletLines = block.split("\n")
    if (bulletLines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const items = bulletLines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")
      out.push(`<ul>${items}</ul>`)
      continue
    }

    // Numbered list (lines starting with N.)
    if (bulletLines.every((l) => /^\s*\d+\.\s+/.test(l))) {
      const items = bulletLines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("")
      out.push(`<ol>${items}</ol>`)
      continue
    }

    // Blockquote
    if (bulletLines.every((l) => /^\s*>\s?/.test(l))) {
      const text = bulletLines.map((l) => l.replace(/^\s*>\s?/, "")).join(" ")
      out.push(`<blockquote>${inline(text)}</blockquote>`)
      continue
    }

    // Paragraph — preserve internal line breaks as soft breaks
    const paraText = bulletLines.join(" ").replace(/\s+/g, " ").trim()
    if (paraText) out.push(`<p>${inline(paraText)}</p>`)
  }
  return out.join("\n")
}

/** Compute approximate read time from the article content. */
export function readTimeMinutes(md: string | null | undefined): number {
  if (!md) return 1
  const words = md.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}

/** Pull a list of source citations from the article — keyed by name + year. */
export function extractCitations(md: string | null | undefined): Array<{ source: string; year: string }> {
  if (!md) return []
  const seen = new Set<string>()
  const out: Array<{ source: string; year: string }> = []
  const re = /[\[(]([A-Z][A-Za-z0-9&.\- ]{2,40}),\s*(\d{4}[a-z]?)[\])]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const key = `${m[1].trim().toLowerCase()}|${m[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: m[1].trim(), year: m[2] })
  }
  return out
}
