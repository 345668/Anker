import { requirePersona } from "@/lib/auth/persona-guard"
import { PlaybookEditor } from "@/components/halyard/playbook-editor"

export const dynamic = "force-dynamic"
export const metadata = { title: "Halyard playbooks — Anker" }
export default async function PlaybooksPage() { await requirePersona(["founder", "vc"]); return <PlaybookEditor /> }
