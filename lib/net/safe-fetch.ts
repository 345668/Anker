/**
 * Fetch a user-supplied URL without letting it reach the platform's own
 * network (docs/architecture/14 §8): https only; every host resolved and
 * refused if any address is private, loopback, link-local, multicast or
 * otherwise reserved; redirects followed by hand (≤ 3), each re-checked;
 * size and time capped.
 *
 * Residual risk, stated: the platform fetch resolves the host again after the
 * check (DNS rebinding window). The window is small and every redirect is
 * re-validated, but this is not a network-level egress control.
 */
import { promises as dns } from "node:dns"
import net from "node:net"

export class UnsafeUrlError extends Error {}

export interface SafeFetchOptions {
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  lookup?: (host: string) => Promise<string[]>
  fetchImpl?: typeof fetch
}

const defaultLookup = async (host: string) => (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address)

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip)
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return ipv4Private(mapped[1])
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9")
      || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff") || v.startsWith("64:ff9b") || v.startsWith("2001:db8")
  }
  return true // not an IP at all: refuse
}

async function assertPublic(url: URL, lookup: NonNullable<SafeFetchOptions["lookup"]>) {
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https links can be fetched.")
  if (url.username || url.password) throw new UnsafeUrlError("Links with credentials are not accepted.")
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Only the standard https port is allowed.")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("That address is not reachable from here.")
  }
  const addresses = net.isIP(host) ? [host] : await lookup(host).catch(() => [])
  if (!addresses.length) throw new UnsafeUrlError("That host could not be resolved.")
  if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError("That address is not reachable from here.")
}

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<{ finalUrl: string; contentType: string; body: Buffer }> {
  const maxBytes = opts.maxBytes ?? 20 * 1024 * 1024
  const lookup = opts.lookup ?? defaultLookup
  const fetchImpl = opts.fetchImpl ?? fetch
  let url: URL
  try { url = new URL(input) } catch { throw new UnsafeUrlError("That is not a valid link.") }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000)
  try {
    for (let hop = 0; ; hop++) {
      await assertPublic(url, lookup)
      const res = await fetchImpl(url, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": "AnkerDeckReader/1.0", Accept: "application/pdf,text/html;q=0.9,*/*;q=0.5" } })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")
        if (!loc || hop >= (opts.maxRedirects ?? 3)) throw new UnsafeUrlError("Too many redirects.")
        url = new URL(loc, url)
        continue
      }
      if (!res.ok) throw new UnsafeUrlError(`The link answered ${res.status}.`)
      const declared = Number(res.headers.get("content-length") ?? 0)
      if (declared > maxBytes) throw new UnsafeUrlError("The file is too large.")
      const chunks: Buffer[] = []
      let size = 0
      if (res.body) {
        const reader = res.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) { await reader.cancel(); throw new UnsafeUrlError("The file is too large.") }
          chunks.push(Buffer.from(value))
        }
      }
      return { finalUrl: url.toString(), contentType: (res.headers.get("content-type") ?? "").toLowerCase(), body: Buffer.concat(chunks) }
    }
  } finally {
    clearTimeout(timer)
  }
}
