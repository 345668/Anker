export async function call<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, { method: init?.method ?? "GET", headers: init?.body ? { "Content-Type": "application/json" } : undefined, credentials: "same-origin", body: init?.body ? JSON.stringify(init.body) : undefined })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(d?.error || "That could not be completed. Please try again.")
  return d as T
}
export const money = (n: number | null | undefined, cur = "") => (n == null ? "not stated" : `${cur ? cur + " " : ""}${Math.round(n).toLocaleString("en-US")}`)
export const field = "w-full rounded-md border bg-background px-3 py-2 text-sm"
export const btn = "inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
export const btnGhost = "inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
