"use client"
export default function DashboardError({ reset }: { reset: () => void }) {
  return <div className="platform-page-header" role="alert"><h1 className="text-3xl font-display">We couldn’t load this workspace</h1><p className="my-4">Your records have not been changed. Try again to reconnect.</p><button onClick={reset} className="rounded border border-input px-4 py-3">Try again</button></div>
}
