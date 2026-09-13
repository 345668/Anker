/** Only accept internal auth return destinations, including browser slash normalization. */
export function safeAuthDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard"
  return value
}
