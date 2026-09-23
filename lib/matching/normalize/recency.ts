/**
 * How recent an investor's last known investment is (docs/architecture/16 §2.1).
 * Pure, so the scorer stays free of the database and the AI provider.
 */
export function activityRecency(lastInvestmentAt: string | Date | null | undefined, now = new Date()): number | null {
  if (!lastInvestmentAt) return null
  const d = lastInvestmentAt instanceof Date ? lastInvestmentAt : new Date(`${lastInvestmentAt}`)
  if (Number.isNaN(d.getTime())) return null
  const months = (now.getTime() - d.getTime()) / (30.44 * 86_400_000)
  if (months <= 6) return 1
  if (months <= 18) return 0.66
  if (months <= 24) return 0.33
  return 0
}
