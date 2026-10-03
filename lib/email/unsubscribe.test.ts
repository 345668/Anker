import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const q = vi.hoisted(() => ({ rows: [] as any[], calls: [] as string[] }))
vi.mock("@/lib/db", () => ({
  sql: async (strings: TemplateStringsArray) => { q.calls.push(strings.join("?")); return q.rows },
}))
process.env.SECRET_KEY = "test-secret"
import { makeUnsubscribeToken, readUnsubscribeToken, unsubscribeHeaders, unsubscribeFooter, isGloballySuppressed, suppressGlobally } from "./unsubscribe"
import { sendEmail } from "./resend"

beforeEach(() => { q.rows = []; q.calls = []; process.env.RESEND_API_KEY = "re_test" })

describe("unsubscribe tokens", () => {
  it("round-trips an address, case-insensitively", () => {
    expect(readUnsubscribeToken(makeUnsubscribeToken("Jane.Doe@Example.com"))).toBe("jane.doe@example.com")
  })
  it("rejects tampering, truncation and another address's signature", () => {
    const t = makeUnsubscribeToken("a@example.com")
    const [addr, time, sig] = t.split(".")
    expect(readUnsubscribeToken(`${addr}.${time}.${sig.slice(0, -2)}xx`)).toBeNull()
    expect(readUnsubscribeToken(`${Buffer.from("b@example.com").toString("base64url")}.${time}.${sig}`)).toBeNull()
    expect(readUnsubscribeToken("garbage")).toBeNull()
    expect(readUnsubscribeToken("")).toBeNull()
  })
})

describe("what outreach carries", () => {
  it("has the one-click headers and a link that unsubscribes this address", () => {
    const h = unsubscribeHeaders("a@example.com")
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    const url = h["List-Unsubscribe"].slice(1, -1)
    expect(url).toContain("/api/public/unsubscribe?t=")
    expect(readUnsubscribeToken(new URL(url).searchParams.get("t")!)).toBe("a@example.com")
  })
  it("has a visible footer with the link and the privacy notice, and the postal address when configured", () => {
    process.env.OUTREACH_FOOTER_ADDRESS = "Example GmbH, Musterstrasse 1, 10115 Berlin"
    const f = unsubscribeFooter("a@example.com")
    expect(f.text).toContain("Unsubscribe:")
    expect(f.text).toContain("/privacy")
    expect(f.text).toContain("Example GmbH")
    expect(f.html).toContain("Unsubscribe</a>")
    delete process.env.OUTREACH_FOOTER_ADDRESS
  })
})

describe("the global do-not-send list", () => {
  it("answers from the rows with no owner and never throws", async () => {
    q.rows = [{ "?column?": 1 }]
    expect(await isGloballySuppressed("A@Example.com")).toBe(true)
    expect(q.calls[0]).toContain("user_id IS NULL")
    q.rows = []
    expect(await isGloballySuppressed("a@example.com")).toBe(false)
  })
  it("inserts only when the address is not already there", async () => {
    await suppressGlobally("A@Example.com", "unsubscribed", "recipient")
    expect(q.calls[0]).toContain("WHERE NOT EXISTS")
  })
})

describe("sendEmail", () => {
  const stubFetch = () => {
    const sent: any[] = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "r1" }), { status: 200 }) }))
    return sent
  }
  it("outreach: adds the headers and footer", async () => {
    const sent = stubFetch()
    await sendEmail({ to: "a@example.com", subject: "Hi", text: "Hello there", purpose: "outreach" })
    expect(sent[0].headers["List-Unsubscribe"]).toContain("/api/public/unsubscribe")
    expect(sent[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(sent[0].text).toContain("Hello there")
    expect(sent[0].text).toContain("Unsubscribe:")
    expect(sent[0].html).toContain("Unsubscribe</a>")
  })
  it("outreach: refuses an address that opted out, and sends nothing", async () => {
    const sent = stubFetch()
    q.rows = [{ "?column?": 1 }]
    await expect(sendEmail({ to: "a@example.com", subject: "Hi", text: "x", purpose: "outreach" })).rejects.toMatchObject({ code: "recipient_suppressed" })
    expect(sent).toHaveLength(0)
  })
  it("transactional (the default): no footer, no header, and no suppression check", async () => {
    const sent = stubFetch()
    q.rows = [{ "?column?": 1 }]
    await sendEmail({ to: "a@example.com", subject: "Your invoice", text: "Total due" })
    expect(sent[0].headers["List-Unsubscribe"]).toBeUndefined()
    expect(sent[0].text).toBe("Total due")
  })
})
