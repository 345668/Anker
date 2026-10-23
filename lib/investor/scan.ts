/**
 * Virus scanning for files an investor or a fund sends (docs/architecture/74 section 2): a ClamAV daemon over TCP (the INSTREAM protocol), run before anything is stored.
 * `INVESTOR_SCAN`: off (default) | optional (scan if a scanner is configured; an unreachable scanner lets the file through and is logged) | required (an unreachable scanner REFUSES the upload).
 * An infected file is refused in every mode that scans. Files go only to the scanner the operator runs (`CLAMAV_HOST`, `CLAMAV_PORT`, default 3310); never to a third-party service.
 */
import net from "node:net"
import { InvestorError } from "./profile"

export type ScanPolicy = "off" | "optional" | "required"
export const scanPolicy = (env: Record<string, string | undefined> = process.env): ScanPolicy => (["optional", "required"].includes(String(env.INVESTOR_SCAN)) ? (env.INVESTOR_SCAN as ScanPolicy) : "off")
export const scannerConfigured = (env: Record<string, string | undefined> = process.env) => !!env.CLAMAV_HOST
/** Whether uploads are actually scanned right now (policy on and a scanner set), so the screens can say so truthfully. */
export const scanningActive = (env: Record<string, string | undefined> = process.env) => scanPolicy(env) !== "off" && scannerConfigured(env)

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string } | { status: "unavailable"; why: string }

/** One file through clamd. Never throws: a failure is `unavailable`. */
export function scanBytes(bytes: Buffer, o: { host?: string; port?: number; timeoutMs?: number } = {}): Promise<ScanResult> {
  const host = o.host ?? process.env.CLAMAV_HOST ?? "", port = o.port ?? Number(process.env.CLAMAV_PORT || 3310), timeoutMs = o.timeoutMs ?? 20000
  if (!host) return Promise.resolve({ status: "unavailable", why: "no scanner is configured" })
  return new Promise((resolve) => {
    let done = false, reply = ""
    const finish = (r: ScanResult) => { if (!done) { done = true; sock.destroy(); resolve(r) } }
    const sock = net.connect({ host, port })
    sock.setTimeout(timeoutMs, () => finish({ status: "unavailable", why: "the scanner timed out" }))
    sock.on("error", (e) => finish({ status: "unavailable", why: `the scanner could not be reached (${e.message})` }))
    sock.on("data", (d) => { reply += d.toString("latin1") })
    sock.on("close", () => {
      const text = reply.replace(/\0/g, "").trim()
      if (/OK$/.test(text)) finish({ status: "clean" })
      else { const m = /stream:\s*(.+?)\s+FOUND$/.exec(text); finish(m ? { status: "infected", signature: m[1] } : { status: "unavailable", why: text ? `the scanner answered: ${text.slice(0, 80)}` : "the scanner closed the connection without an answer" }) }
    })
    sock.on("connect", () => {
      sock.write("zINSTREAM\0")
      for (let i = 0; i < bytes.length; i += 64 * 1024) {
        const chunk = bytes.subarray(i, i + 64 * 1024), len = Buffer.alloc(4); len.writeUInt32BE(chunk.length)
        sock.write(len); sock.write(chunk)
      }
      sock.write(Buffer.alloc(4))                                                         // zero length ends the stream
    })
  })
}

/** Applies the policy to files about to be stored. Throws to refuse. */
export async function enforceScan(files: Array<{ filename: string; bytes: Buffer }>, scan: typeof scanBytes = scanBytes, env: Record<string, string | undefined> = process.env): Promise<void> {
  const policy = scanPolicy(env)
  if (policy === "off" || !files.length) return
  if (!scannerConfigured(env)) {
    if (policy === "required") throw new InvestorError("Files cannot be accepted right now because the virus scanner is not available. Please try again later.", 503, "scan_unavailable")
    return
  }
  for (const f of files) {
    const r = await scan(f.bytes)
    if (r.status === "infected") throw new InvestorError(`${f.filename} was not accepted: the virus scanner flagged it.`, 422, "infected")
    if (r.status === "unavailable") {
      if (policy === "required") throw new InvestorError("Files cannot be accepted right now because the virus scanner is not available. Please try again later.", 503, "scan_unavailable")
      console.warn("[investor-scan] scanner unavailable; file accepted without a scan:", r.why)
    }
  }
}
