import { requirePersonaWorkspace } from "@/lib/auth/persona-route"

/**
 * The founder persona area. Doc: docs/architecture/02-persona-exclusive-routing.md
 *
 * `requirePersonaWorkspace("founder")` 404s a caller with no founder workspace
 * rather than redirecting them to their own persona's home — doc 02 §2's
 * reasoning is that a redirect leaves someone looking at a different entity than
 * the one they asked for, with the URL quietly rewritten.
 *
 * The route group `(personas)` does not appear in the URL, so these pages live at
 * /founder/*.
 */
export default async function FounderLayout({ children }: { children: React.ReactNode }) {
  await requirePersonaWorkspace("founder")
  return <>{children}</>
}
