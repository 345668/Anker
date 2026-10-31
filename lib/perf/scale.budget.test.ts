// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { enabled, within, firmNames, rng, SCALE, timings } from "./budget"
import { clusterFirms, dedupFirms, dedupContacts, firmDedupKeys } from "@/lib/matching/v2/dedup"
import { hashEmail } from "@/lib/directory/identity"
import { evaluate } from "@/lib/ops/alerts/rules"
import { splitTranscript, extractNoteFigures, createRepeatFilter, extractFigures } from "@/lib/halyard/core"

// docs/architecture/59 R5. Off unless RUN_BUDGET=1 (pnpm budget): production-size fixtures take minutes. LIMITS are in the BUDGET table below.
const BUDGET: Record<string, number> = { repeat: 1_100 }   // everything else is at the 1,000 ms floor; measured 2026-10-30: cluster 198, dedupFirms 222, contacts 20, hash 105, evaluate 1, split 1, figures 19, repeat 530
const limit = (label: string, fallback: number) => BUDGET[label] ?? fallback

describe.skipIf(!enabled())("the scale budget: pure work at production size", () => {
  const names = firmNames()
  it("the fixture has the size and the collisions it claims", () => {
    expect(names).toHaveLength(SCALE.firms); expect(new Set(names.map((n) => firmDedupKeys(n)[0])).size).toBeLessThan(names.length * 0.95)
  })
  it("clusters 21,000 firm names (the all-pairs regression of 2026-10-03)", async () => {
    const out = await within("cluster 21,000 firm names", limit("cluster", 1_000), () => clusterFirms(names.map((name) => ({ name }))))
    expect(out).toHaveLength(names.length); expect(new Set(out).size).toBeLessThan(names.length)
  }, 180_000)
  it("merges 21,000 scored firms", async () => {
    const firms = names.map((name, i) => ({ firmId: `f${i}`, name, normalizedName: name.toLowerCase(), score: i % 100, website: null, linkedin: null, aumRaw: null, aumUsd: null, description: null, tags: ["T"], reasons: ["r"], isAnchor: false }) as any)
    const { merged } = await within("dedupFirms 21,000", limit("dedupFirms", 1_000), () => dedupFirms(firms))
    expect(merged.length).toBeLessThan(firms.length)
  }, 180_000)
  it("merges 50,000 contacts, a tenth sharing an email", async () => {
    const r = rng(7), people = Array.from({ length: SCALE.people }, (_, i) => ({ investorId: `p${i}`, name: `Person ${i % 30000}`, location: "Berlin", email: i % 10 === 0 ? `shared${i % 1000}@example.com` : `p${i}@example.com`, score: Math.floor(r() * 100), emailVerified: false, sectors: [], bio: null, linkedin: null, title: null, type: "vc", tags: ["T"], reasons: ["r"], hnwSignals: [] }) as any)
    const { merged } = await within("dedupContacts 50,000", limit("dedupContacts", 1_000), () => dedupContacts(people))
    expect(merged.length).toBeLessThan(people.length)
  }, 120_000)
  it("hashes 50,000 emails for the identity registry", async () => {
    const out = await within("hash 50,000 emails", limit("hash", 1_000), () => Array.from({ length: SCALE.people }, (_, i) => hashEmail(`person${i}@example.com`, "test-key")))
    expect(new Set(out).size).toBe(SCALE.people)
  })
  it("evaluates every alert rule over 400 jobs, 150 checks and 300 privacy requests", async () => {
    const now = Date.now(), latest: any = {}, lastOk: any = {}, recent: any = {}
    for (let i = 0; i < 400; i++) { latest[`job-${i}`] = { startedAt: now - i * 60_000, status: i % 9 === 0 ? "failed" : "ok" }; lastOk[`job-${i}`] = now - i * 120_000; recent[`job-${i}`] = ["ok", "failed", "ok", "failed", "failed"] }
    const deps = Array.from({ length: 150 }, (_, i) => ({ name: `dep-${i}`, status: i % 5 === 0 ? "down" : "ok", detail: "" })) as any
    const privacy = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, kind: "access", dueAt: now + (i - 150) * 86_400_000 }))
    const f = await within("evaluate alert rules, large snapshot", limit("evaluate", 1_000), () => evaluate({ now, latest, lastOk, recent, deps, privacy } as any))
    expect(f.length).toBeGreaterThan(50)
  })
  it("Halyard: splits, reads figures from and filters a 1,000,000-character call", async () => {
    const r = rng(3), lines = Array.from({ length: 9000 }, (_, i) => `${i % 2 ? "You" : "Them"}: ${"we talked about item ".repeat(3)}${Math.floor(r() * 1e6)} dollars at ${Math.floor(r() * 90)}% in Q${1 + (i % 4)} 2026, with ${i % 40} customers.`)
    const transcript = lines.join("\n").slice(0, 1_000_000)
    const parts = await within("splitTranscript 1,000,000 characters", limit("split", 1_000), () => splitTranscript(transcript))
    expect(parts.length).toBeGreaterThan(15); expect(parts.every((p) => p.length <= 45_000)).toBe(true)
    const figs = await within("extractNoteFigures 1,000,000 characters", limit("noteFigures", 1_000), () => extractNoteFigures(transcript)); expect(figs.length).toBeGreaterThanOrEqual(100)
    const turns = lines.map((text, i) => ({ channel: i % 2 ? "you" : "them", text }))
    await within("extractFigures 9,000 turns", limit("figures", 1_000), () => extractFigures(turns))
    const f = createRepeatFilter(); await within("repeat filter 9,000 turns", limit("repeat", 1_000), () => { let n = 0; lines.forEach((t, i) => { if (f.isRepeat(i % 2 ? "you" : "them", t, i * 1000)) n++ }); return n })
  }, 120_000)
  it("prints what was measured", () => { for (const t of timings) console.log(`budget  ${t.label.padEnd(48)} ${String(t.ms).padStart(7)} ms   limit ${t.limitMs}`) })
})
