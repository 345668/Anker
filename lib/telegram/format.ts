/** Telegram text helpers (docs/architecture/57). Replies use HTML parse mode, so every value that is not our own markup is escaped, and long answers are split on paragraph or sentence breaks. */
export const MAX_MESSAGE = 4096

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Splits plain text into parts of at most `max` characters, at a paragraph, line or sentence break where there is one. */
export function splitText(text: string, max = 3800): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    const window = rest.slice(0, max)
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "))
    if (cut < max * 0.5) cut = window.lastIndexOf(" ")
    if (cut < max * 0.3) cut = max - 1
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * The model's answer as Telegram HTML: escaped, with **bold** and `code` kept as light formatting and nothing else interpreted, so an answer can never inject markup or a link.
 * Parts beyond `maxParts` are replaced by a pointer to the app.
 */
export function answerToParts(answer: string, appUrl: string, maxParts = 3): string[] {
  const parts = splitText(answer)
  const shown = parts.slice(0, maxParts).map((p) => esc(p).replace(/\*\*([^*\n]{1,200})\*\*/g, "<b>$1</b>").replace(/`([^`\n]{1,200})`/g, "<code>$1</code>"))
  if (parts.length > maxParts) shown.push(`The full answer is in Anker AI: ${esc(appUrl)}`)
  return shown.length ? shown : ["(no answer)"]
}
