import { ToolsIndex } from "@/components/tools/tools-index"
import { NATIVE_TOOLS } from "@/lib/tools/manifest"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tools — Anker" }

export default function Page() {
  return <ToolsIndex tools={NATIVE_TOOLS} />
}
