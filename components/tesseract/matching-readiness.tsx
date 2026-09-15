import type { ReadinessIssue } from "@/lib/matching/profile-readiness"
export function MatchingReadiness({ issues, dirty = false }: { issues: ReadinessIssue[]; dirty?: boolean }) {
  return <div className="rounded-md border border-border bg-muted/40 p-4 text-sm" aria-live="polite">
    <p className="font-medium">{issues.length ? "Complete these fields before matching" : dirty ? "Save your profile before matching" : "Required fields complete"}</p>
    {issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{issues.map((issue, i) => <li key={`${issue.field}-${i}`}>{issue.label}</li>)}</ul>}
    <p className="mt-2 text-xs text-muted-foreground">Upload a deck to fill empty fields, or enter them manually. Review extracted details before running.</p>
  </div>
}
