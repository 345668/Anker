/** Never infer a currency from locale or silently convert unlike denominations. */
export function formatMoney(value: number | null | undefined, currency?: string | null, compact = true): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const code = currency?.trim().toUpperCase()
  return new Intl.NumberFormat("en-GB", {
    ...(code && /^[A-Z]{3}$/.test(code) ? { style: "currency", currency: code, currencyDisplay: "code" } : { style: "decimal" }),
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value)
}
