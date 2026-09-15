/** A successful HTTP response must also confirm application-level success. */
export async function requestJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = response.status === 204 ? {} : await response.json().catch(() => null)
  if (!response.ok || !body || body.ok === false || body.success === false) {
    throw new Error(body?.error || body?.message || `Request failed (${response.status}). Please try again.`)
  }
  return body as T
}
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Could not save. Please try again."

/** SWR-compatible fetcher: HTTP and application-level failures reject. */
export const swrFetcher = <T = any>(url: string) => requestJson<T>(url)
