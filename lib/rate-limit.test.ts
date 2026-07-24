import { describe, it, expect, vi, afterEach } from "vitest"
import { rateLimit } from "./rate-limit"

afterEach(() => vi.useRealTimers())

describe("rateLimit", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `test-block-${Math.random()}`
    const opts = { limit: 3, windowMs: 60_000 }
    expect(rateLimit(key, opts).ok).toBe(true)   // 1
    expect(rateLimit(key, opts).ok).toBe(true)   // 2
    const third = rateLimit(key, opts)           // 3
    expect(third.ok).toBe(true)
    expect(third.remaining).toBe(0)
    const fourth = rateLimit(key, opts)          // 4 → blocked
    expect(fourth.ok).toBe(false)
    expect(fourth.retryAfterMs).toBeGreaterThan(0)
  })

  it("keeps separate counters per key", () => {
    const opts = { limit: 1, windowMs: 60_000 }
    const a = `test-a-${Math.random()}`
    const b = `test-b-${Math.random()}`
    expect(rateLimit(a, opts).ok).toBe(true)
    expect(rateLimit(a, opts).ok).toBe(false) // a exhausted
    expect(rateLimit(b, opts).ok).toBe(true)  // b independent
  })

  it("resets after the window elapses", () => {
    vi.useFakeTimers()
    const key = `test-reset-${Math.random()}`
    const opts = { limit: 1, windowMs: 1_000 }
    expect(rateLimit(key, opts).ok).toBe(true)
    expect(rateLimit(key, opts).ok).toBe(false)
    vi.advanceTimersByTime(1_001)
    expect(rateLimit(key, opts).ok).toBe(true) // window rolled over
  })
})
