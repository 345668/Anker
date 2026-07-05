/**
 * Legal templates → Word (.docx) export.
 *
 * Mirrors the pattern in lib/ai/docx-export.ts but bound to the legal
 * template Markdown subset (headings, paragraphs, lists, tables, bold,
 * italic, hr). The rendered Markdown body is fed through this — empty
 * field slots have already been replaced with "[ Label · TBD ]" plain
 * text by renderTemplate({ plainText: true }), so the DOCX is fully
 * editable in Word with TBD markers an outside-counsel reviewer can
 * fill in directly.
 *
 * Document chrome:
 *   - Letterhead block: bold title + small-grey source citation
 *   - Body in Times New Roman 11 (legal-document feel)
 *   - 1-inch margins on all sides
 *   - Section headings in display sans-serif at 14pt
 *   - Footer with page numbers
 */

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, PageNumber,
  Paragraph, Table, TableCell, TableRow, TextRun, WidthType, Footer,
  ShadingType, convertInchesToTwip,
} from "docx"

const FONT_BODY = "Times New Roman"
const FONT_DISPLAY = "Calibri"

export async function legalTemplateToDocxBuffer(args: {
  title: string
  source: string
  body: string  // plain-text rendered Markdown (TBD slots already inlined)
  fundName?: string
}): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []

  // Letterhead.
  children.push(
    new Paragraph({
      children: [new TextRun({ text: args.title, bold: true, size: 32, font: FONT_DISPLAY })],
      spacing: { after: 100 },
      alignment: AlignmentType.CENTER,
    }),
  )
  if (args.fundName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: args.fundName, italics: true, size: 22, font: FONT_DISPLAY, color: "555555" })],
        spacing: { after: 100 },
        alignment: AlignmentType.CENTER,
      }),
    )
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Source: ${args.source}`, size: 16, font: FONT_DISPLAY, color: "777777", italics: true })],
      spacing: { after: 300 },
      alignment: AlignmentType.CENTER,
    }),
  )
  children.push(hrParagraph())

  // Body.
  parseBodyIntoChildren(args.body, children)

  const doc = new Document({
    creator: "Anker · Legal & Compliance",
    title: args.title,
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", size: 16, font: FONT_DISPLAY, color: "888888" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT_DISPLAY, color: "888888" }),
              new TextRun({ text: " of ", size: 16, font: FONT_DISPLAY, color: "888888" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FONT_DISPLAY, color: "888888" }),
            ],
          })],
        }),
      },
      children,
    }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}

// ─── parser ──────────────────────────────────────────────────────────────

function parseBodyIntoChildren(body: string, children: (Paragraph | Table)[]): void {
  // Drop the document's own title block — the letterhead at the top of
  // the .docx already shows the title, so a duplicated H1 would render
  // twice. Skips the leading H1 plus any immediately-following H2 +
  // italic subtitle lines.
  const lines = stripLeadingTitleBlock(body).split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") { i++; continue }

    // Heading.
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      children.push(headingParagraph(h[2], level))
      i++; continue
    }
    // Horizontal rule.
    if (/^---+$/.test(line.trim())) {
      children.push(hrParagraph())
      i++; continue
    }
    // Table.
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[-:|\s]+\|/.test(lines[i + 1])) {
      const tbl: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        tbl.push(lines[i])
        i++
      }
      children.push(buildTable(tbl))
      continue
    }
    // Unordered list.
    if (/^[-*]\s+/.test(line)) {
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^[-*]\s+/, "")
        children.push(listParagraph(item, false))
        i++
      }
      continue
    }
    // Ordered list.
    if (/^\d+\.\s+/.test(line)) {
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\d+\.\s+/, "")
        children.push(listParagraph(item, true))
        i++
      }
      continue
    }
    // Paragraph — collect contiguous non-blank.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== "" && !/^#{1,4}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^[-*]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    if (para.length > 0) {
      children.push(new Paragraph({
        children: parseInlineRuns(para.join(" ")),
        spacing: { after: 120, line: 320 },
        alignment: AlignmentType.JUSTIFIED,
      }))
    }
  }
}

function headingParagraph(text: string, level: number): Paragraph {
  const sizes = [0, 32, 26, 22, 20]
  const size = sizes[level] ?? 20
  return new Paragraph({
    children: parseInlineRuns(text, { font: FONT_DISPLAY, bold: true, size }),
    spacing: { before: 240, after: 120 },
    heading: level === 1 ? HeadingLevel.HEADING_1
      : level === 2 ? HeadingLevel.HEADING_2
      : level === 3 ? HeadingLevel.HEADING_3
      : HeadingLevel.HEADING_4,
    border: level === 2
      ? { bottom: { color: "AAAAAA", style: BorderStyle.SINGLE, size: 4, space: 4 } }
      : undefined,
  })
}

function hrParagraph(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    border: { bottom: { color: "999999", style: BorderStyle.SINGLE, size: 6, space: 1 } },
    spacing: { after: 200 },
  })
}

function listParagraph(text: string, ordered: boolean): Paragraph {
  return new Paragraph({
    children: parseInlineRuns(text),
    bullet: ordered ? undefined : { level: 0 },
    numbering: ordered ? { reference: "ol", level: 0 } : undefined,
    spacing: { after: 80, line: 300 },
    indent: { left: 360 },
  })
}

function buildTable(lines: string[]): Table {
  const split = (l: string) =>
    l.split("|").map((c) => c.trim()).filter((_, ix, arr) =>
      !(ix === 0 && arr[0] === "") && !(ix === arr.length - 1 && arr[arr.length - 1] === ""),
    )
  const header = split(lines[0])
  const rows = lines.slice(2).map(split)
  const headerRow = new TableRow({
    children: header.map((h) => new TableCell({
      shading: { fill: "F0F0F0", type: ShadingType.CLEAR, color: "auto" },
      children: [new Paragraph({ children: parseInlineRuns(h, { bold: true }) })],
    })),
  })
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((c) => new TableCell({
      children: [new Paragraph({ children: parseInlineRuns(c) })],
    })),
  }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  })
}

// ─── inline parser: **bold** + *italic*, with shared run options ─────────

interface RunOpts { bold?: boolean; italics?: boolean; font?: string; size?: number; color?: string }

function parseInlineRuns(text: string, base: RunOpts = {}): TextRun[] {
  const runs: TextRun[] = []
  // Strip escaped underscores used in signature lines: \_\_\_ → ___
  let working = text.replace(/\\_/g, "_")
  // Bold / italic — non-greedy single-line.
  const BOLD = /\*\*([^*]+)\*\*/
  const ITAL = /\*([^*]+)\*/
  while (working.length > 0) {
    const candidates: Array<{ idx: number; len: number; m: RegExpExecArray; kind: "bold" | "ital" }> = []
    const b = BOLD.exec(working)
    if (b) candidates.push({ idx: b.index, len: b[0].length, m: b, kind: "bold" })
    const i = ITAL.exec(working)
    if (i) candidates.push({ idx: i.index, len: i[0].length, m: i, kind: "ital" })
    if (candidates.length === 0) {
      if (working) runs.push(new TextRun({ text: working, font: base.font ?? FONT_BODY, size: base.size ?? 22, ...base }))
      break
    }
    candidates.sort((a, b) => a.idx - b.idx)
    const next = candidates[0]
    if (next.idx > 0) {
      runs.push(new TextRun({ text: working.slice(0, next.idx), font: base.font ?? FONT_BODY, size: base.size ?? 22, ...base }))
    }
    runs.push(new TextRun({
      text: next.m[1],
      bold: next.kind === "bold" || base.bold,
      italics: next.kind === "ital" || base.italics,
      font: base.font ?? FONT_BODY,
      size: base.size ?? 22,
      color: base.color,
    }))
    working = working.slice(next.idx + next.len)
  }
  return runs
}

/** Strip the leading title block — same shape as the on-screen
 *  renderer's helper so the .docx and the browser view stay in sync. */
function stripLeadingTitleBlock(md: string): string {
  const lines = md.split("\n")
  let i = 0
  while (i < lines.length && lines[i].trim() === "") i++
  if (i >= lines.length || !/^#\s+/.test(lines[i])) return md
  i++
  while (i < lines.length) {
    const l = lines[i].trim()
    if (l === "") { i++; continue }
    if (/^##\s+/.test(l)) { i++; continue }
    if (/^\*[^*].*\*$/.test(l)) { i++; continue }
    break
  }
  return lines.slice(i).join("\n")
}
