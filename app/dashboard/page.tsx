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
import {
  getInvestmentFirms,
  getDeals,
  getContacts,
  getInvestors,
} from "@/lib/db/platform-queries";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch comprehensive platform stats from Neon database
  const [firms, deals, contacts, investors] = await Promise.all([
    getInvestmentFirms(500),
    getDeals(100),
    getContacts(100),
    getInvestors(100),
  ]);

  // Calculate real metrics
  const activeDeals = deals.filter(
    (d) =>
      !["closed_won", "won", "closed_lost", "lost"].includes(d.stage || ""),
  );
  const closedDeals = deals.filter((d) =>
    ["closed_won", "won"].includes(d.stage || ""),
  );
  const pipelineValue = activeDeals.reduce(
    (sum, d) => sum + Number(d.amount || 0),
    0,
  );
  const closedValue = closedDeals.reduce(
    (sum, d) => sum + Number(d.amount || 0),
    0,
  );

  // Get recent deals for activity feed
  const recentDeals = deals.slice(0, 5).map((deal) => ({
    id: deal.id,
    name: deal.name || "Unnamed Deal",
    stage: deal.stage || "prospect",
    amount: deal.amount,
    firmName: deal.firm_name ?? null,
    updatedAt: deal.updated_at,
  }));

  const stats = {
    totalFirms: firms.length,
    totalDeals: deals.length,
    totalContacts: contacts.length,
    totalInvestors: investors.length,
    activeDeals: activeDeals.length,
    closedDeals: closedDeals.length,
    pipelineValue,
    closedValue,
    recentDeals,
  };

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
