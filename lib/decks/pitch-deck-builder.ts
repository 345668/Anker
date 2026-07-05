/**
 * Pitch-deck builder.
 *
 * One DeckSpec → two artifacts (.pptx and/or .pdf).  Used by the AI
 * assistant's create_pitch_deck and improve_pitch_deck tools.
 *
 * Slide layout (intentionally simple, looks clean on any projector):
 *   - Title slide:   large title + subtitle (centered)
 *   - Content slide: title top-left, optional image right half,
 *                    body bullets left half (or full width if no image)
 *   - Closer:        large headline + CTA
 *
 * Images are optional per slide.  When `imagePrompt` is set, the caller
 * pre-generates a PNG via the AI image provider and passes the buffer in;
 * the builder doesn't make AI calls itself.
 */

import PptxGenJS from "pptxgenjs"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

export interface SlideSpec {
  /** Slide kind — drives layout. */
  kind?: "title" | "content" | "closer"
  /** Slide title (top of the slide). */
  title: string
  /** Subtitle (title slide) or one-liner under the title (content). */
  subtitle?: string
  /** Bullet body lines (content slides). One string per bullet. */
  bullets?: string[]
  /** Long-form body text — used when bullets is empty / not appropriate. */
  body?: string
  /** Optional speaker notes. */
  notes?: string
  /** Optional image — pass a PNG/JPEG buffer.  Caller is responsible for
   *  generating it (typically via the configured AI image provider). */
  image?: Buffer
  /** Original prompt used to make the image — surfaced as alt text. */
  imagePrompt?: string
}

export interface DeckSpec {
  /** Title of the deck (appears on the title slide + as PPT title). */
  title: string
  /** Optional subtitle on the title slide. */
  subtitle?: string
  /** Optional author / company name. */
  author?: string
  /** Theme tokens — hex colors without the leading '#'. */
  theme?: {
    /** Primary accent (heading + closer bar).  Default: dark slate. */
    accent?: string
    /** Page background.  Default: white. */
    background?: string
    /** Body text color.  Default: near-black. */
    text?: string
    /** Muted text (subtitle, captions).  Default: medium grey. */
    muted?: string
  }
  slides: SlideSpec[]
}

const DEFAULT_THEME = {
  accent: "0F172A",     // slate-900
  background: "FFFFFF",
  text: "111827",       // gray-900
  muted: "6B7280",      // gray-500
}

function normaliseTheme(t?: DeckSpec["theme"]) {
  return {
    accent: (t?.accent ?? DEFAULT_THEME.accent).replace(/^#/, ""),
    background: (t?.background ?? DEFAULT_THEME.background).replace(/^#/, ""),
    text: (t?.text ?? DEFAULT_THEME.text).replace(/^#/, ""),
    muted: (t?.muted ?? DEFAULT_THEME.muted).replace(/^#/, ""),
  }
}

// ─── PowerPoint generator ──────────────────────────────────────────────────
export async function buildDeckPptx(spec: DeckSpec): Promise<Buffer> {
  const pres = new PptxGenJS()
  const theme = normaliseTheme(spec.theme)

  pres.title = spec.title
  if (spec.author) pres.author = spec.author
  pres.company = spec.author ?? "Anker"
  pres.layout = "LAYOUT_WIDE"  // 13.333 × 7.5 inches, 16:9

  const PAGE_W = 13.333
  const PAGE_H = 7.5

  for (const s of spec.slides) {
    const slide = pres.addSlide()
    slide.background = { color: theme.background }
    if (s.notes) slide.addNotes(s.notes)

    if (s.kind === "title") {
      slide.addText(s.title, {
        x: 0.7, y: PAGE_H / 2 - 1.1, w: PAGE_W - 1.4, h: 1.4,
        fontSize: 54, bold: true, color: theme.accent, fontFace: "Helvetica",
        align: "center",
      })
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.7, y: PAGE_H / 2 + 0.3, w: PAGE_W - 1.4, h: 0.6,
          fontSize: 22, color: theme.muted, fontFace: "Helvetica",
          align: "center",
        })
      }
      // accent bar at bottom
      slide.addShape(pres.ShapeType.rect, {
        x: PAGE_W / 2 - 0.7, y: PAGE_H - 1.3, w: 1.4, h: 0.08,
        fill: { color: theme.accent }, line: { color: theme.accent },
      })
      continue
    }

    if (s.kind === "closer") {
      slide.addText(s.title, {
        x: 0.7, y: PAGE_H / 2 - 1.0, w: PAGE_W - 1.4, h: 1.4,
        fontSize: 48, bold: true, color: theme.accent, fontFace: "Helvetica",
        align: "center",
      })
      if (s.subtitle || s.body) {
        slide.addText(String(s.subtitle ?? s.body ?? ""), {
          x: 0.7, y: PAGE_H / 2 + 0.5, w: PAGE_W - 1.4, h: 1.5,
          fontSize: 20, color: theme.muted, fontFace: "Helvetica",
          align: "center",
        })
      }
      continue
    }

    // Content slide
    const hasImage = !!s.image
    const textWidth = hasImage ? PAGE_W / 2 - 0.6 : PAGE_W - 1.4
    slide.addText(s.title, {
      x: 0.7, y: 0.55, w: PAGE_W - 1.4, h: 0.8,
      fontSize: 32, bold: true, color: theme.accent, fontFace: "Helvetica",
    })
    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: 0.7, y: 1.35, w: PAGE_W - 1.4, h: 0.5,
        fontSize: 16, italic: true, color: theme.muted, fontFace: "Helvetica",
      })
    }
    const bodyY = s.subtitle ? 2.0 : 1.6
    if (s.bullets && s.bullets.length) {
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: { type: "bullet" } } })),
        {
          x: 0.7, y: bodyY, w: textWidth, h: PAGE_H - bodyY - 0.6,
          fontSize: 18, color: theme.text, fontFace: "Helvetica",
          valign: "top", paraSpaceAfter: 8,
        },
      )
    } else if (s.body) {
      slide.addText(s.body, {
        x: 0.7, y: bodyY, w: textWidth, h: PAGE_H - bodyY - 0.6,
        fontSize: 18, color: theme.text, fontFace: "Helvetica",
        valign: "top",
      })
    }
    if (s.image) {
      slide.addImage({
        data: `data:image/png;base64,${s.image.toString("base64")}`,
        x: PAGE_W / 2 + 0.2, y: 1.8, w: PAGE_W / 2 - 0.9, h: PAGE_H - 2.4,
        sizing: { type: "contain", w: PAGE_W / 2 - 0.9, h: PAGE_H - 2.4 },
        altText: s.imagePrompt ?? "Generated slide image",
      })
    }
    // page accent — thin top bar
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: PAGE_W, h: 0.12,
      fill: { color: theme.accent }, line: { color: theme.accent },
    })
  }

  const out = await pres.write({ outputType: "nodebuffer" }) as any
  return Buffer.isBuffer(out) ? out : Buffer.from(out)
}

// ─── PDF generator (single-pass via pdf-lib, no headless browser) ─────────
export async function buildDeckPdf(spec: DeckSpec): Promise<Buffer> {
  const theme = normaliseTheme(spec.theme)
  const pdf = await PDFDocument.create()
  pdf.setTitle(spec.title)
  if (spec.author) pdf.setAuthor(spec.author)

  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)

  const hex = (h: string) => {
    const n = parseInt(h.replace(/^#/, ""), 16)
    return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255)
  }
  const COLOR_ACCENT = hex(theme.accent)
  const COLOR_BG = hex(theme.background)
  const COLOR_TEXT = hex(theme.text)
  const COLOR_MUTED = hex(theme.muted)

  const PAGE_W = 960    // 16:9 at 60 dpi
  const PAGE_H = 540

  /** Naïve word-wrap that breaks on word boundaries to fit a max width. */
  function wrap(text: string, font: any, size: number, maxW: number): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let cur = ""
    for (const w of words) {
      const next = cur ? cur + " " + w : w
      const width = font.widthOfTextAtSize(next, size)
      if (width > maxW && cur) { lines.push(cur); cur = w } else { cur = next }
    }
    if (cur) lines.push(cur)
    return lines
  }

  for (const s of spec.slides) {
    const page = pdf.addPage([PAGE_W, PAGE_H])
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_BG })

    if (s.kind === "title") {
      // accent bar bottom
      page.drawRectangle({ x: PAGE_W / 2 - 50, y: 60, width: 100, height: 5, color: COLOR_ACCENT })
      const titleLines = wrap(s.title, helvBold, 44, PAGE_W - 120)
      const totalH = titleLines.length * 52 + (s.subtitle ? 36 : 0)
      let y = PAGE_H / 2 + totalH / 2 - 44
      for (const line of titleLines) {
        const w = helvBold.widthOfTextAtSize(line, 44)
        page.drawText(line, { x: (PAGE_W - w) / 2, y, size: 44, font: helvBold, color: COLOR_ACCENT })
        y -= 52
      }
      if (s.subtitle) {
        const subLines = wrap(s.subtitle, helv, 20, PAGE_W - 160)
        for (const line of subLines) {
          const w = helv.widthOfTextAtSize(line, 20)
          page.drawText(line, { x: (PAGE_W - w) / 2, y, size: 20, font: helv, color: COLOR_MUTED })
          y -= 26
        }
      }
      continue
    }

    if (s.kind === "closer") {
      const titleLines = wrap(s.title, helvBold, 40, PAGE_W - 120)
      const sub = s.subtitle ?? s.body ?? ""
      const subLines = sub ? wrap(sub, helv, 18, PAGE_W - 160) : []
      const totalH = titleLines.length * 48 + subLines.length * 24
      let y = PAGE_H / 2 + totalH / 2 - 40
      for (const line of titleLines) {
        const w = helvBold.widthOfTextAtSize(line, 40)
        page.drawText(line, { x: (PAGE_W - w) / 2, y, size: 40, font: helvBold, color: COLOR_ACCENT })
        y -= 48
      }
      y -= 8
      for (const line of subLines) {
        const w = helv.widthOfTextAtSize(line, 18)
        page.drawText(line, { x: (PAGE_W - w) / 2, y, size: 18, font: helv, color: COLOR_MUTED })
        y -= 24
      }
      continue
    }

    // Content
    page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: COLOR_ACCENT })

    let imageSlot = { x: 0, y: 0, w: 0, h: 0 }
    if (s.image) {
      try {
        const img = await pdf.embedPng(s.image)
        const slotW = PAGE_W / 2 - 60
        const slotH = PAGE_H - 180
        const scaled = img.scaleToFit(slotW, slotH)
        const imgX = PAGE_W / 2 + 30
        const imgY = (PAGE_H - scaled.height) / 2 - 20
        page.drawImage(img, { x: imgX, y: imgY, width: scaled.width, height: scaled.height })
        imageSlot = { x: imgX, y: imgY, w: scaled.width, h: scaled.height }
      } catch {
        // Bad image — silently skip rather than throw
      }
    }
    const textW = imageSlot.w > 0 ? PAGE_W / 2 - 80 : PAGE_W - 100
    const textX = 50
    let y = PAGE_H - 70

    const titleLines = wrap(s.title, helvBold, 28, textW)
    for (const line of titleLines) {
      page.drawText(line, { x: textX, y, size: 28, font: helvBold, color: COLOR_ACCENT })
      y -= 34
    }
    if (s.subtitle) {
      y -= 6
      const subLines = wrap(s.subtitle, helvItalic, 14, textW)
      for (const line of subLines) {
        page.drawText(line, { x: textX, y, size: 14, font: helvItalic, color: COLOR_MUTED })
        y -= 18
      }
    }
    y -= 12

    if (s.bullets && s.bullets.length) {
      for (const b of s.bullets) {
        const lines = wrap(b, helv, 16, textW - 20)
        for (let i = 0; i < lines.length; i++) {
          if (y < 60) break
          if (i === 0) {
            page.drawText("•", { x: textX, y, size: 16, font: helvBold, color: COLOR_ACCENT })
          }
          page.drawText(lines[i], { x: textX + 18, y, size: 16, font: helv, color: COLOR_TEXT })
          y -= 22
        }
        y -= 6
      }
    } else if (s.body) {
      const lines = wrap(s.body, helv, 16, textW)
      for (const line of lines) {
        if (y < 60) break
        page.drawText(line, { x: textX, y, size: 16, font: helv, color: COLOR_TEXT })
        y -= 22
      }
    }
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
