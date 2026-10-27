/** Reads a server-sent-event stream from a fetch response body (EventSource cannot POST). Calls onEvent for each complete event. */
export function createSseParser(onEvent: (event: string, data: any) => void) {
  let buf = ""
  return (chunk: string) => {
    buf += chunk.replace(/\r\n/g, "\n")
    for (let i = buf.indexOf("\n\n"); i >= 0; i = buf.indexOf("\n\n")) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2)
      let event = "message", data = ""
      for (const line of raw.split("\n")) { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim() }
      if (!data) continue
      try { onEvent(event, JSON.parse(data)) } catch { /* a malformed event is skipped, not fatal */ }
    }
  }
}
