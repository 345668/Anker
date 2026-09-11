import { expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
  update: { id: "update-1", user_id: "user-1", title: "Q3", body: "Progress", asks: null, status: "draft" },
  queries: [] as string[],
  values: [] as unknown[][],
  email: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "founder@example.test" } } }) } }) }))
vi.mock("@/lib/email/resend", () => ({ isResendConfigured: () => true, sendEmail: state.email }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: vi.fn(async () => false) }))
vi.mock("@/lib/updates/builder", () => ({ recommendRecipients: vi.fn(async () => []) }))
vi.mock("@/lib/db", () => {
  const sql = (parts: TemplateStringsArray, ...values: unknown[]) => {
    const text = parts.reduce((out, part, index) => out + (index ? `$${index}` : "") + part, "")
    state.queries.push(text)
    state.values.push(values)
    if (text.startsWith("UPDATE investor_updates") && text.includes("status = 'sending'")) return Promise.resolve([state.update])
    if (text.startsWith("SELECT lower(email)")) return Promise.resolve([])
    return Promise.resolve([])
  }
  return { sql }
})

import { POST } from "@/app/api/updates/[id]/send/route"

it("leaves an update retryable when delivery fails", async () => {
  state.queries.length = 0
  state.values.length = 0
  state.email.mockRejectedValueOnce(new Error("provider unavailable"))
  const req = new NextRequest("https://anker.test/api/updates/update-1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipients: [{ email: "investor@example.test", name: "Investor" }] }),
  })
  const response = await POST(req, { params: Promise.resolve({ id: "update-1" }) })
  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ ok: false, failed: 1, sent: 0 })
  expect(state.values.flat()).toContain("draft")
  expect(state.email).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "investor-update:update-1:investor@example.test" }))
})
