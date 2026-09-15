import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/tesseract/dashboard-content";
import { QuickStart } from "@/components/shell/quick-start";
import { TaskFeed } from "@/components/tasks/task-feed";
import { Spotlight, type SpotlightItem } from "@/components/shell/spotlight";
import { sql } from "@/lib/db";

async function getSpotlight(
  userId: string | undefined,
): Promise<SpotlightItem[]> {
  const items: SpotlightItem[] = [];
  try {
    if (userId) {
      const overdue =
        await sql`SELECT count(*)::int c FROM tasks WHERE assignee_id = ${userId} AND stage <> 'done' AND due_date < CURRENT_DATE`;
      if (overdue[0].c > 0)
        items.push({
          title: `Review: ${overdue[0].c} overdue to-do${overdue[0].c === 1 ? "" : "s"}`,
          sub: "Items past their due date",
          href: "#workspace-tasks",
          cta: "View tasks",
        });
    }
  } catch {
    /* best-effort */
  }
  return items;
}
import { getHomeData } from "@/lib/platform/home-data";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");
  const stats = await getHomeData(user.id);

  if (stats.persona === "lp") redirect("/lp");
  const spotlight = await getSpotlight(user?.id);
  if (stats.decisionsAwaitingReview > 0) spotlight.unshift({ title: `${stats.decisionsAwaitingReview} deal${stats.decisionsAwaitingReview === 1 ? "" : "s"} at investment committee`, sub: "Review evidence, votes and the next approval gate.", href: "/dashboard/portfolio/fund/deals", cta: "Review deals" });
  if (!stats.pipelineAvailable) spotlight.unshift({ title: stats.persona === "founder" ? "Set up your fundraising round" : "Configure your workspace", sub: "Choose the scope for your next decisions.", href: stats.persona === "founder" ? "/dashboard/fundraising/pipeline" : "/onboarding", cta: "Continue setup" });

  // User is guaranteed to exist due to layout auth check
  return (
    <DashboardContent user={user!} stats={stats}>
      <Spotlight items={spotlight} />
      <QuickStart persona={stats.persona ?? undefined} />
      <TaskFeed />
    </DashboardContent>
  );
}
