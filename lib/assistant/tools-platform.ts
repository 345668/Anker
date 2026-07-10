/**
 * Platform tools — the assistant's hands on Anker itself.
 *
 * Where tools.ts reaches OUT (web, LP database, documents) these reach IN:
 * the user's CRM, the deal pipeline, the LinkedIn network graph, the
 * outreach engine, and fund performance. All user-scoped tools take the
 * signed-in user's id from ToolCtx (threaded through the agent loop).
 *
 * Observations are compact JSON-ish text — the model reads them verbatim.
 */

import { sql } from "@/lib/db";
import type { ToolDef, ToolCtx } from "./tools";
import { getFundBySlug } from "@/lib/portfolio/funds";
import { getPipelineRollup, listDeals } from "@/lib/portfolio/deal-pipeline";
import { getFundPerformance } from "@/lib/portfolio/investments";
import { getIntroPaths, normalizeLinkedInUrl } from "@/lib/portfolio/network-graph";

const FLAGSHIP_SLUG = "svs-fund-ii";

function needUser(ctx?: ToolCtx): string {
  if (!ctx?.userId) throw new Error("No signed-in user in tool context.");
  return ctx.userId;
}

const fmt = (v: unknown) => (v == null ? "—" : String(v));

export const PLATFORM_TOOLS: Record<string, ToolDef> = {
  crm_overview: {
    name: "crm_overview",
    description:
      "The user's investor-CRM health: counts per stage, response rate, stale contacts (14d+ silent while contacted/responded), and open/overdue follow-up tasks.",
    params: "{} (no input)",
    run: async (_inp, ctx) => {
      const userId = needUser(ctx);
      const [stages, tasks] = await Promise.all([
        sql`
          select stage, count(*)::int as n,
                 count(*) filter (where stage in ('contacted','responded')
                   and (last_contacted_at is null or last_contacted_at < now() - interval '14 days'))::int as stale
          from crm_entries where user_id = ${userId} group by stage
        ` as Promise<Array<{ stage: string; n: number; stale: number }>>,
        sql`
          select count(*) filter (where done_at is null)::int as open,
                 count(*) filter (where done_at is null and due_at < now())::int as overdue
          from crm_tasks where user_id = ${userId}
        ` as Promise<Array<{ open: number; overdue: number }>>,
      ]);
      const byStage: Record<string, number> = {};
      let stale = 0, total = 0, contactedPlus = 0, engaged = 0;
      for (const r of stages) {
        byStage[r.stage] = r.n; total += r.n; stale += r.stale;
        if (r.stage !== "queued") contactedPlus += r.n;
        if (["responded", "meeting", "in_diligence", "committed"].includes(r.stage)) engaged += r.n;
      }
      const rate = contactedPlus ? Math.round((engaged / contactedPlus) * 100) : null;
      return {
        observation:
          `CRM: ${total} contacts. Funnel ${JSON.stringify(byStage)}. ` +
          `Response rate ${rate != null ? rate + "%" : "n/a"}. Stale ${stale}. ` +
          `Tasks: ${tasks[0]?.open ?? 0} open (${tasks[0]?.overdue ?? 0} overdue).`,
      };
    },
  },

  crm_search: {
    name: "crm_search",
    description:
      "Search the user's CRM contacts by name/firm/title with optional stage/tier filters. Returns id, name, title, stage, tier, score, last contact.",
    params: '{ "q"?: string, "stage"?: string, "tier"?: "A"|"B"|"C", "limit"?: number (<=25) }',
    run: async (inp, ctx) => {
      const userId = needUser(ctx);
      const q = String(inp?.q ?? "").trim();
      const stage = String(inp?.stage ?? "").trim() || null;
      const tier = String(inp?.tier ?? "").trim() || null;
      const limit = Math.min(Math.max(Number(inp?.limit) || 10, 1), 25);
      const rows = await sql`
        select id, display_name, display_title, display_type, stage, display_tier,
               display_score, last_contacted_at
        from crm_entries
        where user_id = ${userId}
          and (${q} = '' or display_name ilike ${"%" + q + "%"}
               or coalesce(display_title,'') ilike ${"%" + q + "%"}
               or coalesce(display_type,'') ilike ${"%" + q + "%"})
          and (${stage}::text is null or stage = ${stage})
          and (${tier}::text is null or display_tier = ${tier})
        order by display_score desc nulls last
        limit ${limit}
      ` as Array<Record<string, unknown>>;
      if (!rows.length) return { observation: "No CRM contacts match." };
      return {
        observation: rows.map((r) =>
          `${fmt(r.display_name)} [id=${r.id}] · ${fmt(r.display_title)} · stage=${r.stage}` +
          ` tier=${fmt(r.display_tier)} score=${fmt(r.display_score)} lastContact=${r.last_contacted_at ? String(r.last_contacted_at).slice(0, 10) : "never"}`,
        ).join("\n"),
      };
    },
  },

  crm_update_stage: {
    name: "crm_update_stage",
    description: "Move a CRM contact to a new stage (queued|contacted|responded|meeting|in_diligence|committed|passed). Use crm_search first to get the id.",
    params: '{ "entryId": string, "stage": string }',
    run: async (inp, ctx) => {
      const userId = needUser(ctx);
      const allowed = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"];
      const stage = String(inp?.stage ?? "");
      if (!allowed.includes(stage)) throw new Error(`stage must be one of ${allowed.join("|")}`);
      const rows = await sql`
        update crm_entries set stage = ${stage}, updated_at = now()
        where id = ${String(inp?.entryId ?? "")} and user_id = ${userId}
        returning display_name
      ` as Array<{ display_name: string }>;
      if (!rows.length) throw new Error("Entry not found.");
      return { observation: `${rows[0].display_name} moved to ${stage}.` };
    },
  },

  crm_add_task: {
    name: "crm_add_task",
    description: "Create a follow-up task/reminder, optionally attached to a CRM contact (get the id via crm_search) and with a due date.",
    params: '{ "title": string, "entryId"?: string, "dueAt"?: "YYYY-MM-DD" }',
    run: async (inp, ctx) => {
      const userId = needUser(ctx);
      const title = String(inp?.title ?? "").trim().slice(0, 300);
      if (!title) throw new Error("title required");
      const dueAt = inp?.dueAt ? new Date(String(inp.dueAt)) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Invalid dueAt");
      await sql`
        insert into crm_tasks (user_id, crm_entry_id, title, due_at)
        values (${userId}, ${inp?.entryId ? String(inp.entryId) : null}, ${title},
                ${dueAt ? dueAt.toISOString() : null})
      `;
      return { observation: `Task created: "${title}"${dueAt ? ` due ${dueAt.toISOString().slice(0, 10)}` : ""}. Visible in the CRM's Today queue.` };
    },
  },

  deal_pipeline: {
    name: "deal_pipeline",
    description: "The fund's deal-flow board: counts per stage, proposed-check total, and the active deals (company, stage, round, check).",
    params: "{} (no input)",
    run: async () => {
      const fund = await getFundBySlug(FLAGSHIP_SLUG);
      if (!fund) throw new Error("Flagship fund not found.");
      const [rollup, deals] = await Promise.all([
        getPipelineRollup(fund.id),
        listDeals(fund.id),
      ]);
      const active = deals.filter((d: any) => !["closed", "passed"].includes(d.stage)).slice(0, 25);
      return {
        observation:
          `Pipeline: ${JSON.stringify(rollup)}.\nActive deals:\n` +
          (active.map((d: any) =>
            `${d.company_name} [id=${d.id}] · ${d.stage} · ${fmt(d.round_name)} · check ${fmt(d.proposed_check)}`,
          ).join("\n") || "none"),
      };
    },
  },

  network_intro_paths: {
    name: "network_intro_paths",
    description:
      "Who can introduce the user to a person? Looks up the captured LinkedIn network (extension data) by name or profile URL and returns mutual-connection intro paths.",
    params: '{ "person": string (name or linkedin.com/in/... URL) }',
    run: async (inp, ctx) => {
      const userId = needUser(ctx);
      const person = String(inp?.person ?? "").trim();
      if (!person) throw new Error("person required");
      let url = normalizeLinkedInUrl(person);
      let label = person;
      if (!url || !url.includes("linkedin.com/in/")) {
        const rows = await sql`
          select linkedin_url, full_name, company, title from linkedin_connections
          where owner_id = ${userId} and full_name ilike ${"%" + person + "%"}
          limit 3
        ` as Array<{ linkedin_url: string; full_name: string; company: string | null; title: string | null }>;
        if (!rows.length) return { observation: `No captured connection matches "${person}". Sync the LinkedIn extension first.` };
        url = rows[0].linkedin_url;
        label = `${rows[0].full_name} (${fmt(rows[0].title)} @ ${fmt(rows[0].company)})`;
        if (rows.length > 1) label += ` — ${rows.length - 1} other match(es) ignored`;
      }
      const paths = await getIntroPaths(userId, url);
      return {
        observation: paths.length
          ? `Intro paths to ${label}: ${paths.map((p) => p.name).join(", ")} (${paths.length} mutual connection(s)).`
          : `No recorded mutuals for ${label}. Visit their LinkedIn profile with the extension to capture mutuals.`,
      };
    },
  },

  outreach_inbox: {
    name: "outreach_inbox",
    description: "The outreach engine's state: sends/open-rate (30d), follow-ups due (sent but unanswered), and unhandled inbound replies.",
    params: "{} (no input)",
    run: async (_inp, ctx) => {
      const userId = needUser(ctx);
      const [stats, due, replies] = await Promise.all([
        sql`
          select count(*) filter (where sent_at > now() - interval '30 days')::int as sent,
                 count(*) filter (where sent_at > now() - interval '30 days' and opens > 0)::int as opened,
                 count(*) filter (where needs_followup = true
                   or (followup_due_at is not null and followup_due_at <= now()))::int as due
          from outreach_messages where user_id = ${userId}
        ` as Promise<Array<{ sent: number; opened: number; due: number }>>,
        sql`
          select e.display_name, m.subject, m.sent_at, m.opens
          from outreach_messages m left join crm_entries e on e.id = m.crm_entry_id
          where m.user_id = ${userId} and m.sent_at is not null
            and (m.needs_followup = true or (m.followup_due_at is not null and m.followup_due_at <= now()))
          order by m.sent_at asc limit 10
        ` as Promise<Array<Record<string, unknown>>>,
        sql`
          select e.display_name, r.classification, r.received_at
          from outreach_replies r left join crm_entries e on e.id = r.crm_entry_id
          where r.user_id = ${userId} and r.approved is not true and r.sent_at is null
          order by r.received_at desc limit 10
        ` as Promise<Array<Record<string, unknown>>>,
      ]);
      const s = stats[0] ?? { sent: 0, opened: 0, due: 0 };
      const rate = s.sent ? Math.round((s.opened / s.sent) * 100) : null;
      return {
        observation:
          `Outreach 30d: ${s.sent} sent, open rate ${rate != null ? rate + "%" : "n/a"}. ` +
          `${s.due} follow-ups due.\n` +
          `Due: ${due.map((d) => `${fmt(d.display_name)} (sent ${String(d.sent_at).slice(0, 10)}, ${fmt(d.opens)} opens)`).join("; ") || "none"}\n` +
          `Unhandled replies: ${replies.map((r) => `${fmt(r.display_name)} [${fmt(r.classification)}]`).join("; ") || "none"}`,
      };
    },
  },

  fund_performance: {
    name: "fund_performance",
    description: "Flagship fund performance from the investment record: called/distributed/NAV, TVPI, DPI, RVPI, gross MOIC, net IRR.",
    params: "{} (no input)",
    run: async () => {
      const fund = await getFundBySlug(FLAGSHIP_SLUG);
      if (!fund) throw new Error("Flagship fund not found.");
      const perf = await getFundPerformance(fund.id);
      return { observation: `Fund ${fund.name}: ${JSON.stringify(perf)}` };
    },
  },
};
