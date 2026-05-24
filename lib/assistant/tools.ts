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
import { crawl } from "@/lib/admin/web-crawler";
import { runLpMatching, type FundProfile } from "@/lib/matching/lp-matchmaking";
import { generateLpPipelineXlsx } from "@/lib/matching/xlsx-generator";
import { markdownToDocxBuffer } from "@/lib/ai/docx-export";
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

export interface ToolArtifact { name: string; url: string; kind: "xlsx" | "docx" | "csv" }
export interface ToolResult { observation: string; artifact?: ToolArtifact }
export interface ToolDef {
  name: string;
  description: string;
  /** Human-readable parameter hints shown to the model. */
  params: string;
  run: (input: any) => Promise<ToolResult>;
}

// ── artifact output dir (served from /generated by next start) ───────────────
const OUT_DIR = path.join(process.cwd(), "public", "generated");
async function saveArtifact(buf: Buffer, base: string, kind: ToolArtifact["kind"]): Promise<ToolArtifact> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const safe = base.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "output";
  const file = `${safe}_${randomUUID().slice(0, 8)}.${kind}`;
  await fs.writeFile(path.join(OUT_DIR, file), buf);
  return { name: file, url: `/generated/${file}`, kind };
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
    description: "Fetch and extract the clean main text of a single web page (use a URL from web_search).",
    params: `{ "url": string }`,
    async run({ url }) {
      const u = String(url ?? "");
      if (!/^https?:\/\//.test(u)) return { observation: "Provide a full http(s) URL." };
      try {
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
};

export function toolCatalog(): string {
  return Object.values(TOOLS)
    .map((t) => `- ${t.name}: ${t.description}\n  input: ${t.params}`)
    .join("\n");
}
