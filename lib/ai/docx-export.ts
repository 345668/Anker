/**
 * Markdown → .docx converter for Anker reports.
 *
 * Supports the subset of Markdown the matching reports actually use:
 *   - # H1 / ## H2 / ### H3
 *   - paragraphs
 *   - bullet lists (- ...) and numbered lists (1. ...)
 *   - GFM-style tables   | a | b | c |
 *   - bold (**text**) and italics (*text*)
 *   - horizontal rules (---)
 *   - inline `code` (rendered monospaced)
 *
 * No HTML, no images, no nested lists. Sufficient for the methodology
 * docs, outreach plans, and meeting agendas this codebase generates.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"

// ─── Public ────────────────────────────────────────────────────────────────
export interface ScoreRow {
  /** Dimension name (e.g. "Clarity & narrative" / "GP background"). */
  label: string
  /** 0..max (default 10). */
  score: number
  /** Default 10. */
  max?: number
  /** Optional short comment shown alongside the bar (truncated to 78 chars). */
  comment?: string
}

export interface MarkdownToDocxOpts {
  /** Optional bar chart inserted right after the title block. */
  scoreChart?: { title?: string; rows: ScoreRow[] }
}

export async function markdownToDocxBuffer(
  markdown: string,
  title?: string,
  opts: MarkdownToDocxOpts = {},
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []
  if (title) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 36 })],
        spacing: { after: 200 },
      }),
    )
  }
  if (opts.scoreChart && opts.scoreChart.rows.length) {
    children.push(...buildScoreChartTable(opts.scoreChart.rows, opts.scoreChart.title))
  }
  for (const block of parseBlocks(markdown)) {
    children.push(...renderBlock(block))
  }
  const doc = new Document({
    creator: "Anker",
    title: title ?? "Anker report",
    sections: [{ properties: {}, children }],
  })
  const blob = await Packer.toBuffer(doc)
  return blob
}

// ─── Score bar-chart (pure docx — no image deps) ───────────────────────────
//
// Renders a horizontal "fill bar" per dimension as a 20-segment table row.
// Cells in the filled portion are shaded; cells in the empty portion stay
// light grey. Reads cleanly in every Word version (no SVG/PNG required)
// and preserves accessibility (each row also carries the numeric score).
//
// Color tiers:
//   0-39%  red    (#DC2626)
//   40-69% amber  (#D97706)
//   70-100% green (#059669)
export function buildScoreChartTable(rows: ScoreRow[], chartTitle?: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  if (chartTitle) {
    out.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: chartTitle, bold: true, size: 28 })],
        spacing: { before: 240, after: 120 },
      }),
    )
  }
  const SEGMENTS = 20 // 5% resolution
  const tableRows: TableRow[] = rows.map((r) => {
    const max = r.max ?? 10
    const pct = Math.max(0, Math.min(1, r.score / max))
    const filledSegments = Math.round(pct * SEGMENTS)
    const fillColor = pct < 0.4 ? "DC2626" : pct < 0.7 ? "D97706" : "059669"

    const labelCell = new TableCell({
      width: { size: 22, type: WidthType.PERCENTAGE },
      borders: borderlessBorders(),
      children: [new Paragraph({ children: [new TextRun({ text: r.label, bold: true, size: 18 })] })],
    })

    const barCells: TableCell[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      const isFilled = i < filledSegments
      barCells.push(
        new TableCell({
          width: { size: 5, type: WidthType.PERCENTAGE },
          shading: isFilled ? { fill: fillColor } : { fill: "F3F4F6" },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" },
          },
          children: [new Paragraph({ children: [new TextRun({ text: "" })] })],
        }),
      )
    }
    const barWrapperCell = new TableCell({
      width: { size: 58, type: WidthType.PERCENTAGE },
      borders: borderlessBorders(),
      children: [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: barCells })],
        }),
      ],
    })

    const scoreCell = new TableCell({
      width: { size: 10, type: WidthType.PERCENTAGE },
      borders: borderlessBorders(),
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `${r.score.toFixed(1)} / ${max}`, bold: true, size: 18, color: fillColor })],
        }),
      ],
    })

    const commentText = (r.comment ?? "").length > 78
      ? (r.comment ?? "").slice(0, 76) + "…"
      : (r.comment ?? "")
    const commentCell = new TableCell({
      width: { size: 10, type: WidthType.PERCENTAGE },
      borders: borderlessBorders(),
      children: [new Paragraph({ children: [new TextRun({ text: commentText, italics: true, size: 16, color: "6B7280" })] })],
    })

    return new TableRow({ children: [labelCell, barWrapperCell, scoreCell, commentCell] })
  })
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: borderlessBorders(),
      rows: tableRows,
    }),
  )
  out.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 200 } }))
  return out
}

function borderlessBorders() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  }
}

// ─── Block parser ──────────────────────────────────────────────────────────
type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] }

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (!ln.trim()) { i++; continue }

    // Headings
    let m = ln.match(/^(#{1,3})\s+(.*)$/)
    if (m) {
      const level = m[1].length
      blocks.push({ type: ("h" + level) as Block["type"], text: m[2].trim() } as Block)
      i++; continue
    }

    // Horizontal rule
    if (/^-{3,}$/.test(ln.trim())) { blocks.push({ type: "hr" }); i++; continue }

    // Table — header row | --- |
    if (ln.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s|:-]+\|$/)) {
      const headers = splitRow(ln)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(ln)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, "").trim())
        i++
      }
      blocks.push({ type: "ul", items }); continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(ln)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, "").trim())
        i++
      }
      blocks.push({ type: "ol", items }); continue
    }

    // Paragraph (gather until blank line)
    const buf: string[] = [ln.trim()]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-*+]\s|\d+\.\s|\|)/.test(lines[i])) {
      buf.push(lines[i].trim())
      i++
    }
    blocks.push({ type: "p", text: buf.join(" ") })
  }
  return blocks
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
}

// ─── Block renderer ────────────────────────────────────────────────────────
function renderBlock(b: Block): (Paragraph | Table)[] {
  if (b.type === "h1") return [headingParagraph(b.text, HeadingLevel.HEADING_1, 32)]
  if (b.type === "h2") return [headingParagraph(b.text, HeadingLevel.HEADING_2, 26)]
  if (b.type === "h3") return [headingParagraph(b.text, HeadingLevel.HEADING_3, 22)]
  if (b.type === "p") return [new Paragraph({ children: inlineRuns(b.text), spacing: { after: 120 } })]
  if (b.type === "hr") return [new Paragraph({ border: { bottom: { color: "AAAAAA", style: BorderStyle.SINGLE, size: 6 } }, spacing: { after: 200 } })]
  if (b.type === "ul") {
    return b.items.map((t) => new Paragraph({ children: inlineRuns(t), bullet: { level: 0 } }))
  }
  if (b.type === "ol") {
    return b.items.map((t) =>
      new Paragraph({ children: inlineRuns(t), numbering: { reference: "ol", level: 0 } as any }),
    )
  }
  if (b.type === "table") return [renderTable(b.headers, b.rows)]
  return []
}

function headingParagraph(text: string, level: any, size: number): Paragraph {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, size })],
    spacing: { before: 240, after: 120 },
  })
}

function renderTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          shading: { fill: "F2F2F2" },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        }),
    ),
  })
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: headers.map(
          (_, i) =>
            new TableCell({
              children: [new Paragraph({ children: inlineRuns(r[i] ?? "") })],
            }),
        ),
      }),
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  })
}

// ─── Inline run parser (bold / italic / inline code) ───────────────────────
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Tokenize into segments by **bold**, *italic*, `code`
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index) }))
    const tok = m[0]
    if (tok.startsWith("**")) runs.push(new TextRun({ text: tok.slice(2, -2), bold: true }))
    else if (tok.startsWith("`")) runs.push(new TextRun({ text: tok.slice(1, -1), font: { name: "Courier New" } }))
    else runs.push(new TextRun({ text: tok.slice(1, -1), italics: true }))
    last = m.index + tok.length
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) }))
  if (!runs.length) runs.push(new TextRun({ text: text || "" }))
  return runs
}
