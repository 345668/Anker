/**
 * Anker AI Assistant — tool registry.
 *
 * Exposes the same capabilities used to run the Decile Capital test as
 * agent-callable tools: web search, web crawling, LP matchmaking,
 * investor-profile building, spreadsheet + document generation, and a
 * read-only investor database query. The agent loop (lib/assistant/agent.ts)
 * drives these via a JSON protocol on the local AI provider.
 *
 * Each tool returns a compact string `observation` (fed back to the model)
 * and optionally an `artifact` (a generated file the user can download).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

import { sql } from "@/lib/db";
import { search as webSearch } from "@/lib/agents/web-search";
import { crawl, crawlSite } from "@/lib/admin/web-crawler";
import { runLpMatching, type FundProfile } from "@/lib/matching/lp-matchmaking";
import { generateLpPipelineXlsx } from "@/lib/matching/xlsx-generator";
import { markdownToDocxBuffer } from "@/lib/ai/docx-export";
import { buildDeckPptx, buildDeckPdf, type DeckSpec, type SlideSpec } from "@/lib/decks/pitch-deck-builder"
import { buildInvestorProfile } from "@/lib/agents/profile-builder";
import { generateBatch } from "@/lib/ai/provider";
import { generateOutreachSequencesBatch, type FounderContext, type PartnerContext } from "@/lib/ai/dm-personalizer";
import { enrichFirm } from "@/lib/admin/enrichment";

// ── shared: normalized firm-type matching + bounded firm fetch ────────────────
// One place for the investment_firms type/keyword query reused by the
// query/score/draft/enrich tools (the `type` column is free-text & messy).
const FIRM_TYPE_PATTERNS: Record<string, string[]> = {
  "family-office": ["familyoffice", "wealth", "multifamilyoffice", "singlefamilyoffice"],
  "vc": ["vc", "venturecapital", "venture"],
  "accelerator": ["accelerator", "incubator"],
  "corporate": ["corporate", "cvc"],
  "angel": ["angel"],
  "private-equity": ["privateequity", "growthequity"],
};
function typePatterns(type?: string): string[] | null {
  if (!type) return null;
  const k = String(type).toLowerCase().trim();
  return (FIRM_TYPE_PATTERNS[k] ?? [k.replace(/[^a-z0-9]/g, "")]).map((p) => `%${p}%`);
}
interface FirmRow { id: string; name: string; type: string | null; description: string | null; sectors: any; hq_location: string | null; location: string | null; website: string | null; emails: any }
async function fetchFirms(opts: { type?: string; keyword?: string; ids?: string[]; limit: number }): Promise<FirmRow[]> {
  const limit = Math.max(1, Math.min(50, opts.limit));
  if (Array.isArray(opts.ids) && opts.ids.length) {
    return (await sql`SELECT id,name,type,description,sectors,hq_location,location,website,emails
      FROM investment_firms WHERE id = ANY(${opts.ids}) LIMIT ${limit}`) as unknown as FirmRow[];
  }
  const patterns = typePatterns(opts.type);
  const kwRaw = opts.keyword ? String(opts.keyword).toLowerCase().trim() : "";
  const kw = kwRaw ? `%${kwRaw}%` : null;
  if (patterns && kw) {
    return (await sql`SELECT id,name,type,description,sectors,hq_location,location,website,emails FROM investment_firms
      WHERE regexp_replace(lower(coalesce(type,'')),'[^a-z0-9]','','g') LIKE ANY(${patterns})
        AND (lower(coalesce(name,'')) LIKE ${kw} OR lower(coalesce(description,'')) LIKE ${kw} OR lower(coalesce(sectors::text,'')) LIKE ${kw} OR lower(coalesce(industry,'')) LIKE ${kw})
      ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`) as unknown as FirmRow[];
  }
  if (patterns) {
    return (await sql`SELECT id,name,type,description,sectors,hq_location,location,website,emails FROM investment_firms
      WHERE regexp_replace(lower(coalesce(type,'')),'[^a-z0-9]','','g') LIKE ANY(${patterns})
      ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`) as unknown as FirmRow[];
  }
  if (kw) {
    return (await sql`SELECT id,name,type,description,sectors,hq_location,location,website,emails FROM investment_firms
      WHERE (lower(coalesce(name,'')) LIKE ${kw} OR lower(coalesce(description,'')) LIKE ${kw} OR lower(coalesce(sectors::text,'')) LIKE ${kw} OR lower(coalesce(industry,'')) LIKE ${kw})
      ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`) as unknown as FirmRow[];
  }
  return (await sql`SELECT id,name,type,description,sectors,hq_location,location,website,emails FROM investment_firms
    ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`) as unknown as FirmRow[];
}
function tierFor(score: number): string {
  if (score >= 9) return "Tier 1";
  if (score >= 7) return "Tier 2";
  if (score >= 5) return "Tier 3";
  if (score >= 3) return "Tier 4";
  return "Drop";
}
function firstWord(s: string): string { return String(s ?? "").trim().split(/\s+/)[0] ?? ""; }
function sectorsText(s: any): string { return Array.isArray(s) ? s.filter((x) => typeof x === "string").join(", ") : (typeof s === "string" ? s : ""); }

export interface ToolArtifact { name: string; url: string; kind: "xlsx" | "docx" | "csv" | "png" | "pptx" | "pdf" }
export interface ToolResult { observation: string; artifact?: ToolArtifact }
export interface ToolDef {
  name: string;
  description: string;
  /** Human-readable parameter hints shown to the model. */
  params: string;
  run: (input: any) => Promise<ToolResult>;
}

// ── artifact output dir ──────────────────────────────────────────────────────
//
// On local dev / standalone Node, we write into public/generated/ so files
// are served by Next.js's static handler.  On Vercel serverless, public/ is
// read-only (bundled at build time) — only /tmp/ is writable inside the
// Lambda.  We detect the deploy by checking VERCEL/AWS_LAMBDA_FUNCTION_NAME
// or by catching EROFS on the first write, then write to /tmp/anker-
// artifacts/ and surface the file via a dynamic /api/artifacts/<file> route
// that streams it back from /tmp.  Files in /tmp survive only within the
// warm function instance — that's fine for an interactive assistant.
const STATIC_OUT_DIR = path.join(process.cwd(), "public", "generated");
const TMP_OUT_DIR = path.join("/tmp", "anker-artifacts");
const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NEXT_RUNTIME === "edge"
);
async function saveArtifact(buf: Buffer, base: string, kind: ToolArtifact["kind"]): Promise<ToolArtifact> {
  const safe = base.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "output";
  const file = `${safe}_${randomUUID().slice(0, 8)}.${kind}`;

  // Prefer the static dir locally; fall back to /tmp on serverless or on EROFS.
  const tryDirs = isServerless
    ? [TMP_OUT_DIR, STATIC_OUT_DIR]
    : [STATIC_OUT_DIR, TMP_OUT_DIR];

  let lastErr: any = null;
  for (const dir of tryDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, file), buf);
      // Files written to the static dir are served directly; everything else
      // routes through the dynamic /api/artifacts/<file> streamer.
      const url = dir === STATIC_OUT_DIR ? `/generated/${file}` : `/api/artifacts/${file}`;
      return { name: file, url, kind };
    } catch (e: any) {
      lastErr = e;
      // EROFS / EACCES / ENOENT — fall through to the next candidate dir.
      if (!["EROFS", "EACCES", "ENOENT", "EPERM"].includes(e?.code)) throw e;
    }
  }
  throw new Error(`saveArtifact: no writable directory (${lastErr?.code ?? "unknown"})`);
}

function clip(s: string, n = 1500): string {
  s = (s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + " …[truncated]" : s;
}

// ── tools ────────────────────────────────────────────────────────────────────
export const TOOLS: Record<string, ToolDef> = {
  web_search: {
    name: "web_search",
    description: "Search the web (via SearXNG) for current information, companies, people, or facts.",
    params: `{ "query": string, "limit"?: number }`,
    async run({ query, limit }) {
      const hits = await webSearch(String(query ?? ""), { limit: Math.min(Number(limit) || 6, 10) });
      if (!hits.length) return { observation: `No results for "${query}". SearXNG may be offline (SEARXNG_URL).` };
      const lines = hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${clip(h.snippet, 220)}`);
      return { observation: `Top results for "${query}":\n` + lines.join("\n") };
    },
  },

  web_crawl: {
    name: "web_crawl",
    description: "Fetch and extract a web page's clean main text. Default mode is single-page; pass mode: \"site\" for a depth-limited multi-page crawl that follows about/team/portfolio/thesis links from the seed.",
    params: `{ "url": string, "mode"?: "page" | "site", "maxPages"?: number (site mode only, default 4, cap 8) }`,
    async run({ url, mode, maxPages }) {
      const u = String(url ?? "");
      if (!/^https?:\/\//.test(u)) return { observation: "Provide a full http(s) URL." };
      try {
        if (mode === "site") {
          const cap = Math.min(Math.max(Number(maxPages) || 4, 1), 8);
          const result = await crawlSite(u, { maxPages: cap, concurrency: 2 });
          const summary = result.pages.map((p) => {
            const title = p.metadata?.title || p.metadata?.ogTitle || p.finalUrl;
            const path = (() => { try { return new URL(p.finalUrl).pathname; } catch { return p.finalUrl; }})();
            return `[${path}] ${title}: ${clip(p.text || "", 1200)}`;
          }).join("\n\n");
          return { observation: `Crawled ${result.pages.length} page(s) of ${u} (errors: ${result.errors.length}).\n\n${summary}` };
        }
        const page = await crawl(u);
        const title = (page as any).title || (page as any).metadata?.title || u;
        const text = (page as any).text || (page as any).content || "";
        return { observation: `Page: ${title}\nURL: ${u}\n\n${clip(text, 2500)}` };
      } catch (e: any) {
        return { observation: `Failed to crawl ${u}: ${e?.message ?? "error"}` };
      }
    },
  },

  matchmake_lps: {
    name: "matchmake_lps",
    description: "Score the investor database for LP fit against a fund's profile and produce a ranked pipeline + an XLSX. Use for fundraising / finding family offices, funds-of-funds, and other LPs.",
    params: `{ "fundName": string, "targetRaiseUsd"?: number, "sectors"?: string[], "geographicFocus"?: string[], "headquarters"?: string, "thesisKeywords"?: string[], "preferLesserKnown"?: boolean, "rightSizeToTarget"?: boolean, "excludeHouseholdNames"?: boolean, "top"?: number }`,
    async run(inp) {
      const profile: FundProfile = {
        id: `assistant_${Date.now()}`,
        name: String(inp.fundName ?? "Fund"),
        targetRaise: Number(inp.targetRaiseUsd) || null,
        sectors: Array.isArray(inp.sectors) ? inp.sectors : [],
        geographicFocus: Array.isArray(inp.geographicFocus) ? inp.geographicFocus : [],
        headquartersLocation: inp.headquarters ?? null,
        thesisKeywords: Array.isArray(inp.thesisKeywords) ? inp.thesisKeywords : [],
        preferLesserKnown: !!inp.preferLesserKnown,
        rightSizeToTarget: inp.rightSizeToTarget !== false,
        excludeHouseholdNames: !!inp.excludeHouseholdNames,
      };
      const top = Math.min(Number(inp.top) || 10, 50);
      const result = await runLpMatching(profile, { maxFirms: 500, maxContacts: 500 });
      const firms = result.firms.slice(0, top);
      const contacts = result.contacts.slice(0, top);
      const xlsx = generateLpPipelineXlsx(result);
      const artifact = await saveArtifact(xlsx, `LP_Pipeline_${profile.name}`, "xlsx");
      const fLines = firms.map((f, i) => `${i + 1}. ${f.name} — ${f.score} (${f.tier}) ${f.tags.join(",")} | ${f.location} | ${f.aum}`);
      const cLines = contacts.map((c, i) => `${i + 1}. ${c.name} (${c.title}) @ ${c.type} — ${c.score} ${c.email ? "✉" : ""}`);
      return {
        observation:
          `Scored ${result.totalFirmsScored} firms + ${result.totalContactsScored} investors for "${profile.name}".\n` +
          `Qualified: ${result.qualifiedFirms} firms, ${result.qualifiedContacts} contacts; ${result.anchorCandidates} anchors; ${result.contactsWithEmail} with email.\n\n` +
          `Top firms:\n${fLines.join("\n") || "(none)"}\n\nTop contacts:\n${cLines.join("\n") || "(none)"}`,
        artifact,
      };
    },
  },

  build_investor_profile: {
    name: "build_investor_profile",
    description: "Build an enriched profile (thesis, hooks, recent signals) for one investor or firm, by id or name. Used to prep tailored outreach.",
    params: `{ "investorId"?: string, "firmId"?: string }`,
    async run(inp) {
      try {
        const p: any = await buildInvestorProfile({ investorId: inp.investorId, firmId: inp.firmId });
        return {
          observation:
            `Profile: ${p.headline ?? ""}\n` +
            `Primary hook: ${p.primaryHook?.text ?? p.talkingPoints?.[0] ?? "n/a"}\n` +
            `Fund thesis: ${p.fundThesis ?? "n/a"}\n` +
            `Talking points: ${(p.talkingPoints ?? []).slice(0, 4).join(" | ")}\n` +
            `Urgency: ${p.urgency ?? "n/a"}`,
        };
      } catch (e: any) {
        return { observation: `Profile build failed: ${e?.message ?? "error"}` };
      }
    },
  },

  query_investors: {
    name: "query_investors",
    description: "Read-only search of the Anker firm/LP database (table: investment_firms — family offices, VCs, funds-of-funds, accelerators, corporates, PE). Filter by type and/or a keyword (matched on name, description, sectors, industry, location). Note: the 'investors' table is PEOPLE (first_name/last_name); firm-type LPs like family offices live in investment_firms.",
    params: `{ "type"?: "family-office"|"vc"|"accelerator"|"corporate"|"angel"|"private-equity", "keyword"?: string, "limit"?: number }`,
    async run(inp) {
      const limit = Math.min(Number(inp.limit) || 15, 50);
      const kwRaw = inp.keyword ? String(inp.keyword).toLowerCase().trim() : "";
      const kw = kwRaw ? `%${kwRaw}%` : null;
      const typeRaw = inp.type ? String(inp.type).toLowerCase().trim() : "";
      // The firm `type` column is free-text and inconsistent ("VC", "VC Firm",
      // "Venture Capital", "Family Office"...). Match on a punctuation-stripped
      // normalized form against a set of known variants for each requested type.
      const TYPE_PATTERNS: Record<string, string[]> = {
        "family-office": ["familyoffice", "wealth", "multifamilyoffice", "singlefamilyoffice"],
        "vc": ["vc", "venturecapital", "venture"],
        "accelerator": ["accelerator", "incubator"],
        "corporate": ["corporate", "cvc"],
        "angel": ["angel"],
        "private-equity": ["privateequity", "growthequity"],
      };
      const patterns = typeRaw
        ? (TYPE_PATTERNS[typeRaw] ?? [typeRaw.replace(/[^a-z0-9]/g, "")]).map((p) => `%${p}%`)
        : null;
      // keyword condition reused across branches (built inline per the sql tag).
      let rows: any[];
      if (patterns && kw) {
        rows = await sql`SELECT name, type, coalesce(hq_location, location) AS location, website, emails
          FROM investment_firms
          WHERE regexp_replace(lower(coalesce(type,'')), '[^a-z0-9]', '', 'g') LIKE ANY(${patterns})
            AND (lower(coalesce(name,'')) LIKE ${kw} OR lower(coalesce(description,'')) LIKE ${kw}
                 OR lower(coalesce(sectors::text,'')) LIKE ${kw} OR lower(coalesce(industry,'')) LIKE ${kw}
                 OR lower(coalesce(hq_location,'') || ' ' || coalesce(location,'')) LIKE ${kw})
          ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`;
      } else if (patterns) {
        rows = await sql`SELECT name, type, coalesce(hq_location, location) AS location, website, emails
          FROM investment_firms
          WHERE regexp_replace(lower(coalesce(type,'')), '[^a-z0-9]', '', 'g') LIKE ANY(${patterns})
          ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`;
      } else if (kw) {
        rows = await sql`SELECT name, type, coalesce(hq_location, location) AS location, website, emails
          FROM investment_firms
          WHERE (lower(coalesce(name,'')) LIKE ${kw} OR lower(coalesce(description,'')) LIKE ${kw}
                 OR lower(coalesce(sectors::text,'')) LIKE ${kw} OR lower(coalesce(industry,'')) LIKE ${kw}
                 OR lower(coalesce(hq_location,'') || ' ' || coalesce(location,'')) LIKE ${kw})
          ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`;
      } else {
        rows = await sql`SELECT name, type, coalesce(hq_location, location) AS location, website, emails
          FROM investment_firms ORDER BY portfolio_count DESC NULLS LAST LIMIT ${limit}`;
      }
      if (!rows.length) return { observation: "No matching firms in investment_firms for those filters." };
      const fmtEmail = (e: any): string => {
        if (Array.isArray(e)) { const s = e.find((x) => typeof x === "string"); return s ?? ""; }
        return typeof e === "string" ? e : "";
      };
      return {
        observation: rows.map((r: any, i: number) =>
          `${i + 1}. ${r.name} [${r.type ?? "—"}] ${r.location ?? ""} ${fmtEmail(r.emails)}`.trim()).join("\n"),
      };
    },
  },

  // ── SCORE / QUALIFY (scraping-playbook Layer 3 / connectors SCORE step) ──
  // In-house alternative to Clay thesis-scoring. ONE tool call scores a whole
  // batch of firms against a thesis using the rate-limited generateBatch (the
  // failover chain + AI_MAX_RPM throttle the calls), so the agent never fires
  // one AI call per row and never blows the API threshold.
  score_investors: {
    name: "score_investors",
    description: "Thesis-score a BATCH of firms/LPs (1-10 + tier + reason) against a fund thesis, ranked, with an XLSX. In-house alternative to Clay scoring. Batched + rate-limited — prefer this over scoring rows one by one.",
    params: `{ "thesis": string, "type"?: "family-office"|"vc"|"accelerator"|"corporate"|"angel"|"private-equity", "keyword"?: string, "ids"?: string[], "limit"?: number(<=40) }`,
    async run(inp) {
      const thesis = String(inp.thesis ?? "").trim();
      if (!thesis) return { observation: "Provide a 'thesis' to score against." };
      const limit = Math.min(Number(inp.limit) || 25, 40); // hard cap: bound the batch
      const firms = await fetchFirms({ type: inp.type, keyword: inp.keyword, ids: inp.ids, limit });
      if (!firms.length) return { observation: "No firms matched those filters in investment_firms." };

      const prompts = firms.map((f) =>
        `Score this firm's fit (integer 1-10) for the fund thesis. Reply ONLY JSON {"score":<1-10>,"reason":"<<=18 words>"}.\n` +
        `THESIS: ${thesis}\nFIRM: ${f.name} | type: ${f.type ?? "?"} | sectors: ${sectorsText(f.sectors) || "?"} | location: ${f.hq_location ?? f.location ?? "?"}\n` +
        `DESC: ${clip(f.description ?? "", 300)}`);
      // Batched, rate-limited generation. Provider-aware concurrency + global
      // rateGate keep this under the per-minute ceiling.
      const outs = await generateBatch(prompts, { json: true, maxTokens: 80, temperature: 0.2, task: "matchmaking" as any }, 4);

      const scored = firms.map((f, i) => {
        let score = 0, reason = "";
        try { const j = JSON.parse((outs[i] || "{}").replace(/^```(?:json)?|```$/g, "").trim()); score = Math.max(0, Math.min(10, Number(j.score) || 0)); reason = String(j.reason ?? ""); } catch { /* AI empty/garbled */ }
        // Deterministic fallback when AI is unavailable (quota): keyword overlap.
        if (!score) { const blob = `${f.name} ${f.type ?? ""} ${sectorsText(f.sectors)} ${f.description ?? ""}`.toLowerCase(); const hits = thesis.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && blob.includes(w)).length; score = Math.min(8, 3 + hits); reason = reason || `${hits} thesis-term overlaps (heuristic)`; }
        return { name: f.name, type: f.type ?? "", location: f.hq_location ?? f.location ?? "", website: f.website ?? "", score, tier: tierFor(score), reason };
      }).sort((a, b) => b.score - a.score);

      const ws = XLSX.utils.aoa_to_sheet([["Firm", "Type", "Location", "Score", "Tier", "Reason", "Website"], ...scored.map((s) => [s.name, s.type, s.location, s.score, s.tier, s.reason, s.website])]);
      ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 7 }, { wch: 8 }, { wch: 50 }, { wch: 28 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Scored");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "Scored_Investors", "xlsx");
      const top = scored.slice(0, 12).map((s, i) => `${i + 1}. ${s.name} — ${s.score} (${s.tier}) | ${s.reason}`);
      return { observation: `Scored ${scored.length} firms against the thesis (batched).\nTop:\n${top.join("\n")}\n\nXLSX → ${artifact.url}`, artifact };
    },
  },

  // ── DRAFT (scraping-playbook outreach_writer / connectors DRAFT step) ──────
  // In-house alternative to the HeyReach copy step. Generates the 3-step
  // LinkedIn sequence (main copy) for a BATCH of firms in one call via the
  // rate-limited batch personalizer. Draft-only — produces an XLSX of copy.
  draft_outreach_batch: {
    name: "draft_outreach_batch",
    description: "Draft the LinkedIn outreach sequence (day0/day3/day7/day14) for a BATCH of firms in one rate-limited pass, returning an XLSX of copy. Draft-only (no send). Use instead of drafting one investor at a time.",
    params: `{ "founder": { "companyName": string, "oneLiner": string, "facts"?: string[], "calendarUrl"?: string }, "type"?: string, "keyword"?: string, "ids"?: string[], "limit"?: number(<=25) }`,
    async run(inp) {
      const f = inp.founder ?? {};
      if (!f.companyName || !f.oneLiner) return { observation: "Provide founder.companyName + founder.oneLiner." };
      const limit = Math.min(Number(inp.limit) || 15, 25); // bound the batch
      const firms = await fetchFirms({ type: inp.type, keyword: inp.keyword, ids: inp.ids, limit });
      if (!firms.length) return { observation: "No firms matched those filters." };
      const founder: FounderContext = { companyName: String(f.companyName), oneLiner: String(f.oneLiner), facts: Array.isArray(f.facts) ? f.facts.map(String) : [], calendarUrl: f.calendarUrl ? String(f.calendarUrl) : undefined };
      const partners: PartnerContext[] = firms.map((fm) => ({ firstName: firstWord(fm.name), fullName: fm.name, firm: fm.name, recommendedHook: sectorsText(fm.sectors) || undefined }));
      const results = await generateOutreachSequencesBatch(founder, partners, 4); // rate-limited inside
      const rows = results.map((r) => [r.partner.fullName, r.sequence.day0, r.sequence.day3, r.sequence.day7, r.sequence.day14]);
      const ws = XLSX.utils.aoa_to_sheet([["Firm", "Day 0 (connect)", "Day 3 (follow-up)", "Day 7 (angle)", "Day 14 (close)"], ...rows]);
      ws["!cols"] = [{ wch: 28 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 50 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Drafts");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, `Outreach_Drafts_${founder.companyName}`, "xlsx");
      return { observation: `Drafted ${rows.length} LinkedIn sequences (batched, draft-only). XLSX → ${artifact.url}`, artifact };
    },
  },

  // ── ENRICH (scraping-playbook Layer 2 / connectors ENRICH step) ───────────
  // In-house alternative to the Clay firmographic waterfall: fills thin firm
  // rows (description/sectors) via the existing enrichment pipeline. Bounded
  // + sequential to stay polite on the API threshold.
  enrich_firms: {
    name: "enrich_firms",
    description: "Enrich a BOUNDED set of firms (fill missing description/sectors) via the in-house enrichment pipeline. Alternative to Clay firmographic enrichment. Capped + sequential to protect the API threshold.",
    params: `{ "ids"?: string[], "type"?: string, "keyword"?: string, "limit"?: number(<=10) }`,
    async run(inp) {
      const limit = Math.min(Number(inp.limit) || 8, 10); // hard cap — enrichment is heavy
      const firms = await fetchFirms({ type: inp.type, keyword: inp.keyword, ids: inp.ids, limit });
      const thin = firms.filter((f) => !f.description || !(Array.isArray(f.sectors) && f.sectors.length));
      if (!thin.length) return { observation: `All ${firms.length} matched firms already have description + sectors. Nothing to enrich.` };
      let ok = 0; const notes: string[] = [];
      for (const f of thin) {
        try { const r = await enrichFirm({ firmId: f.id, overwrite: false }); ok++; notes.push(`${f.name}: ${r.changes.length} field(s) via ${r.generatedBy}`); }
        catch (e: any) { notes.push(`${f.name}: ${e?.message ?? "enrich failed"}`); }
      }
      return { observation: `Enriched ${ok}/${thin.length} thin firms (capped at ${limit}).\n${notes.slice(0, 10).join("\n")}` };
    },
  },

  generate_spreadsheet: {
    name: "generate_spreadsheet",
    description: "Create an .xlsx file from a header row and data rows. Returns a download link.",
    params: `{ "title": string, "columns": string[], "rows": (string|number)[][] }`,
    async run(inp) {
      const columns: string[] = Array.isArray(inp.columns) ? inp.columns.map(String) : [];
      const rows: any[][] = Array.isArray(inp.rows) ? inp.rows : [];
      if (!columns.length) return { observation: "Provide a non-empty 'columns' array." };
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      ws["!cols"] = columns.map(() => ({ wch: 22 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, String(inp.title ?? "spreadsheet"), "xlsx");
      return { observation: `Spreadsheet created with ${rows.length} rows × ${columns.length} cols → ${artifact.url}`, artifact };
    },
  },

  generate_document: {
    name: "generate_document",
    description: "Create a formatted .docx from Markdown (use # / ## headings, **bold**, - bullets). Returns a download link.",
    params: `{ "title": string, "markdown": string }`,
    async run(inp) {
      const md = String(inp.markdown ?? "");
      if (!md.trim()) return { observation: "Provide non-empty 'markdown'." };
      const buf = await markdownToDocxBuffer(md, inp.title ? String(inp.title) : undefined);
      const artifact = await saveArtifact(buf, String(inp.title ?? "document"), "docx");
      return { observation: `Document created (${md.length} chars of Markdown) → ${artifact.url}`, artifact };
    },
  },

  // ─── Qwen multimodal tools (Alibaba DashScope) ─────────────────────────
  // Surfaced in the AI assistant when DASHSCOPE_API_KEY (or admin Settings
  // qwenApiKey) is set.  All hit the OpenAI-compatible /chat/completions
  // endpoint via Qwen-VL for image work, except generate_image which uses
  // the dedicated multimodal-generation endpoint.

  analyze_image: {
    name: "analyze_image",
    description: "Analyze an image (chart, screenshot, pitch-deck slide, photo). Returns a structured description of what's in it. Uses Qwen3-VL-Plus.",
    params: `{ "imageUrl"?: string, "imageBase64"?: string, "prompt"?: string }`,
    async run(inp) {
      const text = await callQwenVision({
        prompt: String(inp.prompt ?? "Describe what's in this image. Pull out any text, numbers, logos, and visible structure."),
        imageUrl: inp.imageUrl ? String(inp.imageUrl) : undefined,
        imageBase64: inp.imageBase64 ? String(inp.imageBase64) : undefined,
        model: "qwen3-vl-plus",
      });
      if (!text.ok) return { observation: `Image analysis failed: ${text.error}` };
      return { observation: text.text };
    },
  },

  ocr_image: {
    name: "ocr_image",
    description: "Extract text from an image (scan, screenshot, photo of a document). Specialized for OCR — better than analyze_image for text-heavy images. Uses Qwen-VL-OCR.",
    params: `{ "imageUrl"?: string, "imageBase64"?: string }`,
    async run(inp) {
      const text = await callQwenVision({
        prompt: "Extract ALL text from this image, preserving structure (line breaks, bullet points, columns where possible). Return ONLY the extracted text; no commentary.",
        imageUrl: inp.imageUrl ? String(inp.imageUrl) : undefined,
        imageBase64: inp.imageBase64 ? String(inp.imageBase64) : undefined,
        model: "qwen-vl-ocr",
      });
      if (!text.ok) return { observation: `OCR failed: ${text.error}` };
      return { observation: text.text };
    },
  },

  generate_image: {
    name: "generate_image",
    description: "Generate an image from a text prompt. Free-tier friendly; uses z-image-turbo by default. Returns a download URL for the PNG.",
    params: `{ "prompt": string, "model"?: "z-image-turbo" | "qwen-image-2.0" | "wan2.6-t2i", "size"?: "1024x1024" | "1024x1792" | "1792x1024" }`,
    async run(inp) {
      const prompt = String(inp.prompt ?? "").trim();
      if (!prompt) return { observation: "Provide a non-empty 'prompt'." };
      const model = String(inp.model ?? "z-image-turbo");
      const size = String(inp.size ?? "1024x1024");
      const r = await callQwenImageGen({ prompt, model, size });
      if (!r.ok) return { observation: `Image generation failed: ${r.error}` };
      const fname = `qwen-image-${Date.now()}.png`;
      const artifact = await saveArtifact(r.bytes, fname.replace(/\.png$/, ""), "png" as any);
      return { observation: `Image generated (${prompt.slice(0, 80)}) → ${artifact.url}`, artifact };
    },
  },

  create_pitch_deck: {
    name: "create_pitch_deck",
    description: "Create a pitch deck as .pptx and/or .pdf from a structured slide outline. Use this to produce investor decks, board updates, partner overviews. When a slide has an 'imagePrompt' the tool calls generate_image (Qwen text-to-image) to fill the right half of the slide.  Always pass at least 6 slides: cover + problem + solution + market + traction + team + ask + closer.",
    params: `{ "deck": { "title": string, "subtitle"?: string, "author"?: string, "theme"?: { "accent"?: string, "background"?: string, "text"?: string, "muted"?: string }, "slides": [{ "kind"?: "title"|"content"|"closer", "title": string, "subtitle"?: string, "bullets"?: string[], "body"?: string, "notes"?: string, "imagePrompt"?: string, "imageModel"?: "z-image-turbo"|"qwen-image-2.0"|"wan2.6-t2i" }] }, "formats"?: ["pptx", "pdf"] }`,
    async run(inp) {
      const deck = inp?.deck as DeckSpec | undefined;
      if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) {
        return { observation: "Provide a 'deck' with at least one slide." };
      }
      const formats: ("pptx" | "pdf")[] = Array.isArray(inp?.formats) && inp.formats.length
        ? (inp.formats as any[]).filter((f) => f === "pptx" || f === "pdf")
        : ["pptx", "pdf"];

      // 1. Generate images for any slide that has an imagePrompt.  Best-effort.
      const slidesWithImages: SlideSpec[] = [];
      for (const slide of deck.slides) {
        const out: SlideSpec = { ...slide };
        const prompt = (slide as any).imagePrompt as string | undefined;
        const model = (slide as any).imageModel as string | undefined;
        if (prompt && prompt.trim().length > 4) {
          const r = await callQwenImageGen({
            prompt: prompt.trim(),
            model: model && ["z-image-turbo", "qwen-image-2.0", "wan2.6-t2i"].includes(model) ? model : "z-image-turbo",
            size: "1024x1024",
          });
          if (r.ok) {
            out.image = r.bytes;
            out.imagePrompt = prompt.trim();
          }
        }
        slidesWithImages.push(out);
      }

      const finalDeck: DeckSpec = { ...deck, slides: slidesWithImages };
      const baseName = (deck.title || "Pitch_Deck").slice(0, 60);

      let lastArtifact: any = null;
      const links: string[] = [];
      if (formats.includes("pptx")) {
        const buf = await buildDeckPptx(finalDeck);
        const art = await saveArtifact(buf, baseName, "pptx");
        links.push(art.url);
        lastArtifact = art;
      }
      if (formats.includes("pdf")) {
        const buf = await buildDeckPdf(finalDeck);
        const art = await saveArtifact(buf, baseName, "pdf");
        links.push(art.url);
        lastArtifact = art;
      }
      const imagedSlides = slidesWithImages.filter((s) => !!s.image).length;
      return {
        observation: `Pitch deck '${deck.title}' built — ${deck.slides.length} slides${imagedSlides ? `, ${imagedSlides} with generated images` : ""}. ${links.length > 1 ? "Files: " : "File: "}${links.join("  ·  ")}`,
        artifact: lastArtifact,
      };
    },
  },

  improve_pitch_deck: {
    name: "improve_pitch_deck",
    description: "Take an existing deck (its extracted text + optional critique) and produce an improved version as .pptx + .pdf with generated cover/section images.  Call this AFTER the model has decided what to change — pass the FULL improved deck outline.  Use create_pitch_deck's slide schema.",
    params: `{ "improved": { "title": string, "subtitle"?: string, "author"?: string, "theme"?: object, "slides": [...] }, "formats"?: ["pptx", "pdf"], "rationale"?: string }`,
    async run(inp) {
      const improved = inp?.improved as DeckSpec | undefined;
      if (!improved || !Array.isArray(improved.slides) || !improved.slides.length) {
        return { observation: "Provide 'improved' deck with at least one slide." };
      }
      const formats: ("pptx" | "pdf")[] = Array.isArray(inp?.formats) && inp.formats.length
        ? (inp.formats as any[]).filter((f) => f === "pptx" || f === "pdf")
        : ["pptx", "pdf"];
      const slidesWithImages: SlideSpec[] = [];
      for (const slide of improved.slides) {
        const out: SlideSpec = { ...slide };
        const prompt = (slide as any).imagePrompt as string | undefined;
        const model = (slide as any).imageModel as string | undefined;
        if (prompt && prompt.trim().length > 4) {
          const r = await callQwenImageGen({
            prompt: prompt.trim(),
            model: model && ["z-image-turbo", "qwen-image-2.0", "wan2.6-t2i"].includes(model) ? model : "z-image-turbo",
            size: "1024x1024",
          });
          if (r.ok) { out.image = r.bytes; out.imagePrompt = prompt.trim(); }
        }
        slidesWithImages.push(out);
      }
      const finalDeck: DeckSpec = { ...improved, slides: slidesWithImages };
      const baseName = (improved.title || "Improved_Deck").slice(0, 60);
      const links: string[] = [];
      let lastArtifact: any = null;
      if (formats.includes("pptx")) {
        const buf = await buildDeckPptx(finalDeck);
        const art = await saveArtifact(buf, baseName, "pptx");
        links.push(art.url); lastArtifact = art;
      }
      if (formats.includes("pdf")) {
        const buf = await buildDeckPdf(finalDeck);
        const art = await saveArtifact(buf, baseName, "pdf");
        links.push(art.url); lastArtifact = art;
      }
      const note = inp?.rationale ? ` Rationale: ${String(inp.rationale).slice(0, 240)}` : "";
      return {
        observation: `Improved deck '${improved.title}' built — ${improved.slides.length} slides.${note} Files: ${links.join("  ·  ")}`,
        artifact: lastArtifact,
      };
    },
  },

  translate_text: {
    name: "translate_text",
    description: "Translate a block of text between any pair of 92 supported languages. Uses Qwen-MT-Flash.",
    params: `{ "text": string, "to": string, "from"?: string }`,
    async run(inp) {
      const text = String(inp.text ?? "").trim();
      const to = String(inp.to ?? "").trim();
      if (!text || !to) return { observation: "Provide both 'text' and target language 'to'." };
      const r = await callQwenTranslate({ text, to, from: inp.from ? String(inp.from) : undefined });
      if (!r.ok) return { observation: `Translation failed: ${r.error}` };
      return { observation: r.translated };
    },
  },
};

export function toolCatalog(): string {
  return Object.values(TOOLS)
    .map((t) => `- ${t.name}: ${t.description}\n  input: ${t.params}`)
    .join("\n");
}


// ─── Qwen helpers used by the new multimodal tools ────────────────────────
function qwenBaseUrl(): string {
  const ws = (process.env.QWEN_WORKSPACE_ID || "intl").trim();
  const explicit = process.env.QWEN_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return `https://${ws}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`;
}
function qwenAsyncBaseUrl(): string {
  // Non-OpenAI-compat endpoints (image / video generation, async ASR) live
  // under /api/v1 on the same workspace host.
  const ws = (process.env.QWEN_WORKSPACE_ID || "intl").trim();
  return `https://${ws}.ap-southeast-1.maas.aliyuncs.com`;
}
function qwenKey(): string | null {
  return (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "").trim() || null;
}

async function callQwenVision(args: { prompt: string; imageUrl?: string; imageBase64?: string; model: string }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = qwenKey();
  if (!key) return { ok: false, error: "Qwen key not configured (DASHSCOPE_API_KEY or admin Settings → API Keys)" };
  const content: any[] = [];
  if (args.imageBase64) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${args.imageBase64}` } });
  else if (args.imageUrl) content.push({ type: "image_url", image_url: { url: args.imageUrl } });
  else return { ok: false, error: "Provide either imageUrl or imageBase64" };
  content.push({ type: "text", text: args.prompt });
  const url = qwenBaseUrl() + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: args.model, max_tokens: 2000, messages: [{ role: "user", content }] }),
  });
  const body = await res.text();
  if (!res.ok) return { ok: false, error: `qwen-vl ${res.status}: ${body.slice(0, 240)}` };
  const j: any = JSON.parse(body);
  return { ok: true, text: j?.choices?.[0]?.message?.content ?? "" };
}

async function callQwenImageGen(args: { prompt: string; model: string; size: string }): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  const key = qwenKey();
  if (!key) return { ok: false, error: "Qwen key not configured" };
  // DashScope image generation is async via X-DashScope-Async: enable.
  const submit = await fetch(qwenAsyncBaseUrl() + "/api/v1/services/aigc/text2image/image-synthesis", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({ model: args.model, input: { prompt: args.prompt }, parameters: { size: args.size, n: 1 } }),
  });
  if (!submit.ok) return { ok: false, error: `submit ${submit.status}: ${(await submit.text()).slice(0, 240)}` };
  const submitJson: any = await submit.json();
  const taskId = submitJson?.output?.task_id;
  if (!taskId) return { ok: false, error: "no task_id in submit response" };
  // Poll up to 90 s (image gen is typically 5–20 s).
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(qwenAsyncBaseUrl() + `/api/v1/tasks/${taskId}`, { headers: { "Authorization": `Bearer ${key}` } });
    const pj: any = await poll.json();
    const status = pj?.output?.task_status;
    if (status === "SUCCEEDED") {
      const imgUrl = pj?.output?.results?.[0]?.url;
      if (!imgUrl) return { ok: false, error: "no image URL in succeeded task" };
      const img = await fetch(imgUrl);
      if (!img.ok) return { ok: false, error: `image fetch ${img.status}` };
      const buf = Buffer.from(await img.arrayBuffer());
      return { ok: true, bytes: buf };
    }
    if (status === "FAILED" || status === "CANCELLED") return { ok: false, error: `task ${status}: ${pj?.output?.message ?? ""}` };
  }
  return { ok: false, error: "image generation timed out after 90 s" };
}

async function callQwenTranslate(args: { text: string; to: string; from?: string }): Promise<{ ok: true; translated: string } | { ok: false; error: string }> {
  const key = qwenKey();
  if (!key) return { ok: false, error: "Qwen key not configured" };
  const url = qwenBaseUrl() + "/chat/completions";
  const sys = args.from
    ? `You translate ${args.from} text to ${args.to}. Output only the translation — no preamble, no quotes, no commentary.`
    : `Detect the input language and translate it to ${args.to}. Output only the translation — no preamble, no quotes, no commentary.`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen-mt-flash",
      max_tokens: 2000,
      temperature: 0.1,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: args.text },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) return { ok: false, error: `qwen-mt ${res.status}: ${body.slice(0, 240)}` };
  const j: any = JSON.parse(body);
  return { ok: true, translated: j?.choices?.[0]?.message?.content ?? "" };
}
