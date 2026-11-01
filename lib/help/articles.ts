import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { getEffective, isFlagOn } from "@/lib/entitlements"
import { visibleTo } from "./search"
import generated from "./generated.json"
import type { HelpArticle } from "./types"

export const ALL_ARTICLES = (generated as { articles: HelpArticle[] }).articles

const FLAGS = ["halyard_web", "investor_signup", "listed_for_lps"]

/** The articles this person may read: their role, their plan's features and the platform switches. */
export async function helpFor(): Promise<{ articles: HelpArticle[]; persona: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { active } = await resolveActiveMembership(user.id)
  if (!active) return { articles: visibleTo(ALL_ARTICLES, { persona: "everyone" }), persona: null }
  const eff = await getEffective(active.orgId)
  const flags: Record<string, boolean> = {}
  for (const f of FLAGS) flags[f] = await isFlagOn(f, active.orgId)
  return { articles: visibleTo(ALL_ARTICLES, { persona: active.persona ?? "everyone", features: eff.features, flags }), persona: active.persona }
}
