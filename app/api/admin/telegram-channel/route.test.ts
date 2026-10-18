import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
const st = vi.hoisted(() => ({ admin: "portal-service" as string | null, disconnected: [] as any[], revoked: [] as any[], audits: [] as any[], conns: [{ botId: "abcdefgh12", username: "b" }] as any[] }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: Object.assign(async () => [], { unsafe: async () => [] }) }))
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => (st.admin ? { id: st.admin } : NextResponse.json({ error: "no" }, { status: 401 })) }))
vi.mock("@/lib/telegram/api", () => ({ deleteWebhook: async () => {}, getMe: async () => ({}), getWebhookInfo: async () => ({ url: "x", pending_update_count: 0 }), productBot: () => null, setWebhook: async () => {} }))
vi.mock("@/lib/telegram/bots", () => ({
  listConnections: async () => st.conns, devicesOnBot: async () => [{ id: "d1" }], loadBot: async () => null, webhookUrlFor: (id: string) => `https://x/${id}`,
  operatorDisconnect: async (id: string, reason: string, by: string) => { if (id === "gone-12345") return null; st.disconnected.push({ id, reason, by }); return { devices: 2 } },
  operatorRevokeLink: async (id: string, reason: string, by: string) => { st.revoked.push({ id, reason, by }); return id !== "00000000-0000-0000-0000-000000000000" },
}))
vi.mock("@/lib/audit/audit-log", () => ({ logAudit: async (a: any) => { st.audits.push(a) } }))
import { GET, POST } from "./route"

const req = (body?: unknown, url = "https://x.test/api/admin/telegram-channel", headers: Record<string, string> = { "x-portal-staff-email": "ops@an-ker.de" }) => new Request(url, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }) as any
beforeEach(() => { st.admin = "portal-service"; st.disconnected.length = 0; st.revoked.length = 0; st.audits.length = 0 })

describe("operator routes for the Telegram channel", () => {
  it("only the staff portal may use them", async () => {
    st.admin = null; expect((await GET(req(undefined, "https://x.test/a?connections=1"))).status).toBe(401)
    st.admin = "some-user"; expect((await POST(req({ action: "disconnect_bot", botId: "abcdefgh12", reason: "because reasons" }))).status).toBe(403)
  })
  it("lists connections and devices", async () => {
    expect((await (await GET(req(undefined, "https://x.test/a?connections=1"))).json()).connections).toEqual(st.conns)
    expect((await (await GET(req(undefined, "https://x.test/a?devices=abcdefgh12"))).json()).devices).toEqual([{ id: "d1" }])
    expect((await (await GET(req(undefined, "https://x.test/a?devices=../../etc"))).json()).devices).toEqual([])
  })
  it("removing a connection needs a reason, a real id and is written to the audit log with who did it", async () => {
    expect((await POST(req({ action: "disconnect_bot", botId: "abcdefgh12", reason: "no" }))).status).toBe(400)
    expect((await POST(req({ action: "disconnect_bot", botId: "x", reason: "a proper reason" }))).status).toBe(400)
    expect((await POST(req({ action: "disconnect_bot", botId: "gone-12345", reason: "a proper reason" }))).status).toBe(404)
    const ok = await POST(req({ action: "disconnect_bot", botId: "abcdefgh12", reason: "  A customer   asked us to remove it " })); expect(ok.status).toBe(200); expect(await ok.json()).toEqual({ ok: true, devices: 2 })
    expect(st.disconnected).toEqual([{ id: "abcdefgh12", reason: "A customer asked us to remove it", by: "ops@an-ker.de" }]); expect(st.audits[0]).toMatchObject({ action: "telegram.operator_disconnect_bot", actorEmail: "ops@an-ker.de", metadata: { devices: 2 } })
  })
  it("one device: same rules; an already disconnected one is a 404", async () => {
    expect((await POST(req({ action: "revoke_link", linkId: "nope", reason: "a proper reason" }))).status).toBe(400)
    expect((await POST(req({ action: "revoke_link", linkId: "11111111-1111-1111-1111-111111111111", reason: "Lost phone reported" }))).status).toBe(200)
    expect((await POST(req({ action: "revoke_link", linkId: "00000000-0000-0000-0000-000000000000", reason: "Lost phone reported" }))).status).toBe(404); expect(st.audits).toHaveLength(1)
  })
})
