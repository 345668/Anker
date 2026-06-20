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

/**
 * Pre-process the AI-generated body so the block splitter can recognise
 * structure even when the generator forgot blank lines between sections.
 * Without this the renderer sees "### Heading body body body ### Heading
 * body" as one giant paragraph.
 */
function normaliseArticleSource(md: string): string {
  // NBSP (U+00A0) -> regular space before any structural matching.
  let s = md.replace(/\r\n/g, "\n").replace(/ /g, " ")
  // Insert blank line before any heading that follows a sentence terminator on the same line.
  s = s.replace(/([.!?])\s+(#{1,6}\s+)/g, "$1\n\n$2")
  // Insert blank line before any heading that follows non-blank text without two newlines.
  s = s.replace(/([^\n])\n(#{1,6}\s+)/g, "$1\n\n$2")
  // AI sometimes uses "1. **Title**" as a section header — promote those too.
  s = s.replace(/([.!?])\s+(\d+\.\s+\*\*[^*]+\*\*)/g, "$1\n\n$2")
  // Same for bullet/numbered list items embedded mid-paragraph.
  s = s.replace(/([^\n])\n([-*]\s+)/g, "$1\n\n$2")
  s = s.replace(/([^\n])\n(\d+\.\s+)/g, "$1\n\n$2")
  // Collapse runs of >2 blank lines back down to exactly 2.
  s = s.replace(/\n{3,}/g, "\n\n")
  // Typography pass: tighten doubled hyphens to em-dashes, pad em-dashes
  // consistently, normalise spaces around punctuation. Smart quotes left
  // alone (they're typographically correct already).
  s = s
    .replace(/(\w)--(\w)/g, "$1—$2")
    .replace(/\s*—\s*/g, " — ")
    .replace(/[ \t]+,/g, ",")
    .replace(/[ \t]+\./g, ".")
    .replace(/[ \t]+\?/g, "?")
    .replace(/[ \t]+!/g, "!")
  return s
}

/** Render newsroom markdown to a structured HTML string. */
export function renderArticleHtml(md: string): string {
  if (!md) return ""
  // Normalise the source via the dedicated pre-processor, then split on blank lines.
  const blocks = normaliseArticleSource(md).split(/\n{2,}/)
  const out: string[] = []

  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue

    // Heading. AI generators frequently emit `### Heading Title And Then Body
    // Text All On One Line.` — when the captured text is much longer than a
    // reasonable heading (60+ chars AND contains a sentence terminator), split
    // the heading from the body and emit both.
    const h = block.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      const level = Math.min(4, h[1].length)
      const tag = level === 1 ? "h2" : level === 2 ? "h2" : level === 3 ? "h3" : "h4"
      let title = h[2].trim()
      let rest = ""
      // Strategy 0: if the captured text contains a nested heading marker
      // (e.g. "Deal / Event Breakdown #### 1. Title"), the second marker is
      // a separate block. Split there and re-feed the remainder.
      const nested = title.match(/^(.+?)\s+(#{1,4}\s+.+)$/)
      if (nested) {
        title = nested[1].trim()
        rest = nested[2].trim()
      } else if (title.length > 60) {
        // Strategy 1: split at the first sentence-end punctuation (.!?) inside
        // the title text.
        const m = title.match(/^([^.!?]{4,80}[.!?])\s+(.+)$/)
        if (m) {
          title = m[1].replace(/[.!?]+$/, "").trim()
          rest = m[2].trim()
        } else {
          // Strategy 2: find the title-case-to-body-case boundary. A heading
          // title is short, title-cased, and is followed by a body sentence
          // that typically begins with "The/A/An/These/This/With/As/For" +
          // lowercase. Cut at the first such boundary.
          const boundary = title.match(/^([A-Z][\w&,\- /]{2,80}?)\s+(The|A|An|These|This|With|As|For|While|Sovereign|Meanwhile|However|Qatar|In|On|At|Beyond|Despite|Driven)\s+([a-z].+)$/)
          if (boundary) {
            title = boundary[1].trim().replace(/[,;:]+$/, "")
            rest = `${boundary[2]} ${boundary[3]}`.trim()
          } else {
            // Strategy 3 (last resort): cap the title at 8 words.
            const words = title.split(/\s+/)
            if (words.length > 8) {
              title = words.slice(0, 8).join(" ")
              rest = words.slice(8).join(" ")
            }
          }
        }
      }
      out.push(`<${tag}>${inline(title)}</${tag}>`)
      if (rest) {
        // If the rest happens to also start with a heading marker, recursively
        // render it so we don't lose downstream structure.
        if (/^#{1,4}\s+/.test(rest)) {
          out.push(renderArticleHtml(rest))
        } else {
          out.push(`<p>${inline(rest)}</p>`)
        }
      }
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
