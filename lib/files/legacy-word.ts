/** Legacy Word (.doc, the pre-2007 binary format) → plain text. */
export async function legacyDocText(buf: Buffer): Promise<string> {
  const WordExtractor = (await import("word-extractor")).default
  const doc = await new WordExtractor().extract(buf)
  return [doc.getBody(), doc.getFootnotes(), doc.getEndnotes()].filter((t) => t && t.trim()).join("\n\n")
}
