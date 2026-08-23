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
import { reconcileSheet, detectHeader } from "@/lib/dataroom/reconcile";
import { normalizeLedger, buildStatements, type Addback } from "@/lib/dataroom/statements";
import { sendEmail, isResendConfigured } from "@/lib/email/resend";
import { checkDeliverability, waveCapRemaining } from "@/lib/outreach/send-gate";
import { isDocWorkerConfigured, renderViaDocWorker } from "@/lib/docworker/client";
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
/** ISO date (YYYY-MM-DD) from a timestamp value, or "" if unparseable. */
function isoDate(v: unknown): string { const d = new Date(v as any); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); }
/** Whole days between a past timestamp and now (>=0). */
function daysAgo(v: unknown): number { const d = new Date(v as any); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400_000)); }
/** First usable email from a firm's `emails` (string | string[] | null). */
function firstEmail(e: any): string {
  if (Array.isArray(e)) { const s = e.find((x) => typeof x === "string" && x.includes("@")); return s ?? ""; }
  return typeof e === "string" ? e : "";
}

// ── shared: decode a base64 xlsx/csv upload to an array-of-arrays ──────────────
// Every data-room tool takes the same `xlsxBase64` input; this centralizes the
// decode + sheet-pick + AoA extraction so the tools stay thin.
function parseWorkbookAoa(xlsxBase64: unknown, sheet?: unknown):
  | { ok: true; sheetName: string; aoa: (string | number)[][] }
  | { ok: false; error: string } {
  const b64 = String(xlsxBase64 ?? "").replace(/^data:[^,]+,/, "");
  if (!b64) return { ok: false, error: "Provide 'xlsxBase64' (base64 of a trial-balance / GL .xlsx or .csv)." };
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" }); }
  catch (e: any) { return { ok: false, error: `Could not read the workbook: ${e?.message ?? "parse error"}` }; }
  const sheetName = sheet && wb.SheetNames.includes(String(sheet)) ? String(sheet) : wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: "The workbook has no sheets." };
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" }) as (string | number)[][];
  return { ok: true, sheetName, aoa };
}

export interface ToolArtifact { name: string; url: string; kind: "xlsx" | "docx" | "csv" | "png" | "pptx" | "pdf" }
export interface ToolResult { observation: string; artifact?: ToolArtifact }
/** Per-request context threaded from the API route through the agent loop. */
export interface ToolCtx { userId?: string }
export interface ToolDef {
  name: string;
  description: string;
  /** Human-readable parameter hints shown to the model. */
  params: string;
  run: (input: any, ctx?: ToolCtx) => Promise<ToolResult>;
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
      const title = String(inp.title ?? "spreadsheet");
      // House-style title block. (SheetJS community can't embed images/cell colors, so
      // the Anker brand ships as merged title rows above the data.)
      const brandRows = [[`ANKER · ${title}`], [`an-ker.de · ${new Date().toISOString().slice(0, 10)}`], []];
      const ws = XLSX.utils.aoa_to_sheet([...brandRows, columns, ...rows]);
      ws["!cols"] = columns.map(() => ({ wch: 22 }));
      const lastCol = Math.max(0, columns.length - 1);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, String(inp.title ?? "spreadsheet"), "xlsx");
      return { observation: `Spreadsheet created with ${rows.length} rows × ${columns.length} cols → ${artifact.url}`, artifact };
    },
  },

  dataroom_reconcile: {
    name: "dataroom_reconcile",
    description:
      "Data-room reconciliation — a deterministic 'sealed engine' (Phiner-style). Ingest a financial export (a trial balance or general ledger as base64 .xlsx/.csv) and RECOMPUTE and prove every figure: the trial balance must tie (Σdebit = Σcredit), every total/subtotal must equal the sum of its components. Anything that doesn't tie is flagged as an exception with a trace to its source row. The model never writes a final number — the engine computes; a person approves only the exceptions. Returns a reconciled workbook (Reconciled + Exceptions + Summary sheets).",
    params: `{ "xlsxBase64": string (base64 of a trial-balance / GL .xlsx or .csv), "sheet"?: string }`,
    async run(inp) {
      const parsed = parseWorkbookAoa(inp.xlsxBase64, inp.sheet);
      if (!parsed.ok) return { observation: parsed.error };
      const { sheetName, aoa } = parsed;
      const res = reconcileSheet(aoa);

      const out = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(res.normalized.length ? res.normalized : [["(no data rows detected)"]]), "Reconciled");
      const exAoa: (string | number)[][] = [["Source row", "Kind", "Detail", "Expected", "Got"],
        ...res.exceptions.map((e) => [e.row, e.kind, e.detail, e.expected ?? "", e.got ?? ""])];
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(exAoa), "Exceptions");
      const summary: (string | number)[][] = [
        ["ANKER · Data-room reconciliation"],
        ["an-ker.de", new Date().toISOString().slice(0, 10)],
        [],
        ["Sheet", sheetName],
        ["Detected as", res.kind],
        ["Data rows", res.dataRows],
        ["Sum of debits", res.totals.debit],
        ["Sum of credits", res.totals.credit],
        ["Difference (Dr - Cr)", res.totals.difference],
        ["Trial balance ties?", res.balanced ? "YES" : "NO"],
        ["Exceptions", res.exceptions.length],
        [],
        ["Note", "Every figure recomputed by the engine. Exceptions require human review; no figure here was written by a model."],
      ];
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(summary), "Summary");
      const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "reconciled-dataroom", "xlsx");

      const verdict = res.kind === "trial_balance"
        ? (res.balanced ? "trial balance TIES" : `trial balance is OUT by ${res.totals.difference}`)
        : `ledger net ${res.totals.net}`;
      return {
        observation: `Reconciled ${res.dataRows} rows from "${sheetName}" (${res.kind}). ${verdict}. ${res.exceptions.length} exception(s) flagged for review. Reconciled workbook → ${artifact.url}`,
        artifact,
      };
    },
  },

  dataroom_ingest: {
    name: "dataroom_ingest",
    description:
      "Data-room INVENTORY & triage (stage 1). Read a financial export (base64 .xlsx/.csv) and catalog it deterministically: every sheet's row/column counts, the detected header row + which columns are account / debit / credit / amount / balance, and whether it reads as a trial balance or a ledger. No figures are computed — this is the 'what did we receive' inventory before reconcile/normalize.",
    params: `{ "xlsxBase64": string, "sheet"?: string }`,
    async run(inp) {
      const b64 = String(inp.xlsxBase64 ?? "").replace(/^data:[^,]+,/, "");
      if (!b64) return { observation: "Provide 'xlsxBase64' (base64 of a .xlsx or .csv)." };
      let wb: XLSX.WorkBook;
      try { wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" }); }
      catch (e: any) { return { observation: `Could not read the workbook: ${e?.message ?? "parse error"}` }; }
      const rows: (string | number)[][] = [["Sheet", "Rows", "Cols", "Header row", "Account col", "Debit", "Credit", "Amount", "Balance", "Reads as"]];
      const lines: string[] = [];
      for (const name of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }) as (string | number)[][];
        const nCols = aoa.reduce((m, r) => Math.max(m, r.length), 0);
        const det = detectHeader(aoa);
        const col = (i?: number) => (i == null || i < 0 ? "—" : String(i + 1));
        const kind = det ? (det.cols.debit != null || det.cols.credit != null ? "trial balance" : "ledger") : "unrecognized";
        rows.push([name, aoa.length, nCols, det ? det.headerRow + 1 : "—", col(det?.cols.account), col(det?.cols.debit), col(det?.cols.credit), col(det?.cols.amount), col(det?.cols.balance), kind]);
        lines.push(`• ${name}: ${aoa.length} rows × ${nCols} cols — ${kind}${det ? ` (header row ${det.headerRow + 1})` : " (no recognizable header)"}`);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 22 }, { wch: 7 }, { wch: 6 }, { wch: 10 }, { wch: 11 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 16 }];
      const out = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(out, ws, "Inventory");
      const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "dataroom-inventory", "xlsx");
      return { observation: `Inventoried ${wb.SheetNames.length} sheet(s):\n${lines.join("\n")}\n\nInventory → ${artifact.url}`, artifact };
    },
  },

  dataroom_normalize: {
    name: "dataroom_normalize",
    description:
      "Data-room CHART-OF-ACCOUNTS normalization (stage 2). Classify every ledger line into a standard category (revenue, cogs, opex, depreciation, amortization, interest, tax, asset, liability, equity) by a deterministic keyword ruleset. Accounts the ruleset can't settle are left UNMAPPED and returned as open questions — the engine never guesses a mapping (a person maps them once). Returns a normalized workbook (per-line categories + category subtotals + an Unmapped sheet).",
    params: `{ "xlsxBase64": string, "sheet"?: string }`,
    async run(inp) {
      const parsed = parseWorkbookAoa(inp.xlsxBase64, inp.sheet);
      if (!parsed.ok) return { observation: parsed.error };
      const norm = normalizeLedger(parsed.aoa);
      if (!norm.dataRows) return { observation: `No classifiable ledger lines found in "${parsed.sheetName}" (need an account column + a debit/credit/amount column).` };

      const out = XLSX.utils.book_new();
      const lineAoa: (string | number)[][] = [["Source row", "Account", "Category", "Signed (Dr−Cr)"],
        ...norm.lines.map((l) => [l.row, l.account, l.category, l.signed])];
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(lineAoa), "Normalized");
      const catAoa: (string | number)[][] = [["Category", "Σ signed (Dr−Cr)"],
        ...Object.entries(norm.byCategory).filter(([, v]) => v !== 0).map(([k, v]) => [k, v])];
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(catAoa), "By category");
      const unAoa: (string | number)[][] = [["Account", "Rows", "Σ signed", "Suggested category (for a person to confirm)"],
        ...norm.unmapped.map((u) => [u.account, u.rows.join(", "), u.signed, ""])];
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(unAoa), "Unmapped");
      const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "normalized-ledger", "xlsx");

      const unmappedNote = norm.unmapped.length
        ? `${norm.unmapped.length} account(s) UNMAPPED (open questions): ${norm.unmapped.slice(0, 6).map((u) => u.account).join(", ")}${norm.unmapped.length > 6 ? " …" : ""}`
        : "Every account was classified by the ruleset.";
      return { observation: `Normalized ${norm.dataRows} lines from "${parsed.sheetName}". ${unmappedNote} Normalized workbook → ${artifact.url}`, artifact };
    },
  },

  dataroom_statements: {
    name: "dataroom_statements",
    description:
      "Data-room STATEMENTS + EBITDA bridge (stage 3). From a normalized ledger, recompute a P&L (revenue → gross profit → EBITDA → net income) and the EBITDA bridge (net income + interest + tax + D&A → EBITDA; + addbacks → Adjusted EBITDA). Every figure is engine-computed; you may pass `addbacks` (label + amount + rationale) — a person's decision — and the engine sums them, it does not invent them. If any accounts were unmapped, net income is flagged as partial. Returns a statements workbook.",
    params: `{ "xlsxBase64": string, "sheet"?: string, "addbacks"?: { "label": string, "amount": number, "rationale"?: string }[] }`,
    async run(inp) {
      const parsed = parseWorkbookAoa(inp.xlsxBase64, inp.sheet);
      if (!parsed.ok) return { observation: parsed.error };
      const norm = normalizeLedger(parsed.aoa);
      if (!norm.dataRows) return { observation: `No classifiable ledger lines found in "${parsed.sheetName}".` };
      const addbacks: Addback[] = Array.isArray(inp.addbacks)
        ? inp.addbacks.map((a: any) => ({ label: String(a?.label ?? "Addback"), amount: Number(a?.amount) || 0, rationale: a?.rationale ? String(a.rationale) : undefined }))
        : [];
      const st = buildStatements(norm, addbacks);

      const pnl: (string | number)[][] = [
        ["ANKER · Normalized P&L"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
        ["Line", "Amount"],
        ["Revenue", st.revenue],
        ["Cost of goods sold", st.cogs],
        ["Gross profit", st.grossProfit],
        ["Operating expenses", st.opex],
        ["Other operating income/(expense)", st.otherPnl],
        ["EBITDA", st.ebitda],
        ["Depreciation", st.depreciation],
        ["Amortization", st.amortization],
        ["Interest", st.interest],
        ["Tax", st.tax],
        ["Net income", st.netIncome],
      ];
      const bridge: (string | number)[][] = [
        ["EBITDA bridge", "Amount"],
        ["Net income", st.netIncome],
        ["+ Interest", st.interest],
        ["+ Tax", st.tax],
        ["+ Depreciation", st.depreciation],
        ["+ Amortization", st.amortization],
        ["= EBITDA", st.ebitdaFromBridge],
        ...st.addbacks.map((a) => [`+ Addback: ${a.label}${a.rationale ? ` (${a.rationale})` : ""}`, a.amount] as (string | number)[]),
        ["= Adjusted EBITDA", st.adjustedEbitda],
      ];
      const out = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(pnl), "P&L");
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(bridge), "EBITDA bridge");
      if (st.hasUnmapped) XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([["Unmapped account", "Rows", "Σ signed"], ...norm.unmapped.map((u) => [u.account, u.rows.join(", "), u.signed])]), "Unmapped (excluded)");
      const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "normalized-statements", "xlsx");

      const caveat = st.hasUnmapped ? ` NOTE: ${st.unmappedCount} unmapped account(s) were excluded — net income is partial until they're mapped (run dataroom_normalize).` : "";
      return {
        observation: `Statements recomputed from "${parsed.sheetName}": revenue ${st.revenue}, EBITDA ${st.ebitdaFromBridge}, net income ${st.netIncome}, adjusted EBITDA ${st.adjustedEbitda} (${st.addbacks.length} addback(s)).${caveat} Workbook → ${artifact.url}`,
        artifact,
      };
    },
  },

  dataroom_questions: {
    name: "dataroom_questions",
    description:
      "Data-room OPEN QUESTIONS (stage 4). Derive the short list of things a person must decide before the package is buyer-ready: unmapped accounts (need a category) and reconciliation exceptions (don't tie). Ranked by magnitude, phrased in plain English, each with a source-row trace. Answer once → it becomes a permanent rule for the next data room. Read-only: returns questions, writes nothing.",
    params: `{ "xlsxBase64": string, "sheet"?: string }`,
    async run(inp) {
      const parsed = parseWorkbookAoa(inp.xlsxBase64, inp.sheet);
      if (!parsed.ok) return { observation: parsed.error };
      const norm = normalizeLedger(parsed.aoa);
      const rec = reconcileSheet(parsed.aoa);
      type Q = { rank: number; question: string; trace: string };
      const qs: Q[] = [];
      for (const u of norm.unmapped) {
        qs.push({ rank: Math.abs(u.signed), question: `How should "${u.account}" be classified (revenue / cogs / opex / D&A / interest / tax / balance-sheet)?`, trace: `rows ${u.rows.join(", ")} · Σ ${u.signed}` });
      }
      for (const e of rec.exceptions) {
        qs.push({ rank: Math.abs((e.expected ?? 0) - (e.got ?? 0)) || 1e9, question: `${e.detail}${e.expected != null ? ` Expected ${e.expected}, got ${e.got}.` : ""} How should this be resolved?`, trace: `source row ${e.row} · ${e.kind}` });
      }
      qs.sort((a, b) => b.rank - a.rank);
      if (!qs.length) return { observation: `No open questions — "${parsed.sheetName}" fully classified and ${rec.balanced ? "ties" : "reconciled"}. Ready to package.` };

      const aoa: (string | number)[][] = [["#", "Question (answer once → permanent rule)", "Trace"], ...qs.map((q, i) => [i + 1, q.question, q.trace])];
      const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 4 }, { wch: 70 }, { wch: 28 }];
      const out = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(out, ws, "Open questions");
      const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "dataroom-open-questions", "xlsx");
      const top = qs.slice(0, 8).map((q, i) => `${i + 1}. ${q.question}  [${q.trace}]`);
      return { observation: `${qs.length} open question(s) for a person to settle:\n${top.join("\n")}${qs.length > 8 ? `\n… +${qs.length - 8} more` : ""}\n\nWorkbook → ${artifact.url}`, artifact };
    },
  },

  dataroom_package: {
    name: "dataroom_package",
    description:
      "Data-room OUTPUT PACKAGE (stage 5, flagship). Run the whole refinery on one financial export and emit a single buyer-ready workbook: Reconciled ledger, Exceptions log (with source traces), Normalized ledger + category subtotals, Normalized P&L, EBITDA bridge, Open questions, and a Summary. Every figure is engine-computed and provable; the model never writes a number. Accepts optional `addbacks` for the Adjusted-EBITDA line.",
    params: `{ "xlsxBase64": string, "sheet"?: string, "addbacks"?: { "label": string, "amount": number, "rationale"?: string }[] }`,
    async run(inp) {
      const parsed = parseWorkbookAoa(inp.xlsxBase64, inp.sheet);
      if (!parsed.ok) return { observation: parsed.error };
      const { sheetName, aoa } = parsed;
      const rec = reconcileSheet(aoa);
      const norm = normalizeLedger(aoa);
      const addbacks: Addback[] = Array.isArray(inp.addbacks)
        ? inp.addbacks.map((a: any) => ({ label: String(a?.label ?? "Addback"), amount: Number(a?.amount) || 0, rationale: a?.rationale ? String(a.rationale) : undefined }))
        : [];
      const st = buildStatements(norm, addbacks);
      const out = XLSX.utils.book_new();

      // 1. Reconciled + Exceptions
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rec.normalized.length ? rec.normalized : [["(no data rows detected)"]]), "Reconciled");
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([["Source row", "Kind", "Detail", "Expected", "Got"], ...rec.exceptions.map((e) => [e.row, e.kind, e.detail, e.expected ?? "", e.got ?? ""])]), "Exceptions");
      // 2. Normalized ledger + categories
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([["Source row", "Account", "Category", "Signed (Dr−Cr)"], ...norm.lines.map((l) => [l.row, l.account, l.category, l.signed])]), "Normalized");
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([["Category", "Σ signed"], ...Object.entries(norm.byCategory).filter(([, v]) => v !== 0).map(([k, v]) => [k, v])]), "By category");
      // 3. P&L + EBITDA bridge
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([
        ["Line", "Amount"], ["Revenue", st.revenue], ["Cost of goods sold", st.cogs], ["Gross profit", st.grossProfit],
        ["Operating expenses", st.opex], ["EBITDA", st.ebitdaFromBridge], ["Depreciation", st.depreciation], ["Amortization", st.amortization],
        ["Interest", st.interest], ["Tax", st.tax], ["Net income", st.netIncome], ["Adjusted EBITDA", st.adjustedEbitda],
      ]), "P&L");
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([
        ["EBITDA bridge", "Amount"], ["Net income", st.netIncome], ["+ Interest", st.interest], ["+ Tax", st.tax],
        ["+ Depreciation", st.depreciation], ["+ Amortization", st.amortization], ["= EBITDA", st.ebitdaFromBridge],
        ...st.addbacks.map((a) => [`+ Addback: ${a.label}`, a.amount] as (string | number)[]), ["= Adjusted EBITDA", st.adjustedEbitda],
      ]), "EBITDA bridge");
      // 4. Open questions
      const openCount = norm.unmapped.length + rec.exceptions.length;
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([["Type", "Item", "Trace"],
        ...norm.unmapped.map((u) => ["unmapped-account", `Classify "${u.account}"`, `rows ${u.rows.join(", ")}`]),
        ...rec.exceptions.map((e) => ["reconcile-exception", e.detail, `row ${e.row}`])]), "Open questions");
      // 5. Summary
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([
        ["ANKER · Data-room package"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
        ["Source sheet", sheetName], ["Detected as", rec.kind], ["Data rows", rec.dataRows],
        ["Trial balance ties?", rec.kind === "trial_balance" ? (rec.balanced ? "YES" : `NO (out by ${rec.totals.difference})`) : "n/a (ledger)"],
        ["Revenue", st.revenue], ["EBITDA", st.ebitdaFromBridge], ["Adjusted EBITDA", st.adjustedEbitda], ["Net income", st.netIncome],
        ["Unmapped accounts", norm.unmapped.length], ["Reconcile exceptions", rec.exceptions.length], ["Open questions", openCount],
        [], ["Note", "Every figure recomputed by the sealed engine; exceptions + unmapped items require human review. No figure here was written by a model."],
      ]), "Summary");

      const buf = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "dataroom-package", "xlsx");
      const ties = rec.kind === "trial_balance" ? (rec.balanced ? "TB ties" : `TB out by ${rec.totals.difference}`) : "ledger";
      return {
        observation: `Data-room package built from "${sheetName}": ${ties}; revenue ${st.revenue}, adjusted EBITDA ${st.adjustedEbitda}; ${openCount} open item(s) for review (${norm.unmapped.length} unmapped, ${rec.exceptions.length} exceptions). Buyer-ready workbook (7 sheets) → ${artifact.url}`,
        artifact,
      };
    },
  },

  export_investors: {
    name: "export_investors",
    description:
      "Run an investor/firm database query and EXPORT the result as a downloadable .xlsx or .csv with chosen columns. Read-only. Use when the user wants a list they can open in Excel/Sheets (not just an on-screen answer). Columns default to name/type/location/website/email/sectors.",
    params: `{ "type"?: "family-office"|"vc"|"accelerator"|"corporate"|"angel"|"private-equity", "keyword"?: string, "ids"?: string[], "limit"?: number(<=50), "columns"?: ("name"|"type"|"location"|"website"|"email"|"sectors"|"description")[], "format"?: "xlsx"|"csv" }`,
    async run(inp) {
      const limit = Math.min(Number(inp.limit) || 25, 50);
      const firms = await fetchFirms({ type: inp.type, keyword: inp.keyword, ids: inp.ids, limit });
      if (!firms.length) return { observation: "No firms matched those filters in investment_firms." };
      const ALL = ["name", "type", "location", "website", "email", "sectors", "description"] as const;
      type Col = typeof ALL[number];
      const cols: Col[] = Array.isArray(inp.columns) && inp.columns.length
        ? (inp.columns.map((c: any) => String(c).toLowerCase()).filter((c: string) => (ALL as readonly string[]).includes(c)) as Col[])
        : ["name", "type", "location", "website", "email", "sectors"];
      const cell = (f: FirmRow, c: Col): string => {
        switch (c) {
          case "name": return f.name ?? "";
          case "type": return f.type ?? "";
          case "location": return f.hq_location ?? f.location ?? "";
          case "website": return f.website ?? "";
          case "email": return firstEmail(f.emails);
          case "sectors": return sectorsText(f.sectors);
          case "description": return clip(f.description ?? "", 300);
        }
      };
      const header = cols.map((c) => c[0].toUpperCase() + c.slice(1));
      const rows = firms.map((f) => cols.map((c) => cell(f, c)));
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = cols.map((c) => ({ wch: c === "description" ? 50 : c === "website" ? 30 : 22 }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Investors");
      const format = String(inp.format ?? "xlsx").toLowerCase() === "csv" ? "csv" : "xlsx";
      const buf = XLSX.write(wb, { type: "buffer", bookType: format }) as Buffer;
      const withEmail = firms.filter((f) => firstEmail(f.emails)).length;
      const artifact = await saveArtifact(buf, "Investor_Export", format as "xlsx" | "csv");
      return { observation: `Exported ${firms.length} firm(s) × ${cols.length} column(s) (${withEmail} with email) as ${format.toUpperCase()} → ${artifact.url}`, artifact };
    },
  },

  send_outreach: {
    name: "send_outreach",
    description:
      "Send ONE approved outreach email via the Anker sending domain (Resend). SAFETY: this never sends on its own — it defaults to a DRY RUN that shows exactly what would go out. Only when the user has explicitly approved does it actually send, and only if the call passes `confirm: true`. Every send runs the deliverability guard (valid, real mailbox) and the daily wave cap. Use draft_outreach_batch to write copy first; use this to send a single approved message.",
    params: `{ "to": string, "subject": string, "body": string, "confirm"?: boolean (must be true to actually send; omit/false = dry run preview), "fromName"?: string, "cc"?: string[] }`,
    async run(inp, ctx) {
      const to = String(inp.to ?? "").trim();
      const subject = String(inp.subject ?? "").trim();
      const body = String(inp.body ?? "").trim();
      if (!to || !subject || !body) return { observation: "Provide 'to', 'subject', and 'body'." };

      const deliver = checkDeliverability(to);
      if (!deliver.ok) return { observation: `Blocked: ${deliver.reason} (nothing sent).` };
      const wave = await waveCapRemaining(ctx?.userId);
      const cc = Array.isArray(inp.cc) ? inp.cc.map(String).filter(Boolean) : [];
      const preview =
        `To: ${deliver.normalized}\nSubject: ${subject}\n${cc.length ? `Cc: ${cc.join(", ")}\n` : ""}` +
        `Body:\n${clip(body, 600)}`;

      // Dry run (default): never send from a model turn without explicit confirmation.
      if (inp.confirm !== true) {
        return {
          observation:
            `DRY RUN — nothing sent. This is what WOULD be sent (confirm with the user, then call again with confirm:true):\n\n${preview}\n\n` +
            `Deliverability: OK. Wave cap: ${wave.remaining}/${wave.cap} sends left today. Provider configured: ${isResendConfigured() ? "yes" : "NO (RESEND_API_KEY missing)"}.`,
        };
      }
      // Confirmed path.
      if (!isResendConfigured()) return { observation: "Cannot send: RESEND_API_KEY is not configured on the server. (Add it, then retry.)" };
      if (wave.remaining <= 0) return { observation: `Daily wave cap reached (${wave.sentToday}/${wave.cap} already sent). Not sending — try again tomorrow or raise OUTREACH_DAILY_CAP.` };
      try {
        const res = await sendEmail({ to: deliver.normalized!, subject, text: body, cc, from: inp.fromName ? `${String(inp.fromName)} <${process.env.OUTREACH_FROM_EMAIL || "vc@an-ker.de"}>` : undefined });
        return { observation: `Sent to ${deliver.normalized} (Resend id ${res.resendId}). ${wave.remaining - 1}/${wave.cap} sends left today.` };
      } catch (e: any) {
        return { observation: `Send failed: ${e?.message ?? "error"}. Nothing was recorded.` };
      }
    },
  },

  outreach_sequence: {
    name: "outreach_sequence",
    description:
      "Plan a multi-touch outreach cadence (connect → value → nudge → ask) for ONE recipient, with suggested send dates spaced by delays. Draft-only, no send — hand each touch to send_outreach after approval. Use when you want a scheduled sequence rather than a one-off; for batches of firms use draft_outreach_batch.",
    params: `{ "recipientName": string, "founder": { "companyName": string, "oneLiner": string, "calendarUrl"?: string }, "channel"?: "email"|"linkedin", "startDate"?: "YYYY-MM-DD", "offsetsDays"?: number[](=[0,3,7,14]) }`,
    async run(inp) {
      const f = inp.founder ?? {};
      const recipient = String(inp.recipientName ?? "there").trim() || "there";
      if (!f.companyName || !f.oneLiner) return { observation: "Provide founder.companyName + founder.oneLiner." };
      const founder: FounderContext = { companyName: String(f.companyName), oneLiner: String(f.oneLiner), facts: [], calendarUrl: f.calendarUrl ? String(f.calendarUrl) : undefined };
      const partner: PartnerContext = { firstName: firstWord(recipient), fullName: recipient, firm: recipient };
      const [res] = await generateOutreachSequencesBatch(founder, [partner], 1);
      const seq = res?.sequence ?? { day0: "", day3: "", day7: "", day14: "" };
      const offsets: number[] = Array.isArray(inp.offsetsDays) && inp.offsetsDays.length ? inp.offsetsDays.map((n: any) => Number(n) || 0) : [0, 3, 7, 14];
      const start = inp.startDate ? new Date(String(inp.startDate)) : new Date();
      const labels = ["Connect", "Value", "Nudge", "Ask"];
      const bodies = [seq.day0, seq.day3, seq.day7, seq.day14];
      const rows = offsets.map((off, i) => {
        const d = new Date(start); d.setDate(d.getDate() + off);
        return [`Touch ${i + 1} — ${labels[i] ?? "Step"}`, `+${off}d`, d.toISOString().slice(0, 10), bodies[i] ?? ""];
      });
      const ws = XLSX.utils.aoa_to_sheet([["Step", "Offset", "Suggested date", `Copy (${inp.channel ?? "email"})`], ...rows]);
      ws["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 15 }, { wch: 60 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Cadence");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, `Cadence_${recipient}`, "xlsx");
      return { observation: `Planned a ${rows.length}-touch cadence for ${recipient} (offsets ${offsets.join("/")}d). Draft-only — approve each, then send_outreach. Workbook → ${artifact.url}`, artifact };
    },
  },

  followup_sweep: {
    name: "followup_sweep",
    description:
      "Find stale outreach — contacts messaged >N days ago (default 7) with no reply and no closed/dropped stage — and produce a follow-up worklist with a drafted nudge for each. Read-only: surfaces who to nudge, drafts the copy; sends nothing. Use to keep a pipeline warm.",
    params: `{ "days"?: number(=7), "limit"?: number(<=40) }`,
    async run(inp, ctx) {
      const days = Math.max(1, Math.min(120, Number(inp.days) || 7));
      const limit = Math.max(1, Math.min(40, Number(inp.limit) || 20));
      const uid = ctx?.userId ?? null;
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      // A crm_entry is "stale, no reply" when its latest message was sent/delivered,
      // older than the cutoff, and none of its messages are replied/accepted.
      let rows: any[];
      try {
        rows = uid
          ? await sql`
              SELECT c.id, c.display_name, c.display_email, c.display_type, c.stage, agg.last_sent, agg.touches
              FROM crm_entries c
              JOIN (
                SELECT crm_entry_id, max(sent_at) AS last_sent,
                       count(*) FILTER (WHERE status IN ('sent','delivered')) AS touches,
                       bool_or(status IN ('replied','accepted')) AS replied
                FROM outreach_messages WHERE sent_at IS NOT NULL AND user_id = ${uid}
                GROUP BY crm_entry_id
              ) agg ON agg.crm_entry_id = c.id
              WHERE agg.replied = false AND agg.touches > 0 AND agg.last_sent < ${cutoff}
                AND c.stage NOT IN ('won','lost','closed','dropped','passed')
              ORDER BY agg.last_sent ASC LIMIT ${limit}` as any[]
          : await sql`
              SELECT c.id, c.display_name, c.display_email, c.display_type, c.stage, agg.last_sent, agg.touches
              FROM crm_entries c
              JOIN (
                SELECT crm_entry_id, max(sent_at) AS last_sent,
                       count(*) FILTER (WHERE status IN ('sent','delivered')) AS touches,
                       bool_or(status IN ('replied','accepted')) AS replied
                FROM outreach_messages WHERE sent_at IS NOT NULL
                GROUP BY crm_entry_id
              ) agg ON agg.crm_entry_id = c.id
              WHERE agg.replied = false AND agg.touches > 0 AND agg.last_sent < ${cutoff}
                AND c.stage NOT IN ('won','lost','closed','dropped','passed')
              ORDER BY agg.last_sent ASC LIMIT ${limit}` as any[];
      } catch (e: any) {
        return { observation: `Could not run the sweep (${e?.message ?? "db error"}). Outreach tables may not be provisioned here.` };
      }
      if (!rows.length) return { observation: `No stale contacts: nobody messaged >${days} days ago is still awaiting a reply. Pipeline is warm.` };

      // Draft one short nudge per contact (batched, rate-limited).
      const prompts = rows.map((r) =>
        `Write a SHORT, friendly 2-3 sentence follow-up nudge (no subject line) to ${r.display_name}${r.display_type ? ` at a ${r.display_type}` : ""}, whom we last emailed ${daysAgo(r.last_sent)} days ago with no reply. Reference that we reached out before; add one light reason to reconnect; end with a soft ask. Plain text only.`);
      let nudges: string[] = [];
      try { nudges = await generateBatch(prompts, { maxTokens: 140, temperature: 0.6, task: "outreach" as any }, 4); }
      catch { nudges = rows.map(() => ""); }

      const aoa: (string | number)[][] = [["Name", "Email", "Type", "Stage", "Last sent", "Touches", "Suggested nudge"],
        ...rows.map((r, i) => [r.display_name ?? "", r.display_email ?? "", r.display_type ?? "", r.stage ?? "", isoDate(r.last_sent), Number(r.touches) || 0, clip(nudges[i] ?? "", 500)])];
      const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 26 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 60 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Follow-ups");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const artifact = await saveArtifact(buf, "Followup_Worklist", "xlsx");
      const top = rows.slice(0, 8).map((r, i) => `${i + 1}. ${r.display_name} — last sent ${isoDate(r.last_sent)} (${r.touches} touch${Number(r.touches) === 1 ? "" : "es"})`);
      return { observation: `${rows.length} stale contact(s) awaiting a reply >${days}d:\n${top.join("\n")}${rows.length > 8 ? `\n… +${rows.length - 8} more` : ""}\n\nDrafted a nudge for each (nothing sent). Worklist → ${artifact.url}`, artifact };
    },
  },

  render_document_pro: {
    name: "render_document_pro",
    description:
      "High-fidelity typeset rendering via the doc/compute worker (LaTeX/tectonic or LibreOffice) — for white-paper-class PDFs the serverless docx path can't match. Requires a deployed worker (DOC_WORKER_URL); if none is configured this returns guidance and you should fall back to generate_document (docx) instead. Provide LaTeX source for engine 'latex'.",
    params: `{ "engine"?: "latex"|"libreoffice"(=latex), "source": string (LaTeX source, or base64 of an input doc for libreoffice), "filename"?: string, "format"?: "pdf"|"docx" }`,
    async run(inp) {
      const source = String(inp.source ?? "");
      if (!source.trim()) return { observation: "Provide 'source' (LaTeX document for engine 'latex')." };
      if (!isDocWorkerConfigured()) {
        return { observation: "No doc-worker is configured (DOC_WORKER_URL unset), so high-fidelity LaTeX/LibreOffice rendering isn't available here. Use generate_document for a branded .docx instead — it covers most needs and runs serverless." };
      }
      const engine = String(inp.engine ?? "latex") === "libreoffice" ? "libreoffice" : "latex";
      const format = String(inp.format ?? "pdf") === "docx" ? "docx" : "pdf";
      const r = await renderViaDocWorker({ engine, source, filename: inp.filename ? String(inp.filename) : undefined, format });
      if (!r.ok || !r.bytes) return { observation: `Doc-worker render failed: ${r.error}. Fall back to generate_document (serverless docx).` };
      const kind = format === "docx" ? "docx" : "pdf";
      const artifact = await saveArtifact(r.bytes, "rendered-document", kind as "pdf" | "docx");
      return { observation: `Rendered a ${format.toUpperCase()} via the ${engine} doc-worker (${r.bytes.length} bytes) → ${artifact.url}`, artifact };
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

  // ─── Multimodal AI tools ─────────────────────────
  // NOTE: These four tools (analyze_image, image_ocr, generate_image,
  // translate_text) call Alibaba DashScope's Qwen-VL / Qwen-Image /
  // Qwen-MT endpoints directly because those are the specific models
  // being invoked — the multi-provider router (lib/ai/provider.ts) is
  // for text-LLM tasks and does not front vision/OCR/image-gen/translation.
  // Swap DASHSCOPE_API_KEY out and these tools become unavailable — the
  // rest of the platform's text-generation continues via whichever
  // provider (Claude, Mistral, Gemini, OpenAI, local Ollama) the admin
  // selected in Settings → API Keys.
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
