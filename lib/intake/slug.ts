/** The fund's public intake address is /intake/<slug>. A slug is short, lowercase, and not one of ours. */
const RESERVED = new Set(["admin", "api", "app", "apply", "auth", "dashboard", "intake", "login", "pitch", "register", "settings", "tools", "www", "anker"])
const SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/

/** The cleaned slug, or an error message. Accents fold to letters, anything else becomes a hyphen. */
export function cleanSlug(input: unknown): { slug: string } | { error: string } {
  const slug = String(input ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  if (!SHAPE.test(slug)) return { error: "Use 3 to 60 letters, numbers and hyphens." }
  if (RESERVED.has(slug)) return { error: "That address is reserved. Choose another." }
  return { slug }
}
