/**
 * Text from PowerPoint (.pptx) and Word (.docx) files, so decks no longer have
 * to be exported to PDF first (docs/architecture/10 §5, 14 §8). Reads the
 * Office Open XML parts directly: slide text in slide order, then speaker
 * notes; document paragraphs in order.
 */
import { unzipEntries } from "./zip"

const decode = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&")

/** Paragraphs of an Office XML part: runs (<a:t>/<w:t>) joined within a paragraph (<a:p>/<w:p>). */
function paragraphs(xml: string, run: "a:t" | "w:t", para: "a:p" | "w:p"): string[] {
  const out: string[] = []
  for (const p of xml.split(new RegExp(`</${para}>`))) {
    const text = [...p.matchAll(new RegExp(`<${run}(?:\\s[^>]*)?>([^<]*)</${run}>`, "g"))].map((m) => decode(m[1])).join("")
    if (text.trim()) out.push(text.trim())
  }
  return out
}

const num = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0)

export function pptxText(buf: Buffer): { text: string; slides: number } {
  const entries = unzipEntries(buf, { filter: (n) => /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/.test(n) })
  const slides = [...entries.keys()].filter((n) => n.startsWith("ppt/slides/")).sort((a, b) => num(a) - num(b))
  const parts: string[] = []
  for (const name of slides) {
    const i = num(name)
    const body = paragraphs(entries.get(name)!.toString("utf8"), "a:t", "a:p")
    const notesXml = entries.get(`ppt/notesSlides/notesSlide${i}.xml`)
    const notes = notesXml ? paragraphs(notesXml.toString("utf8"), "a:t", "a:p").filter((t) => !/^\d+$/.test(t)) : []
    parts.push(`── Slide ${i} ──\n${body.join("\n")}${notes.length ? `\n[notes] ${notes.join(" ")}` : ""}`)
  }
  return { text: parts.join("\n\n"), slides: slides.length }
}

export function docxText(buf: Buffer): { text: string } {
  const entries = unzipEntries(buf, { filter: (n) => n === "word/document.xml" })
  const xml = entries.get("word/document.xml")
  if (!xml) throw new Error("not a Word document")
  return { text: paragraphs(xml.toString("utf8"), "w:t", "w:p").join("\n") }
}
