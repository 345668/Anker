import { requirePersonaWorkspace } from "@/lib/auth/persona-route"

/**
 * The VC persona area. Doc: docs/architecture/02-persona-exclusive-routing.md
 *
 * 404s a caller with no fund workspace rather than depositing them in their own
 * persona's equivalent page — doc 02 §2. The route group `(personas)` does not
 * appear in the URL, so these pages live at /vc/*.
 */
export default async function VcLayout({ children }: { children: React.ReactNode }) {
  await requirePersonaWorkspace("vc")
  return <>{children}</>
}
