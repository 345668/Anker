/**
 * Anker document house style — one theme every document engine uses so all generated
 * output (Word via `docx`, and by extension reports, data-room packages, agent/chat
 * deliverables) carries the same branding as the white paper: the dark-mode medallion
 * logo on the cover + running header, a faint chrome ANKER watermark, the editorial
 * serif + accent-red styling, and an `an-ker.de · N` footer.
 *
 * Usage:  brandedDocument({ meta, children })  →  a fully-branded docx `Document`.
 * Assets are embedded (lib/branding/assets.ts) so this is serverless-safe.
 */
import {
  Document, Header, Footer, Paragraph, TextRun, ImageRun, Table,
  AlignmentType, BorderStyle, PageNumber, LevelFormat, LevelSuffix,
  TabStopType, TabStopPosition,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
  HorizontalPositionAlign, VerticalPositionAlign, TextWrappingType,
  type ISectionOptions,
} from "docx"
import { LOGO_DARK_PNG, LOGO_DARK_DIM, WATERMARK_PNG, WATERMARK_DIM } from "./assets"

export const BRAND = {
  accent: "E5380F",   // Anker red — cover rule, eyebrows, links (NOT body headings)
  ink: "111111",      // headings + strong text  (white paper \color{ink} = 17,17,17)
  body: "1A1A1A",     // body text (near-black)
  muted: "5A5A5A",    // header / footer / meta  (white paper muted = 90,90,90)
  rule: "E1E1E1",     // hairlines               (white paper rule = 225,225,225)
  serif: "Georgia",   // editorial serif — ubiquitous in Word/Pages
  mono: "Consolas",
  tagline: "The AI Venture Operating System",
  url: "an-ker.de",
} as const

export interface BrandDocMeta {
  title: string
  /** Header (right) + cover subtitle. Defaults to the tagline in the header. */
  subtitle?: string
  author?: string
  /** e.g. "Founder & Author". */
  role?: string
  /** e.g. "Version 1.0  ·  2026-08  ·  an-ker.de". Defaults to date · url. */
  metaLine?: string
}

const logoBuf = () => Buffer.from(LOGO_DARK_PNG, "base64")
const wmBuf = () => Buffer.from(WATERMARK_PNG, "base64")
const fit = (d: { w: number; h: number }, width: number) => ({ width, height: Math.round(d.h * (width / d.w)) })

/** Faint centered watermark, anchored in the header so it repeats on every body page. */
function watermarkImage(): ImageRun {
  return new ImageRun({
    type: "png",
    data: wmBuf(),
    transformation: fit(WATERMARK_DIM, 360),
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
      behindDocument: true, allowOverlap: true,
      wrap: { type: TextWrappingType.NONE },
    },
  })
}

/** Running header: medallion logo (left) · subtitle (right) · thin rule, + watermark. */
function brandedHeader(meta: BrandDocMeta): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.rule } },
        spacing: { after: 120 },
        children: [
          new ImageRun({ type: "png", data: logoBuf(), transformation: fit(LOGO_DARK_DIM, 58) }),
          new TextRun({ text: `\t${meta.subtitle ?? BRAND.tagline}`, font: BRAND.serif, size: 16, color: BRAND.muted }),
          watermarkImage(),
        ],
      }),
    ],
  })
}

/** Footer: an-ker.de · <page>, centered + muted. */
function brandedFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${BRAND.url}   ·   `, font: BRAND.serif, size: 15, color: BRAND.muted }),
          new TextRun({ children: [PageNumber.CURRENT], font: BRAND.serif, size: 15, color: BRAND.muted }),
        ],
      }),
    ],
  })
}

/** Cover page: centered medallion, serif title, short accent rule, author, meta line. */
export function coverParagraphs(meta: BrandDocMeta): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ children: [], spacing: { before: 2600 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 360 },
      children: [new ImageRun({ type: "png", data: logoBuf(), transformation: fit(LOGO_DARK_DIM, 190) })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: meta.title, font: BRAND.serif, size: 40, color: BRAND.ink })],
    }),
    // short centered accent rule (indent narrows the border width, centering it)
    new Paragraph({
      indent: { left: 3600, right: 3600 }, spacing: { after: 320 }, children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 20, color: BRAND.accent } },
    }),
  ]
  if (meta.subtitle) out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 420 },
    children: [new TextRun({ text: meta.subtitle, italics: true, font: BRAND.serif, size: 22, color: BRAND.ink })],
  }))
  if (meta.author) out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: meta.author, bold: true, font: BRAND.serif, size: 24, color: BRAND.ink })],
  }))
  if (meta.role) out.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 520 },
    children: [new TextRun({ text: meta.role, font: BRAND.serif, size: 18, color: BRAND.muted })],
  }))
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: meta.metaLine ?? `${new Date().toISOString().slice(0, 7)}   ·   ${BRAND.url}`, font: BRAND.serif, size: 18, color: BRAND.muted })],
  }))
  return out
}

/** docx style set matching the white paper: 11pt justified serif body, dark-ink bold
 *  serif headings (\color{ink}, not accent), mono for code. Section numbers are added
 *  by the "headings" numbering config below. Sizes track LaTeX \Large / \large /
 *  \normalsize at an 11pt base. */
function brandStyles() {
  const heading = (id: string, size: number) => ({
    id, name: id, basedOn: "Normal", next: "Normal", quickFormat: true,
    run: { font: BRAND.serif, bold: true, size, color: BRAND.ink },
    paragraph: { spacing: { before: 280, after: 120 }, keepNext: true },
  })
  return {
    default: {
      document: {
        run: { font: BRAND.serif, size: 22, color: BRAND.body },              // 11pt
        paragraph: { spacing: { after: 140 }, alignment: AlignmentType.JUSTIFIED }, // parskip, justified
      },
    },
    paragraphStyles: [heading("Heading1", 29), heading("Heading2", 24), heading("Heading3", 22)],
  }
}

/** Multilevel section numbering (1, 1.1, 1.1.1) tied to the heading styles — matches the
 *  white paper's \thesection numbering, with a space after the number. */
function headingNumbering() {
  const lvl = (level: number, text: string) => ({
    level, format: LevelFormat.DECIMAL, text, alignment: AlignmentType.START,
    suffix: LevelSuffix.SPACE,
    style: { run: { font: BRAND.serif, bold: true, color: BRAND.ink }, paragraph: { indent: { left: 0, hanging: 0 } } },
  })
  return { reference: "headings", levels: [lvl(0, "%1"), lvl(1, "%1.%2"), lvl(2, "%1.%2.%3")] }
}

/** Assemble a fully-branded document: cover page (no header/footer) + body pages with the
 *  running header, watermark, and footer. `children` is the body flow (Paragraphs/Tables). */
export function brandedDocument(args: { meta: BrandDocMeta; children: (Paragraph | Table)[] }): Document {
  const { meta, children } = args
  const cover = coverParagraphs(meta)
  // Body starts on a new page after the cover.
  const body: (Paragraph | Table)[] = [
    new Paragraph({ children: [], pageBreakBefore: true }),
    ...children,
  ]
  const section: ISectionOptions = {
    properties: {
      titlePage: true, // first page (cover) uses the `first` header/footer (empty)
      page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
    },
    headers: { default: brandedHeader(meta), first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: brandedFooter(), first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children: [...cover, ...body],
  }
  return new Document({
    creator: "Anker",
    title: meta.title,
    styles: brandStyles(),
    numbering: {
      config: [
        { reference: "ol", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] },
        headingNumbering(),
      ],
    },
    sections: [section],
  })
}

// ── Cross-engine brand exports (pptx / xlsx / pdf-lib) ──────────────────────
/** Data URLs for engines that take image data (pptxgenjs addImage). */
export const LOGO_DATA_URL = `data:image/png;base64,${LOGO_DARK_PNG}`
export const WATERMARK_DATA_URL = `data:image/png;base64,${WATERMARK_PNG}`
/** Raw PNG bytes for engines that embed images directly (pdf-lib embedPng). */
export const logoPngBytes = () => Buffer.from(LOGO_DARK_PNG, "base64")
export const watermarkPngBytes = () => Buffer.from(WATERMARK_PNG, "base64")

/** Header without the watermark (logo + subtitle + thin rule) — for formatting-sensitive
 *  documents (legal templates) where a marketing watermark behind text is inappropriate. */
export function plainBrandedHeader(subtitle?: string): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.rule } },
        spacing: { after: 120 },
        children: [
          new ImageRun({ type: "png", data: logoBuf(), transformation: fit(LOGO_DARK_DIM, 58) }),
          new TextRun({ text: `\t${subtitle ?? BRAND.tagline}`, font: BRAND.serif, size: 16, color: BRAND.muted }),
        ],
      }),
    ],
  })
}
