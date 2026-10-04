/** The Settings account type follows the active workspace, never a stale default or a client-sent value. */
import { describe, it, expect, vi, beforeEach } from "vitest"
const h = vi.hoisted(() => ({ sql: vi.fn(), active: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }))
vi.mock("@/lib/db", () => ({ sql: h.sql }))
vi.mock("@/lib/db/secrets", () => ({ decryptSecret: (v: string) => v, encryptSecret: (v: string) => v }))
vi.mock("@/lib/org/active", () => ({ resolveActiveMembership: h.active }))
import { getUserSettings, saveUserSettings } from "@/app/dashboard/settings/actions"

beforeEach(() => { h.sql.mockReset(); h.active.mockReset() })

describe("account type", () => {
  it("a stale 'founder' default is shown as the workspace's persona", async () => {
    h.active.mockResolvedValue({ active: { persona: "vc" }, all: [] })
    h.sql.mockResolvedValueOnce([{ user_id: "u1", user_type: "founder" }])
    expect((await getUserSettings()).settings?.user_type).toBe("vc")
  })
  it("first-time settings are created with the workspace persona", async () => {
    h.active.mockResolvedValue({ active: { persona: "vc" }, all: [] })
    h.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ user_id: "u1", user_type: "vc" }])
    await getUserSettings()
    expect(h.sql.mock.calls[1].slice(1)).toContain("vc")
  })
  it("a workspace with no founder or VC persona keeps the stored value", async () => {
    h.active.mockResolvedValue({ active: { persona: "lp" }, all: [] })
    h.sql.mockResolvedValueOnce([{ user_id: "u1", user_type: "founder" }])
    expect((await getUserSettings()).settings?.user_type).toBe("founder")
  })
  it("a client-sent account type cannot override the workspace on save", async () => {
    h.active.mockResolvedValue({ active: { persona: "vc" }, all: [] })
    h.sql.mockResolvedValue([{ id: "x" }])
    await saveUserSettings({ user_type: "founder" })
    const written = h.sql.mock.calls.flatMap((c) => c.slice(1))
    expect(written).toContain("vc"); expect(written).not.toContain("founder")
  })
})
