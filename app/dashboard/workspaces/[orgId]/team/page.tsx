import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WorkspaceTeam } from "@/components/workspaces/team"
export const dynamic = "force-dynamic"
export default async function TeamPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login")
  const {orgId}=await params
  return <WorkspaceTeam key={orgId} orgId={orgId} />
}
