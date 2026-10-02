/**
 * Robust JSON extraction from LLM responses.
 *
 * LLMs frequently violate "Output ONLY JSON" instructions in a handful of
 * predictable ways:
 *   - wrap the JSON in ```json ... ``` fences
 *   - prepend "Here is the JSON:" or similar commentary
 *   - emit trailing commas before } or ]
 *   - truncate mid-response when max_tokens is hit (leaving an unterminated
 *     string or unclosed array/object)
 *
 * The previous parsers used a 4-line pattern that only handled the first
 * case. This helper handles all of them with progressive fallbacks, so a
 * "Failed to parse AI response" heuristic only fires when the response is
 * genuinely unrecoverable.
 */

/** Try to parse a JSON object out of an LLM response, returning null
 *  when none of the strategies succeed. Logs the response length for
 *  diagnostics when parsing fails (so we can tell truncation apart from
 *  hallucinated commentary at a glance). */
export function extractJsonObject(raw: string, tag = "json-extract"): any | null {
  if (!raw) return null
  const stripped = stripFences(raw).trim()
  // 1. Direct parse — clean output, no fences, no commentary.
  try { return JSON.parse(stripped) } catch {}
  // 2. First `{` ... last `}` — the model added prose before/after.
  const first = stripped.indexOf("{")
  const last = stripped.lastIndexOf("}")
  if (first >= 0 && last > first) {
    const slice = stripped.slice(first, last + 1)
    try { return JSON.parse(slice) } catch {}
    // 3. Trailing-comma repair (`{ "a": 1, }` → `{ "a": 1 }`).
    const fixed = slice.replace(/,(\s*[}\]])/g, "$1")
    try { return JSON.parse(fixed) } catch {}
  }
  // 3b. Lenient repair for the quirks models actually emit: comments, thousands
  //     separators in numbers, raw newlines inside strings, NaN/undefined.
  if (first >= 0 && last > first) {
    try { return JSON.parse(repairLenient(stripped.slice(first, last + 1))) } catch {}
  }
  // 3c. A string array that was never closed: the model writes `"facts": ["a", "b",` and goes
  //     straight on to the next key. Seen on a real image-only deck (docs/architecture/36).
  if (first >= 0 && last > first) {
    const slice = stripped.slice(first, last + 1)
    for (const candidate of [closeUnclosedArrays(slice), repairLenient(closeUnclosedArrays(slice))]) {
      try { return JSON.parse(candidate) } catch {}
    }
  }
  // 4. Truncation repair: take everything from the first `{` and try to
  //    close unbalanced braces / brackets / strings at the end. This
  //    recovers the partial body when max_tokens cut the response mid-stream.
  if (first >= 0) {
    const repaired = repairTruncated(stripped.slice(first))
    if (repaired) {
      try { return JSON.parse(repaired) } catch {}
    }
  }
  // Where strict parsing gives up is the diagnosis; head and tail alone hide a bad middle.
  let at = ""
  if (first >= 0 && last > first) {
    try { JSON.parse(stripped.slice(first, last + 1)) } catch (e) {
      const m = /position (\d+)/.exec(String((e as Error).message))
      if (m) { const i = Number(m[1]); at = `; strict parse fails near ${i}: ${JSON.stringify(stripped.slice(first).slice(Math.max(0, i - 60), i + 60))}` }
      else at = `; strict parse error: ${String((e as Error).message).slice(0, 120)}`
    }
  }
  console.error(`[${tag}] could not parse JSON${at}; raw length=${raw.length}, first 200=${JSON.stringify(raw.slice(0, 200))}, last 200=${JSON.stringify(raw.slice(-200))}`)
  return null
}

function stripFences(s: string): string {
  // Strip ```json or ``` fences anywhere they appear, not just at the bookends.
  return s
    .replace(/```(?:json|JSON)?\s*\n?/g, "")
    .replace(/\n?```\s*$/g, "")
    .replace(/```/g, "")
}

/** Try to balance an unclosed JSON object. Returns null if the input doesn't
 *  look salvageable. */
function repairTruncated(s: string): string | null {
  // Count outside-of-string brace/bracket depth + detect unterminated string.
  let depth = 0
  let bracketDepth = 0
  let inString = false
  let escape = false
  let lastSafeIdx = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) { escape = false; continue }
      if (c === "\\") { escape = true; continue }
      if (c === '"') { inString = false }
      continue
    }
    if (c === '"') { inString = true; continue }
    if (c === "{") { depth++ }
    else if (c === "}") { depth--; if (depth === 0 && bracketDepth === 0) lastSafeIdx = i }
    else if (c === "[") { bracketDepth++ }
    else if (c === "]") { bracketDepth-- }
  }
  // If we never opened an object, nothing to repair.
  if (depth <= 0 && bracketDepth <= 0 && !inString) return null

  // Truncate to the last complete value before fabricating the close.
  // Find the last comma OUTSIDE of a string and rewind to there, so we
  // don't leave a dangling key:value pair like `"foo":`.
  let buf = s
  // Close an unterminated string first.
  if (inString) buf += '"'
  // Drop a dangling key (`"foo":` with no value).
  buf = buf.replace(/,\s*"[^"\n]+":\s*$/, "")
  // Drop a dangling array element comma (`[1, 2,`).
  buf = buf.replace(/,\s*$/, "")
  // Close brackets first, then braces (innermost wins).
  while (bracketDepth-- > 0) buf += "]"
  while (depth-- > 0) buf += "}"
  // Final trailing-comma repair.
  buf = buf.replace(/,(\s*[}\]])/g, "$1")
  // Validate
  try { JSON.parse(buf); return buf } catch { return null }
}

/**
 * Fix the non-JSON a model commonly writes inside an otherwise valid object.
 *
 * Inside strings only raw control characters are touched (escaped). Outside strings:
 * line and block comments are dropped, NaN / undefined / Infinity become null, a
 * thousands-separated number in a value position loses its commas ("raise": 1,500,000), and
 * trailing commas go. String contents are never rewritten, so a sentence that happens to
 * contain "undefined" or "1,500,000," survives unchanged.
 */
export function repairLenient(s: string): string {
  const segments: { text: string; str: boolean }[] = []
  let cur = ""
  let inString = false
  let escape = false
  const flush = (str: boolean) => { if (cur) segments.push({ text: cur, str }); cur = "" }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) { cur += c; escape = false; continue }
      if (c === "\\") { cur += c; escape = true; continue }
      if (c === '"') { cur += c; flush(true); inString = false; continue }
      cur += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : c
      continue
    }
    if (c === '"') { flush(false); cur = c; inString = true; continue }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; cur += "\n"; continue }
    if (c === "/" && s[i + 1] === "*") { const e = s.indexOf("*" + "/", i + 2); i = e < 0 ? s.length : e + 1; continue }
    cur += c
  }
  flush(inString)
  return segments
    .map(({ text, str }) => str ? text : text
      .replace(/\b(?:NaN|undefined|-?Infinity)\b/g, "null")
      .replace(/(:\s*)(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?=\s*[,}\]])/g, (_m, pre: string, num: string) => pre + num.replace(/,/g, "")))
    .join("")
    .replace(/,(\s*[}\]])/g, "$1")
}

/**
 * Close an array that is still open when the next object key begins.
 *
 * Inside an array a string is an element; the same string followed by a colon can only be a
 * key, so the array must already have ended. Valid JSON never has that shape, so this cannot
 * change a valid document. The trailing comma before the key becomes `],`.
 */
export function closeUnclosedArrays(s: string): string {
  const stack: string[] = []
  let out = ""
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"') {
      let j = i + 1
      while (j < s.length && s[j] !== '"') { if (s[j] === "\\") j++; j++ }
      const str = s.slice(i, j + 1)
      let k = j + 1
      while (k < s.length && /\s/.test(s[k])) k++
      if (s[k] === ":" && stack[stack.length - 1] === "[") {
        const ws = /\s*$/.exec(out)?.[0] ?? ""
        out = out.slice(0, out.length - ws.length).replace(/,$/, "") + "]," + ws
        stack.pop()
      }
      out += str
      i = j
      continue
    }
    if (c === "{" || c === "[") stack.push(c)
    else if (c === "}" || c === "]") stack.pop()
    out += c
  }
  return out
}
