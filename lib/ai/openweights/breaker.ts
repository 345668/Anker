/**
 * The lane's circuit breaker (docs/architecture/53 section 4.5). After `threshold` failures in a row the lane is marked down and not tried again until `coolMs` has passed; then ONE trial
 * call is let through (half-open): success closes it, failure opens it again for another cool-down. A cold start is not a failure: the caller reports it as `cold`, which neither opens the
 * breaker nor resets it. In memory per server instance, which is enough because each instance learns on its own within a few calls; it is not a shared health record.
 */
export type BreakerState = "closed" | "open" | "half-open"
export interface Breaker { allow(now?: number): boolean; success(): void; failure(now?: number): void; cold(): void; state(now?: number): BreakerState; failures(): number }
export function createBreaker(opt: { threshold?: number; coolMs?: number } = {}): Breaker {
  const threshold = opt.threshold ?? 3, coolMs = opt.coolMs ?? 60_000
  let fails = 0, openedAt = 0, trial = false
  const state = (now = Date.now()): BreakerState => (fails < threshold ? "closed" : now - openedAt >= coolMs ? "half-open" : "open")
  return {
    state, failures: () => fails,
    allow(now = Date.now()) { const s = state(now); if (s === "closed") return true; if (s === "open") return false; if (trial) return false; trial = true; return true },
    success() { fails = 0; trial = false },
    failure(now = Date.now()) { fails += 1; trial = false; if (fails >= threshold) openedAt = now },
    cold() { trial = false },
  }
}
