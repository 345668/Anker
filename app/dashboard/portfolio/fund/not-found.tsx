import Link from "next/link"
export default function FundNotFound() {
  return <div className="platform-page-header"><h1 className="text-3xl font-display">Fund workspace unavailable</h1><p className="my-4">Select a fund workspace where you are an owner or administrator. If your fund has not been linked yet, ask your workspace administrator to finish setup.</p><Link className="underline" href="/dashboard">Back to your workspace</Link></div>
}
