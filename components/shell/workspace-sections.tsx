"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Folder, Home } from "lucide-react"
import { groupsForPersona, activeWorkspaceDestination } from "@/lib/nav/taxonomy"
import { useNavPersona } from "./nav-persona"

/** Same progressive navigation on desktop and mobile. */
export function WorkspaceSections({ compact = false }: { compact?: boolean }) {
  const { active } = useNavPersona()
  const pathname = usePathname() || ""
  const groups = groupsForPersona(active)
  const current = activeWorkspaceDestination(pathname, groups)
  const home = active === "lp" ? "/lp" : "/dashboard"
  return <>
    <Link href={home} aria-label="Overview" title={compact ? "Overview" : undefined} aria-current={pathname === home ? "page" : undefined} className={`flex items-center gap-3 px-3 min-h-11 rounded mb-3 ${pathname === home ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"}`}><Home size={17} />{!compact && "Overview"}</Link>
    {groups.map(group => {
      const selected = group.items.some(item => item.href === current)
      const Icon = group.items[0].icon || Folder
      return <details key={`${group.heading}:${current ?? "home"}:${compact}`} open={selected && !compact} className="group mb-1">
        <summary title={compact ? group.heading : undefined} aria-label={group.heading === "Assistant" ? "Anker Assistant" : group.heading} className={`list-none [&::-webkit-details-marker]:hidden flex items-center gap-3 px-3 min-h-11 rounded cursor-pointer ${selected ? "text-foreground bg-accent/50 font-medium" : "text-muted-foreground hover:bg-accent/50"}`}>
          <Icon size={17} className="shrink-0" />{!compact && <><span className="flex-1 text-sm">{group.heading === "Assistant" ? "Anker Assistant" : group.heading}</span><ChevronDown size={14} className="group-open:rotate-180" /></>}
        </summary>
        <ul className={compact ? "space-y-1 py-2" : "ml-5 pl-3 border-l border-border my-2 space-y-1"}>
          {group.items.map(item => <li key={item.href}><Link href={item.href} aria-current={current === item.href ? "page" : undefined} aria-label={item.label} title={compact ? item.label : undefined} className={`flex items-center min-h-11 px-3 rounded text-sm ${current === item.href ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
            {compact ? (item.icon ? <item.icon size={17} /> : <Folder size={17} />) : item.href === "/dashboard/assistant" ? "Work with your records" : item.href === "/dashboard/anker-ai" ? "General research & chat" : item.label}
          </Link></li>)}
        </ul>
      </details>
    })}
  </>
}
