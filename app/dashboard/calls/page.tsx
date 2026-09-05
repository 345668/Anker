import { CallIntelligence } from "@/components/calls/call-intelligence"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Call Intelligence — Anker",
  description: "Analyze investor call transcripts: sentiment, objections, next steps, and a draft follow-up.",
}

export default function CallsPage() {
  return <CallIntelligence />
}
