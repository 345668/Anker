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

  const spotlight = await getSpotlight(user?.id);

  // User is guaranteed to exist due to layout auth check
  return (
    <DashboardContent user={user!} stats={stats}>
      <QuickStart />
      <Spotlight items={spotlight} />
      <TaskFeed />
    </DashboardContent>
  );
}
