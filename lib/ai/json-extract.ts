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
  // 4. Truncation repair: take everything from the first `{` and try to
  //    close unbalanced braces / brackets / strings at the end. This
  //    recovers the partial body when max_tokens cut the response mid-stream.
  if (first >= 0) {
    const repaired = repairTruncated(stripped.slice(first))
    if (repaired) {
      try { return JSON.parse(repaired) } catch {}
    }
  }
  console.error(`[${tag}] could not parse JSON; raw length=${raw.length}, first 200=${JSON.stringify(raw.slice(0, 200))}, last 200=${JSON.stringify(raw.slice(-200))}`)
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
