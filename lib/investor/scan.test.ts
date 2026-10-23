import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import net from "node:net"
import { enforceScan, scanBytes, scanPolicy, scannerConfigured, scanningActive } from "./scan"

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
/** A fake clamd that speaks INSTREAM: reads the chunks, and answers FOUND if the payload holds the EICAR test string. */
function fakeClamd(mode: "normal" | "error" | "silent" = "normal"): Promise<{ port: number; close: () => void; streams: number }> {
  const out = { port: 0, close: () => {}, streams: 0 }
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0), started = false
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d])
        if (!started) { if (buf.length < 10) return; if (buf.subarray(0, 10).toString() !== "zINSTREAM\0") { sock.end("UNKNOWN COMMAND\0"); return } buf = buf.subarray(10); started = true; out.streams++ }
        const parts: Buffer[] = []
        for (;;) {
          if (buf.length < 4) return
          const n = buf.readUInt32BE(0)
          if (n === 0) { const payload = Buffer.concat(parts).toString("latin1"); if (mode === "error") sock.end("INSTREAM size limit exceeded. ERROR\0"); else if (mode === "silent") sock.end(); else sock.end(payload.includes(EICAR) ? "stream: Win.Test.EICAR_HDB-1 FOUND\0" : "stream: OK\0"); return }
          if (buf.length < 4 + n) return
          parts.push(buf.subarray(4, 4 + n)); buf = buf.subarray(4 + n)
        }
      })
    })
    srv.listen(0, "127.0.0.1", () => { out.port = (srv.address() as net.AddressInfo).port; out.close = () => srv.close(); resolve(out) })
  })
}

describe("the scanner protocol", () => {
  let clamd: Awaited<ReturnType<typeof fakeClamd>>
  beforeAll(async () => { clamd = await fakeClamd() })
  afterAll(() => clamd.close())
  it("says clean for an ordinary file, and infected, with the signature, for the EICAR test string, also across several chunks", async () => {
    expect(await scanBytes(Buffer.from("%PDF-1.4 hello"), { host: "127.0.0.1", port: clamd.port })).toEqual({ status: "clean" })
    expect(await scanBytes(Buffer.from(EICAR), { host: "127.0.0.1", port: clamd.port })).toEqual({ status: "infected", signature: "Win.Test.EICAR_HDB-1" })
    const big = Buffer.concat([Buffer.alloc(200 * 1024, 1), Buffer.from(EICAR), Buffer.alloc(100 * 1024, 2)])      // spans four 64 KB chunks
    expect(await scanBytes(big, { host: "127.0.0.1", port: clamd.port })).toMatchObject({ status: "infected" })
  })
  it("reports unavailable, never throws, for no scanner, a closed port, an error answer, or silence", async () => {
    expect(await scanBytes(Buffer.from("x"), { host: "" })).toMatchObject({ status: "unavailable", why: expect.stringMatching(/no scanner/) })
    expect(await scanBytes(Buffer.from("x"), { host: "127.0.0.1", port: 1 })).toMatchObject({ status: "unavailable" })
    const err = await fakeClamd("error"); expect(await scanBytes(Buffer.from("x"), { host: "127.0.0.1", port: err.port })).toMatchObject({ status: "unavailable", why: expect.stringMatching(/ERROR/) }); err.close()
    const mute = await fakeClamd("silent"); expect(await scanBytes(Buffer.from("x"), { host: "127.0.0.1", port: mute.port })).toMatchObject({ status: "unavailable" }); mute.close()
  })
})

describe("the policy", () => {
  const f = [{ filename: "a.pdf", bytes: Buffer.from("%PDF-1.4") }]
  const clean = vi.fn(async () => ({ status: "clean" as const })), infected = vi.fn(async () => ({ status: "infected" as const, signature: "Test.Sig" })), down = vi.fn(async () => ({ status: "unavailable" as const, why: "down" }))
  it("is off unless asked, and off changes nothing", async () => {
    expect(scanPolicy({})).toBe("off"); expect(scanPolicy({ INVESTOR_SCAN: "bogus" })).toBe("off")
    clean.mockClear(); await enforceScan(f, clean, { INVESTOR_SCAN: "off", CLAMAV_HOST: "x" }); expect(clean).not.toHaveBeenCalled()
    expect(scanningActive({})).toBe(false); expect(scanningActive({ INVESTOR_SCAN: "required" })).toBe(false); expect(scanningActive({ INVESTOR_SCAN: "optional", CLAMAV_HOST: "h" })).toBe(true); expect(scannerConfigured({ CLAMAV_HOST: "h" })).toBe(true)
  })
  it("optional: scans when it can, refuses an infected file, lets a file through when the scanner is down or missing", async () => {
    const env = { INVESTOR_SCAN: "optional", CLAMAV_HOST: "h" }
    await expect(enforceScan(f, clean, env)).resolves.toBeUndefined()
    await expect(enforceScan(f, infected, env)).rejects.toMatchObject({ code: "infected", status: 422 })
    await expect(enforceScan(f, down, env)).resolves.toBeUndefined()
    await expect(enforceScan(f, clean, { INVESTOR_SCAN: "optional" })).resolves.toBeUndefined()
  })
  it("required: fails closed when the scanner is down or not configured, and still refuses an infected file", async () => {
    const env = { INVESTOR_SCAN: "required", CLAMAV_HOST: "h" }
    await expect(enforceScan(f, clean, env)).resolves.toBeUndefined()
    await expect(enforceScan(f, down, env)).rejects.toMatchObject({ code: "scan_unavailable", status: 503 })
    await expect(enforceScan(f, clean, { INVESTOR_SCAN: "required" })).rejects.toMatchObject({ code: "scan_unavailable" })
    await expect(enforceScan(f, infected, env)).rejects.toMatchObject({ code: "infected" })
    await expect(enforceScan([], down, env)).resolves.toBeUndefined()
  })
})
