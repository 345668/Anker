/**
 * Carta-style "Staff" pill — marks a privileged / owner-only action, tab, or
 * area so it reads as show-don't-hide rather than being silently absent. Matches
 * the orange staff badges in the Carta reference (Properties, Manage partners…).
 *
 * Use `label` to relabel (e.g. "Owner", "Beta"); default is "Staff".
 */
export function StaffBadge({ label = "Staff", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider bg-[#e5590f]/12 text-[#c8501a] dark:text-[#f4a06a] ${className}`}
    >
      {label}
    </span>
  )
}
