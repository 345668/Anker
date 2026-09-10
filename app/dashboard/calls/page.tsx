import { CallIntelligence } from "@/components/calls/call-intelligence"
import { callScope } from "@/lib/calls/access"
import { redirect } from "next/navigation"
import { requirePersona } from "@/lib/auth/persona-guard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Call Intelligence — Anker",
  description: "Analyze investor call transcripts: sentiment, objections, next steps, and a draft follow-up.",
}

export default async function CallsPage() {
  await requirePersona(["founder", "vc"])
  const scope = await callScope().catch(() => null)
  if (scope?.persona === "lp") redirect("/lp/calls")
  return <CallIntelligence />
}
