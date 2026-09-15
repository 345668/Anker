import { CallIntelligence } from "@/components/calls/call-intelligence"
import { callScope } from "@/lib/calls/access"
import { redirect } from "next/navigation"
export const dynamic = "force-dynamic"
export const metadata = { title: "Private call notes — Anker" }
export default async function LpCalls() {
  const scope = await callScope().catch(() => null)
  if (scope && scope.persona !== "lp") redirect("/dashboard/calls")
  return <CallIntelligence />
}
