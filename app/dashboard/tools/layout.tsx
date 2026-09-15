import { requirePersona } from "@/lib/auth/persona-guard"

/** The calculator toolbox is shared by founders and fund managers only. */
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  await requirePersona(["founder", "vc"])
  return children
}
