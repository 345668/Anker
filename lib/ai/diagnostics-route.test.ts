/**
 * Doc 35 #9 — /api/diagnostics must not spend provider quota or reveal
 * configuration to anyone who is not an admin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
vi.mock("server-only", () => ({}))

const st = vi.hoisted(() => ({ admin: false, generate: vi.fn() }))
vi.mock("@/lib/auth/require-admin", async () => {
  const { NextResponse } = await import("next/server")
  return {
    requireAdmin: async () =>
      st.admin ? { id: "a1", email: "admin@example.test", metadata: {} } : NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  }
})
vi.mock("@/lib/db", () => ({ sql: async () => [{ ok: 1 }] }))
vi.mock("@/lib/ai/runtime-config", () => ({
  readRouterConfig: async () => ({
    providerOverride: null, providerStrict: false, localEnabled: false,
    qwenApiKey: "qk-secret-0123456789abcd", anthropicApiKey: null, openaiApiKey: null, mistralApiKey: null, geminiApiKey: null,
    qwenWorkspaceId: null, qwenRegion: "intl", qwenModel: null,
  }),
}))
vi.mock("@/lib/ai/provider", () => ({
  providerInfo: async () => ({ provider: "qwen", model: "qwen-flash" }),
  providerChain: () => ["qwen"],
  generateDetailed: st.generate,
}))

import { GET } from "@/app/api/diagnostics/route"
const req = (q = "") => new NextRequest(`http://localhost/api/diagnostics${q}`)

beforeEach(() => {
  st.admin = false
  st.generate.mockReset()
  st.generate.mockResolvedValue({ text: "PONG", provider: "qwen", model: "qwen-flash", error: null })
})

describe("/api/diagnostics", () => {
  it("gives an anonymous caller liveness only: no provider call, no configuration", async () => {
    const res = await GET(req("?probe=1"))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, timestamp: expect.any(String) })
    expect(st.generate).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).not.toMatch(/qk-|qwen|DATABASE|key/i)
  })

  it("gives an admin the detail but spends no quota unless a probe is asked for", async () => {
    st.admin = true
    const body = await (await GET(req())).json()
    expect(body.runtimeConfig.reachable).toBe(true)
    expect(body.provider.chain).toEqual(["qwen"])
    expect(body.provider.qwenEndpoint).toMatchObject({ region: "intl" })
    expect(body.probe).toMatchObject({ skipped: true })
    expect(st.generate).not.toHaveBeenCalled()
  })

  it("runs exactly one bounded completion when an admin asks with ?probe=1", async () => {
    st.admin = true
    const body = await (await GET(req("?probe=1"))).json()
    expect(st.generate).toHaveBeenCalledTimes(1)
    expect(st.generate.mock.calls[0][1]).toMatchObject({ maxTokens: 8, retries: 0 })
    expect(body.probe).toMatchObject({ provider: "qwen", text: "PONG" })
  })

  it("never returns a full key, even to an admin", async () => {
    st.admin = true
    expect(JSON.stringify(await (await GET(req())).json())).not.toContain("qk-secret-0123456789abcd")
  })
})
