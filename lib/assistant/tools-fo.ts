/**
 * Anker AI Assistant — Family Office / event-outreach tools.
 *
 * Tools registered here are merged into the main TOOLS catalog in
 * lib/assistant/tools.ts. They take an uploaded .xlsx (delivered through the
 * <<XLSXn>> marker the assistant route exposes) and run the same workflows we
 * iterated on as one-shot scripts under scripts/oneshot/:
 *
 *   enrich_db_from_xlsx                Insert-only-new bulk import into
 *                                      investment_firms + investors with
 *                                      source tag and JSONB metadata.
 *   db_gap_analysis                    Find DB rows of a given firm type that
 *                                      are NOT in an uploaded contact list.
 *   generate_event_outreach_drafts     LLM-personalised email + LinkedIn DM
 *                                      per profile, in two voices.
 *   apply_template_to_outreach_drafts  Deterministic substitution of a fixed
 *                                      email template across all profiles.
 *
 * Each tool returns an `observation` text + an `artifact` (XLSX download link).
 */
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { sql } from "@/lib/db";
import { generateBatch } from "@/lib/ai/provider";
import {
  type ToolArtifact,
  type ToolDef,
  type ToolResult,
  saveArtifact,
} from "./artifact";

// ── shared helpers ──────────────────────────────────────────────────────────

const STOP = /\b(family|office|capital|partners?|holdings?|management|advisors?|group|llc|inc|ltd|llp|limited|corp|company|co|gmbh|sarl|ag|sa|the|of|and|fund|ventures?|investments?|investment|mfo|sfo|fo|wealth)\b/gi;

function normFirm(s: unknown): string {
  if (!s) return "";
  return String(s).toLowerCase()
    .replace(/[\-_\/.,'"`(){}\[\]!?]/g, " ").replace(/&/g, " ")
    .replace(STOP, " ").replace(/\s+/g, " ").trim();
}
function emailDomain(e: unknown): string {
  if (!e) return "";
  const at = String(e).indexOf("@");
  return at >= 0 ? String(e).slice(at + 1).toLowerCase().trim() : "";
}
function siteDomain(u: unknown): string {
  if (!u) return "";
  return String(u).toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();
}
function clean(s: unknown): string { return s == null ? "" : String(s).trim(); }
function low(s: unknown): string { return clean(s).toLowerCase(); }

const GENERIC_FIRMS = new Set([
  "", "private family office", "single family office",
  "private multi family office (mfo)", "private multi-family office",
  "multi family office", "single-family office", "self employed", "self-employed",
  "private mfo", "private sfo", "n/a", "na", "none", "-",
]);
function isGenericFirm(name: unknown): boolean { return GENERIC_FIRMS.has(low(name)); }

function firstNameOf(fullName: unknown): string {
  const cleaned = String(fullName || "")
    .replace(/\s+(MBA|MD|PhD|Ph\.?D\.?|CFA|CPA|JD|Esq\.?|Jr|Sr|II|III|IV)\.?(\s|,|$)/gi, " ")
    .replace(/\s+(Founder|Owner|CEO|CFO|CIO|COO|CTO|President|Principal|Chairman|Director|Managing Director|Investor|Trustee|Partner|Senior Managing Director|Chief Investment Officer|Investment Research Manager|Investment Manager)\b/gi, "")
    .replace(/\s+/g, " ").trim();
  const tok = cleaned.split(" ")[0] || "there";
  if (/^(college|capital|group|family|office|trust|wealth|fund|advisors?|holdings?|university|endowment|partners?|enterprises?|the)$/i.test(tok)) return "there";
  return tok;
}

function isAngelOrHnw(lpType: unknown, tags: unknown): boolean {
  const t = ((lpType || "") + " " + (tags || "")).toString().toLowerCase();
  return t.includes("angel") || t.includes("hnw") || /\boperator\b/.test(t);
}

/** Decode the <<XLSXn>> marker (already resolved to base64 by the agent). */
function decodeXlsx(xlsxBase64: unknown): XLSX.WorkBook | null {
  if (!xlsxBase64 || typeof xlsxBase64 !== "string") return null;
  try {
    const buf = Buffer.from(xlsxBase64, "base64");
    return XLSX.read(buf, { type: "buffer" });
  } catch { return null; }
}
function pickSheet(wb: XLSX.WorkBook, ...candidates: string[]): XLSX.WorkSheet | null {
  const exact = candidates.find((c) => wb.SheetNames.includes(c));
  if (exact) return wb.Sheets[exact];
  // case-insensitive contains match
  const lc = (s: string) => s.toLowerCase();
  for (const c of candidates) {
    const hit = wb.SheetNames.find((n) => lc(n) === lc(c) || lc(n).includes(lc(c)));
    if (hit) return wb.Sheets[hit];
  }
  return null;
}

// Deterministic cleanup applied to every model-produced or template body/DM.
function sanitize(s: string): string {
  return String(s || "")
    .replace(/—/g, ", ").replace(/–/g, ", ").replace(/--/g, ", ")
    .replace(/[ \t]+,/g, ",").replace(/  +/g, " ").replace(/\s+\n/g, "\n");
}

// Validate a single draft against the standard checks. Returns issue strings.
function validateDraft(
  num: string,
  rec: { subject?: string; body?: string; dm?: string },
  requiredUrls: string[],
): string[] {
  const issues: string[] = [];
  const wc = (s?: string) => (s || "").split(/\s+/).filter(Boolean).length;
  if (rec.subject) {
    if (rec.subject.length > 80) issues.push(`#${num} subject ${rec.subject.length} chars`);
    if (/[!?]/.test(rec.subject)) issues.push(`#${num} subject has ! or ?`);
  }
  if (rec.body) {
    if (/[—–]/.test(rec.body)) issues.push(`#${num} body has em/en-dash`);
    for (const u of requiredUrls) if (!rec.body.includes(u)) issues.push(`#${num} body missing ${u}`);
  }
  if (rec.dm) {
    if (rec.dm.length > 300) issues.push(`#${num} dm ${rec.dm.length} chars (>300)`);
    if (/[—–]/.test(rec.dm)) issues.push(`#${num} dm has em/en-dash`);
    for (const u of requiredUrls) if (!rec.dm.includes(u)) issues.push(`#${num} dm missing ${u}`);
  }
  return issues;
}

// Build the 7-sheet curated XLSX matching the existing Outreach Studio import shape.
interface CuratedProfile {
  num: string;
  name: string;
  lpType: string;
  email: string;
  linkedin: string;
  tier?: string;
  score?: string;
  title?: string;
  tags?: string;
  location?: string;
  sectors?: string;
  whyThisContact?: string;
  firmIntelligence?: string;
  investmentMandate?: string;
  personalisationHook?: string;
  batch?: string;
  multiTouchNote?: string;
}
interface DraftRow {
  num: string;
  subject: string;
  body: string;
  dm?: string;
  voice: "operator-first" | "formal-warm";
  primaryChannel: "email" | "linkedin";
}
function buildCuratedXlsx(opts: {
  campaignTitle: string;
  generatedAt: string;
  profiles: CuratedProfile[];
  drafts: Map<string, DraftRow>;
  validationIssues: string[];
  registrationUrls: string[];
  methodologyNote: string;
}): Buffer {
  const { campaignTitle, generatedAt, profiles, drafts, validationIssues, registrationUrls, methodologyNote } = opts;
  const wb = XLSX.utils.book_new();

  const draftRowsByNum = (num: string) => drafts.get(num);
  const operatorVoice = [...drafts.values()].filter((d) => d.voice === "operator-first").length;
  const formalVoice = [...drafts.values()].filter((d) => d.voice === "formal-warm").length;
  const dmsCount = [...drafts.values()].filter((d) => d.dm).length;

  // 1. Overview
  const overview = [
    ["Campaign", campaignTitle],
    ["Generated", generatedAt],
    ["Registration URLs", registrationUrls.join(" | ")],
    ["", ""],
    ["Profiles in scope", profiles.length],
    ["Email drafts produced", drafts.size],
    ["LinkedIn DMs produced", dmsCount],
    ["Voice: operator-first", operatorVoice],
    ["Voice: formal-warm", formalVoice],
    ["", ""],
    ["Validation issues", validationIssues.length],
    ...validationIssues.slice(0, 30).map((v) => ["  " + v, ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), "Overview");

  // 2. Curated Profiles
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profiles.map((p) => {
    const d = draftRowsByNum(p.num);
    return {
      "#": p.num, "Tier": p.tier ?? "", "Score": p.score ?? "",
      "Name": p.name, "Title/Role": p.title ?? "", "LP Type": p.lpType,
      "Tags": p.tags ?? "", "Location": p.location ?? "", "Email": p.email,
      "LinkedIn": p.linkedin, "Sectors": p.sectors ?? "",
      "Why This Contact": p.whyThisContact ?? "",
      "Firm Intelligence": p.firmIntelligence ?? "",
      "Investment Mandate": p.investmentMandate ?? "",
      "Personalisation Hook": p.personalisationHook ?? "",
      "Enriched Subject": d?.subject ?? "",
      "Multi-Touch Note": p.multiTouchNote ?? "",
      "Batch": p.batch ?? "",
      "Outreach Status": d ? "Drafted" : "",
    };
  })), "Curated Profiles (Enriched)");

  // 3. Email Drafts
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profiles
    .filter((p) => drafts.has(p.num))
    .map((p) => {
      const d = drafts.get(p.num)!;
      return {
        "#": p.num, "Name": p.name, "LP Type": p.lpType, "Email": p.email,
        "Subject": d.subject, "Body": d.body, "Primary channel": d.primaryChannel,
        "Voice notes": d.voice === "operator-first"
          ? "operator-first: warm, peer-to-peer"
          : "formal-warm: Dear opener, quiet credibility",
        "Enriched Subject": d.subject, "Batch": p.batch ?? "",
        "Multi-Touch Note": p.multiTouchNote ?? "",
      };
    })), "Email Drafts (Enriched)");

  // 4. LinkedIn DMs
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profiles
    .filter((p) => drafts.get(p.num)?.dm)
    .map((p) => {
      const d = drafts.get(p.num)!;
      return {
        "#": p.num, "Name": p.name, "LP Type": p.lpType,
        "LinkedIn URL": p.linkedin, "DM (first touch)": d.dm!,
        "Chars": d.dm!.length,
        "Voice notes": d.voice === "operator-first"
          ? "operator-first: warm, peer-to-peer"
          : "formal-warm",
      };
    })), "LinkedIn DMs");

  // 5. Campaign Summary
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Metric", "Value", "Notes"],
    ["Campaign", campaignTitle, ""],
    ["Generated", generatedAt, ""],
    ["Profiles in scope", profiles.length, ""],
    ["Email drafts produced", drafts.size, "One per profile with email + at least basic data"],
    ["LinkedIn DMs produced", dmsCount, "Limited by 300-char LinkedIn ceiling"],
    ["Validation issues", validationIssues.length, "Zero is the ship gate"],
  ]), "Campaign Summary");

  // 6. Methodology
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(
    methodologyNote.split("\n").map((line) => [line])
  ), "Methodology");

  // 7. Sender Brief (minimal — caller can pass more if they want)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Sender Brief", ""],
    ["Generated by", "Anker AI Assistant"],
    ["At", generatedAt],
  ]), "Sender Brief");

  wb.SheetNames = ["Overview", "Curated Profiles (Enriched)", "Email Drafts (Enriched)", "LinkedIn DMs", "Campaign Summary", "Methodology", "Sender Brief"];
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── tool: enrich_db_from_xlsx ───────────────────────────────────────────────

const enrich_db_from_xlsx: ToolDef = {
  name: "enrich_db_from_xlsx",
  description: "Bulk-import contacts from an uploaded XLSX into the Anker DB (investment_firms + investors). Insert-only-new: dedupes by lower(email) with (first, last, firm) fallback. Adds idempotent metadata JSONB columns. Rich source rows (scoring, LinkedIn-connection notes) are stored under investors.metadata keyed by source. Returns an audit XLSX of what landed.",
  params: `{ "xlsxBase64": "<<XLSXn>>", "source": string (e.g. "svs_fund2_fo_webinar_invite"), "sheet"?: string (default: auto-detect first sheet with First Name/Last Name/Email columns), "firmNameCol"?: string, "emailCol"?: string, "firstNameCol"?: string, "lastNameCol"?: string }`,
  async run(inp): Promise<ToolResult> {
    const wb = decodeXlsx(inp.xlsxBase64);
    if (!wb) return { observation: "No XLSX attached or marker did not resolve. Caller must pass xlsxBase64: \"<<XLSXn>>\"." };
    const source = clean(inp.source) || "assistant_import_" + new Date().toISOString().slice(0, 10);
    // Pick the right sheet
    let ws: XLSX.WorkSheet | null = inp.sheet ? wb.Sheets[String(inp.sheet)] : null;
    if (!ws) {
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) as any[];
        if (!rows.length) continue;
        const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
        if (keys.some((k) => k.includes("first")) && (keys.some((k) => k.includes("email")) || keys.some((k) => k.includes("firm") || k.includes("company")))) {
          ws = wb.Sheets[name]; break;
        }
      }
    }
    if (!ws) return { observation: `Could not find a sheet with contact columns. Sheets available: ${wb.SheetNames.join(", ")}.` };
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

    // Field guesses
    const col = (r: any, ...names: string[]) => {
      for (const n of names) if (r[n] != null && String(r[n]).trim() !== "") return String(r[n]).trim();
      return "";
    };

    // Build candidate rows
    const candidates = rows.map((r) => {
      const firstName = col(r, inp.firstNameCol, "First Name", "FirstName", "first_name");
      const lastName  = col(r, inp.lastNameCol,  "Last Name",  "LastName",  "last_name");
      const firmName  = col(r, inp.firmNameCol,  "Firm Name", "Firm", "Company", "Account");
      const email     = low(col(r, inp.emailCol, "Email", "email"));
      const linkedin  = col(r, "LinkedIn", "linkedin", "LinkedIn URL");
      const title     = col(r, "Title", "Role", "Title/Role");
      const location  = col(r, "Location", "HQ", "HQ Location");
      const website   = col(r, "Website", "Site", "Firm Website");
      const industry  = col(r, "Industry");
      // Store the rich row as JSON-stringifiable for metadata.
      const extras: Record<string, unknown> = {};
      for (const k of Object.keys(r)) {
        const v = r[k];
        if (v != null && String(v).trim() !== "") extras[k] = v;
      }
      return { firstName, lastName, firmName, email, linkedin, title, location, website, industry, extras };
    }).filter((c) => (c.firstName || c.lastName) && !isGenericFirm(c.firmName));

    if (!candidates.length) return { observation: "No usable rows after filtering blank names and generic firm placeholders." };

    // Schema migration (idempotent).
    await sql`alter table investment_firms add column if not exists metadata jsonb default '{}'::jsonb`;
    await sql`alter table investors        add column if not exists metadata jsonb default '{}'::jsonb`;

    // Load existing firms + investors keyed for dedupe.
    const existingFirms = (await sql`select id, name, website from investment_firms`) as Array<{ id: string; name: string; website: string | null }>;
    const firmByNorm = new Map<string, string>();
    const firmByDomain = new Map<string, string>();
    for (const f of existingFirms) {
      const n = normFirm(f.name); if (n && !firmByNorm.has(n)) firmByNorm.set(n, f.id);
      const d = siteDomain(f.website); if (d && !firmByDomain.has(d)) firmByDomain.set(d, f.id);
    }
    const existingInv = (await sql`select id, lower(email) as email_l, lower(first_name) as fn, lower(last_name) as ln, firm_id from investors`) as Array<{ id: string; email_l: string | null; fn: string | null; ln: string | null; firm_id: string | null }>;
    const invByEmail = new Map<string, string>();
    const invByFio = new Map<string, string>();
    for (const i of existingInv) {
      if (i.email_l) invByEmail.set(i.email_l, i.id);
      const k = `${i.fn || ""}|${i.ln || ""}|${i.firm_id || ""}`;
      if (!invByFio.has(k)) invByFio.set(k, i.id);
    }

    let skipMatchedEmail = 0, skipMatchedFio = 0, firmsCreated = 0, investorsInserted = 0;
    const insertedInvestorIds: string[] = [];
    const insertedFirmIds: string[] = [];

    for (const c of candidates) {
      // Resolve firm
      const nrm = normFirm(c.firmName);
      const dom = siteDomain(c.website) || emailDomain(c.email);
      let firmId = firmByNorm.get(nrm) || (dom ? firmByDomain.get(dom) : null) || null;
      if (!firmId && nrm) {
        const id = randomUUID();
        await sql`insert into investment_firms (id, name, website, location, hq_location, industry, source, created_at, updated_at, metadata)
          values (${id}, ${c.firmName}, ${c.website || null}, ${c.location || null}, ${c.location || null}, ${c.industry || null}, ${source}, now(), now(), ${JSON.stringify({ imported_from_assistant: true })}::jsonb)`;
        firmId = id; firmsCreated++; firmByNorm.set(nrm, id); insertedFirmIds.push(id);
      }
      // Resolve investor
      if (c.email && invByEmail.has(c.email)) { skipMatchedEmail++; continue; }
      if (!c.email) {
        const k = `${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}|${firmId || ""}`;
        if (invByFio.has(k)) { skipMatchedFio++; continue; }
      }
      const invId = randomUUID();
      const metaBlob = { [source]: c.extras };
      await sql`insert into investors (id, firm_id, first_name, last_name, email, title, linkedin_url, person_linkedin_url, location, hq_location, source, is_active, status, created_at, updated_at, metadata)
        values (${invId}, ${firmId}, ${c.firstName || "(unknown)"}, ${c.lastName || null}, ${c.email || null}, ${c.title || null}, ${c.linkedin || null}, ${c.linkedin || null}, ${c.location || null}, ${c.location || null}, ${source}, true, 'active', now(), now(), ${JSON.stringify(metaBlob)}::jsonb)`;
      investorsInserted++; insertedInvestorIds.push(invId);
    }

    // Audit XLSX
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ["Source tag", source],
      ["Rows read after filter", candidates.length],
      ["Firms inserted", firmsCreated],
      ["Investors inserted", investorsInserted],
      ["Skipped: already in DB (email)", skipMatchedEmail],
      ["Skipped: already in DB (name+firm)", skipMatchedFio],
    ]), "Summary");
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(
      [["Investor ID"], ...insertedInvestorIds.map((id) => [id])]
    ), "Investor IDs Inserted");
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet(
      [["Firm ID"], ...insertedFirmIds.map((id) => [id])]
    ), "Firm IDs Inserted");
    const buf = XLSX.write(wbOut, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, `Enrichment_${source}`, "xlsx");

    return {
      observation: `Source "${source}": ${candidates.length} candidate rows. Inserted ${firmsCreated} new firms + ${investorsInserted} new investors. Skipped ${skipMatchedEmail} (email match) + ${skipMatchedFio} (name+firm match). Audit XLSX -> ${artifact.url}`,
      artifact,
    };
  },
};

// ── tool: db_gap_analysis ───────────────────────────────────────────────────

const db_gap_analysis: ToolDef = {
  name: "db_gap_analysis",
  description: "Find DB firms of a given type (e.g. 'family-office', 'vc') that are NOT present in an uploaded contact XLSX. Useful for spotting outreach gaps. Returns a 3-sheet XLSX: Missing Firms, Missing Contacts, Already in Uploads.",
  params: `{ "xlsxBase64": "<<XLSXn>>", "firmType": string (e.g. "family-office", "family office", "vc"), "limit"?: number (cap DB rows scanned, default 5000) }`,
  async run(inp): Promise<ToolResult> {
    const wb = decodeXlsx(inp.xlsxBase64);
    if (!wb) return { observation: "No XLSX attached." };
    const firmType = clean(inp.firmType);
    if (!firmType) return { observation: "Provide firmType (e.g. 'family-office')." };
    const limit = Math.min(Number(inp.limit) || 5000, 20000);

    // Build upload key sets
    const uploadFirmNorms = new Set<string>();
    const uploadDomains = new Set<string>();
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) as any[];
      for (const r of rows) {
        const firm = r["Firm Name"] || r["Firm"] || r["Company"] || r["Account"];
        const email = r["Email"];
        const n = normFirm(firm); if (n) uploadFirmNorms.add(n);
        const d = emailDomain(email); if (d) uploadDomains.add(d);
      }
    }

    // Query DB
    const pattern = firmType.toLowerCase().includes("family") ? "%family%" : `%${firmType.toLowerCase()}%`;
    const dbRows = (await sql`
      select f.id, f.name, f.type, f.website, f.hq_location, f.location, f.aum, f.source as firm_source,
             i.id as investor_id, i.first_name, i.last_name, i.email, i.title, i.linkedin_url
      from investment_firms f
      left join investors i on i.firm_id = f.id
      where f.type ilike ${pattern} or f.name ilike '%family office%'
      order by lower(f.name) limit ${limit}
    `) as any[];

    const byFirm = new Map<string, { firm: any; contacts: any[] }>();
    for (const r of dbRows) {
      const key = r.name || "";
      if (!byFirm.has(key)) byFirm.set(key, { firm: r, contacts: [] });
      if (r.investor_id) byFirm.get(key)!.contacts.push(r);
    }

    const missing: Array<{ firm: any; contacts: any[]; }> = [];
    const matched: string[] = [];
    for (const [name, g] of byFirm) {
      const nrm = normFirm(name);
      const site = g.firm.website ? siteDomain(g.firm.website) : "";
      const cov = (nrm && uploadFirmNorms.has(nrm)) ? "firm-name match"
        : (site && uploadDomains.has(site)) ? "website-domain match"
        : (g.contacts.some((c) => uploadDomains.has(emailDomain(c.email)))) ? "contact-email-domain match"
        : null;
      if (cov) matched.push(`${name}  (${cov})`);
      else missing.push(g);
    }

    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ["Firm type filter", firmType],
      ["Distinct upload firm names", uploadFirmNorms.size],
      ["Distinct upload email domains", uploadDomains.size],
      ["DB firms total", byFirm.size],
      ["Already covered by uploads", matched.length],
      ["NOT in uploads (gap)", missing.length],
    ]), "Summary");
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(missing.map((g) => ({
      "Firm Name": g.firm.name, "Website": g.firm.website ?? "",
      "HQ": g.firm.hq_location ?? g.firm.location ?? "", "AUM": g.firm.aum ?? "",
      "Total contacts in DB": g.contacts.length,
      "Primary email": g.contacts[0]?.email ?? "",
      "Primary contact": [g.contacts[0]?.first_name, g.contacts[0]?.last_name].filter(Boolean).join(" "),
    }))), "Missing Firms");
    interface MissingContactRow { Firm: string; "First Name": string; "Last Name": string; Email: string; Title: string; LinkedIn: string; }
    const missingContactRows: MissingContactRow[] = missing.flatMap((g): MissingContactRow[] => {
      if (!g.contacts.length) return [{ Firm: g.firm.name, "First Name": "", "Last Name": "", Email: "", Title: "", LinkedIn: "" }];
      return g.contacts.map((c: any): MissingContactRow => ({ Firm: g.firm.name, "First Name": c.first_name ?? "", "Last Name": c.last_name ?? "", Email: c.email ?? "", Title: c.title ?? "", LinkedIn: c.linkedin_url ?? "" }));
    });
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(missingContactRows), "Missing Contacts");
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet([["Firm  (match reason)"], ...matched.slice(0, 500).map((m) => [m])]), "Already in Uploads");

    const buf = XLSX.write(wbOut, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, `Gap_${firmType.replace(/[^a-z0-9]+/gi, "_")}`, "xlsx");
    return {
      observation: `DB firms of type "${firmType}": ${byFirm.size}. ${matched.length} already in uploads. ${missing.length} NOT in uploads (gap). XLSX -> ${artifact.url}`,
      artifact,
    };
  },
};

// ── tool: generate_event_outreach_drafts ────────────────────────────────────

const generate_event_outreach_drafts: ToolDef = {
  name: "generate_event_outreach_drafts",
  description: "Per-profile email + LinkedIn DM generation for an event invite. Reads an attached profiles XLSX (must have First Name, Last Name, Firm, Email columns at minimum; Personalisation Hook, Investment Mandate, LP Type if available). Generates two voice variants (operator-first for angel/HNW; formal-warm for FO/institutional). Outputs a 7-sheet curated XLSX in the Outreach Studio's import shape.",
  params: `{ "xlsxBase64": "<<XLSXn>>", "event": { "title": string, "when": string, "presenters": string, "registrationUrl": string, "extra"?: string }, "sender": { "name": string, "role": string, "signatureBlock"?: string }, "limit"?: number (cap profiles), "concurrency"?: number (default 4) }`,
  async run(inp): Promise<ToolResult> {
    const wb = decodeXlsx(inp.xlsxBase64);
    if (!wb) return { observation: "No XLSX attached." };
    const ev = inp.event ?? {};
    if (!ev.title || !ev.when || !ev.registrationUrl) {
      return { observation: "event.title, event.when, and event.registrationUrl are required." };
    }
    const sender = inp.sender ?? {};
    if (!sender.name) return { observation: "sender.name is required." };
    const concurrency = Math.min(Math.max(Number(inp.concurrency) || 4, 1), 8);
    const limitN = Math.min(Number(inp.limit) || 1000, 1000);

    const curatedSheet = pickSheet(wb, "Curated Profiles (Enriched)", "Profiles", "Sheet1");
    if (!curatedSheet) return { observation: `Could not find a profiles sheet. Available: ${wb.SheetNames.join(", ")}.` };
    const rows = XLSX.utils.sheet_to_json(curatedSheet, { defval: "" }) as any[];
    const dmsSheet = pickSheet(wb, "LinkedIn DMs");
    const dmNums = dmsSheet ? new Set((XLSX.utils.sheet_to_json(dmsSheet, { defval: "" }) as any[]).map((r) => String(r["#"]))) : new Set<string>();

    const profiles: CuratedProfile[] = rows.slice(0, limitN).map((r, i) => ({
      num: String(r["#"] ?? i + 1),
      name: clean(r["Name"]),
      lpType: clean(r["LP Type"]),
      email: clean(r["Email"]),
      linkedin: clean(r["LinkedIn"]),
      tier: clean(r["Tier"]),
      score: clean(r["Score"]),
      title: clean(r["Title/Role"]),
      tags: clean(r["Tags"]),
      location: clean(r["Location"]),
      sectors: clean(r["Sectors"]),
      whyThisContact: clean(r["Why This Contact"]),
      firmIntelligence: clean(r["Firm Intelligence"]),
      investmentMandate: clean(r["Investment Mandate"]),
      personalisationHook: clean(r["Personalisation Hook"]),
      batch: clean(r["Batch"]),
      multiTouchNote: clean(r["Multi-Touch Note"]),
    })).filter((p) => p.name);

    // Build LLM prompts (returns JSON {subject, body} for emails, {dm} for DMs).
    const emailPrompts: string[] = profiles.map((p) => {
      const operator = isAngelOrHnw(p.lpType, p.tags);
      const firstName = firstNameOf(p.name);
      const voice = operator
        ? `Operator-first. Open with "Hi ${firstName}, Philippe here." Warm peer-to-peer.`
        : `Formal-warm. Open with "Dear ${firstName},". Quiet credibility.`;
      return [
        "You write outreach for " + sender.name + " (" + (sender.role || "") + ").",
        "",
        "EVENT", "Title: " + ev.title, "When: " + ev.when, "Presenters: " + (ev.presenters || ""), "Registration: " + ev.registrationUrl, ev.extra || "",
        "", "RECIPIENT", "Name: " + p.name, "Title: " + p.title, "LP Type: " + p.lpType, "Sectors: " + p.sectors,
        "Personalisation hook: " + p.personalisationHook, "Investment mandate: " + p.investmentMandate,
        "", "VOICE", voice,
        "", "RULES", "- 90 to 130 words, three paragraphs.",
        "- Para 1: personalise. Para 2: event + relevance. Para 3: date/time/Zoom + single CTA register at " + ev.registrationUrl,
        '- Sign with "' + sender.name + '" on its own line.',
        "- NO em-dashes (use commas), NO exclamation marks, NO 'exclusive'.",
        "- Subject 5-9 words, no ! or ?, no 'invitation' or 'exclusive'.",
        '', 'Return JSON: {"subject":"...","body":"..."}',
      ].join("\n");
    });
    const dmPrompts: Array<{ idx: number; prompt: string }> = profiles
      .map((p, i) => ({ p, i }))
      .filter((x) => dmNums.has(x.p.num) && x.p.linkedin)
      .map(({ p, i }) => {
        const firstName = firstNameOf(p.name);
        return {
          idx: i,
          prompt: [
            "Write LinkedIn DM for " + sender.name + " inviting " + p.name + " (" + p.lpType + ") to: " + ev.title + " on " + ev.when + ". Register: " + ev.registrationUrl,
            "Open with: \"Hi " + firstName + ", Philippe here, VP at Summit Venture Studio.\"",
            "One personalised sentence tying " + (p.personalisationHook || p.sectors) + " to the event theme.",
            "One sentence with event details.",
            "One sentence CTA with " + ev.registrationUrl,
            "MAX 280 chars total. No em-dashes. No exclamation marks. Output JSON: {\"dm\":\"...\"}",
          ].join("\n"),
        };
      });

    // Batch call the provider (uses Qwen via DashScope if configured).
    const emailOuts = await generateBatch(emailPrompts, { json: true, maxTokens: 700, temperature: 0.6, task: "draft_outreach" as any }, concurrency);
    const dmOuts = dmPrompts.length
      ? await generateBatch(dmPrompts.map((d) => d.prompt), { json: true, maxTokens: 400, temperature: 0.5, task: "draft_outreach" as any }, concurrency)
      : [];

    const drafts = new Map<string, DraftRow>();
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      let subject = "", body = "";
      try {
        const j = JSON.parse((emailOuts[i] || "{}").replace(/^```(?:json)?|```$/g, "").trim());
        subject = sanitize(String(j.subject || ""));
        body = sanitize(String(j.body || ""));
      } catch { /* leave empty */ }
      if (subject && body) {
        if (!body.includes(ev.registrationUrl)) {
          body = body.replace(new RegExp(`(${sender.name}\\s*)$`), `Register at ${ev.registrationUrl}.\n$1`);
        }
        if (sender.signatureBlock) body = body.replace(new RegExp(`(${sender.name}\\s*)$`), sender.signatureBlock);
        drafts.set(p.num, { num: p.num, subject, body, voice: isAngelOrHnw(p.lpType, p.tags) ? "operator-first" : "formal-warm", primaryChannel: dmNums.has(p.num) ? "linkedin" : "email" });
      }
    }
    for (let i = 0; i < dmPrompts.length; i++) {
      const { idx } = dmPrompts[i];
      const p = profiles[idx];
      const existing = drafts.get(p.num);
      if (!existing) continue;
      try {
        const j = JSON.parse((dmOuts[i] || "{}").replace(/^```(?:json)?|```$/g, "").trim());
        let dm = sanitize(String(j.dm || ""));
        if (!dm.includes(ev.registrationUrl)) dm = dm.trimEnd().replace(/\.$/, "") + " " + ev.registrationUrl;
        if (dm.length > 295) {
          // Hard-truncate as last resort: opener + URL.
          const firstName = firstNameOf(p.name);
          dm = `Hi ${firstName}, Philippe here, VP at Summit Venture Studio. Join us for ${ev.title}: ${ev.registrationUrl}`;
        }
        existing.dm = dm;
      } catch { /* leave undefined */ }
    }

    const issues: string[] = [];
    for (const [num, d] of drafts) issues.push(...validateDraft(num, d, [ev.registrationUrl]));

    const buf = buildCuratedXlsx({
      campaignTitle: ev.title + " - " + ev.when,
      generatedAt: new Date().toISOString(),
      profiles,
      drafts,
      validationIssues: issues,
      registrationUrls: [ev.registrationUrl],
      methodologyNote: [
        "Anker AI Assistant - per-profile event outreach drafts.",
        "Two voice variants: operator-first (angel/HNW) and formal-warm (family office, institutional).",
        "LLM provider: in-house generateBatch (Qwen via DashScope if configured).",
        "Deterministic post-processor strips em-dashes, ensures the registration URL is in every body/DM.",
        "DM hard limit: 300 chars (LinkedIn connection request).",
      ].join("\n"),
    });
    const artifact = await saveArtifact(buf, `Outreach_${ev.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`, "xlsx");
    return {
      observation: `Generated ${drafts.size} emails + ${[...drafts.values()].filter((d) => d.dm).length} DMs across ${profiles.length} profiles. ${issues.length} validation issues. Curated XLSX -> ${artifact.url}`,
      artifact,
    };
  },
};

// ── tool: apply_template_to_outreach_drafts ────────────────────────────────

const apply_template_to_outreach_drafts: ToolDef = {
  name: "apply_template_to_outreach_drafts",
  description: "Deterministic per-profile substitution of a fixed email + DM template. No LLM calls. Use when the user has a canonical template (e.g. from a managing partner) and wants it sent to every profile with first-name personalisation only. Validates and outputs the same 7-sheet curated XLSX shape.",
  params: `{ "xlsxBase64": "<<XLSXn>>", "subject": string, "emailTemplate": string (use {firstName}, {senderSignature} placeholders), "dmTemplate": string (use {firstName}, MUST stay <=300 chars after substitution), "senderSignature"?: string, "registrationUrls": string[] (URLs that must appear in body and DM), "campaignTitle"?: string, "limit"?: number }`,
  async run(inp): Promise<ToolResult> {
    const wb = decodeXlsx(inp.xlsxBase64);
    if (!wb) return { observation: "No XLSX attached." };
    const subject = clean(inp.subject);
    const emailTpl = String(inp.emailTemplate || "");
    const dmTpl = String(inp.dmTemplate || "");
    const sig = String(inp.senderSignature || "");
    const urls: string[] = Array.isArray(inp.registrationUrls) ? inp.registrationUrls.map(String) : [];
    if (!subject || !emailTpl) return { observation: "subject and emailTemplate are required." };
    if (!urls.length) return { observation: "registrationUrls must include at least one URL." };
    const limitN = Math.min(Number(inp.limit) || 5000, 5000);

    const curatedSheet = pickSheet(wb, "Curated Profiles (Enriched)", "Profiles", "Sheet1");
    if (!curatedSheet) return { observation: `Could not find a profiles sheet. Available: ${wb.SheetNames.join(", ")}.` };
    const rows = XLSX.utils.sheet_to_json(curatedSheet, { defval: "" }) as any[];
    const dmsSheet = pickSheet(wb, "LinkedIn DMs");
    const dmNums = dmsSheet ? new Set((XLSX.utils.sheet_to_json(dmsSheet, { defval: "" }) as any[]).map((r) => String(r["#"]))) : new Set<string>();

    const profiles: CuratedProfile[] = rows.slice(0, limitN).map((r, i) => ({
      num: String(r["#"] ?? i + 1),
      name: clean(r["Name"]),
      lpType: clean(r["LP Type"]),
      email: clean(r["Email"]),
      linkedin: clean(r["LinkedIn"]),
      tier: clean(r["Tier"]),
      score: clean(r["Score"]),
      title: clean(r["Title/Role"]),
      tags: clean(r["Tags"]),
      location: clean(r["Location"]),
      sectors: clean(r["Sectors"]),
      whyThisContact: clean(r["Why This Contact"]),
      firmIntelligence: clean(r["Firm Intelligence"]),
      investmentMandate: clean(r["Investment Mandate"]),
      personalisationHook: clean(r["Personalisation Hook"]),
      batch: clean(r["Batch"]),
      multiTouchNote: clean(r["Multi-Touch Note"]),
    })).filter((p) => p.name);

    const drafts = new Map<string, DraftRow>();
    let dmHardTruncated = 0;
    for (const p of profiles) {
      const fn = firstNameOf(p.name);
      let body = emailTpl.replace(/\{firstName\}/g, fn).replace(/\{senderSignature\}/g, sig);
      body = sanitize(body);
      let dm: string | undefined;
      if (dmNums.has(p.num) && p.linkedin && dmTpl) {
        dm = sanitize(dmTpl.replace(/\{firstName\}/g, fn));
        if (dm.length > 300) {
          // Hard-truncate fallback
          dm = dm.slice(0, 295) + "...";
          dmHardTruncated++;
        }
      }
      drafts.set(p.num, {
        num: p.num, subject, body, dm,
        voice: isAngelOrHnw(p.lpType, p.tags) ? "operator-first" : "formal-warm",
        primaryChannel: dmNums.has(p.num) ? "linkedin" : "email",
      });
    }

    const issues: string[] = [];
    for (const [num, d] of drafts) issues.push(...validateDraft(num, d, urls));

    const buf = buildCuratedXlsx({
      campaignTitle: clean(inp.campaignTitle) || "Templated event outreach",
      generatedAt: new Date().toISOString(),
      profiles,
      drafts,
      validationIssues: issues,
      registrationUrls: urls,
      methodologyNote: [
        "Anker AI Assistant - deterministic template substitution.",
        "Single subject, single email body template, single DM template applied to every profile.",
        "Substitutions: {firstName}, {senderSignature}.",
        "No LLM calls. Em-dash + double-space cleanup applied. URL presence checked.",
        "DMs exceeding 300 chars are hard-truncated (count reported in observation).",
      ].join("\n"),
    });
    const artifact = await saveArtifact(buf, `Templated_${(inp.campaignTitle || "outreach").toString().replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`, "xlsx");
    return {
      observation: `Applied template to ${profiles.length} profiles (${[...drafts.values()].filter((d) => d.dm).length} DMs). ${issues.length} validation issues; ${dmHardTruncated} DM(s) hard-truncated to fit 300 chars. Curated XLSX -> ${artifact.url}`,
      artifact,
    };
  },
};


// ── tool: enrich_xlsx_with_llm ─────────────────────────────────────────────

const enrich_xlsx_with_llm: ToolDef = {
  name: "enrich_xlsx_with_llm",
  description: "LLM-enrich a thin contact XLSX. For each row, calls Qwen with the contact data + the sender's context and produces four short fields: Personalisation Hook, Firm Intelligence, Investment Mandate, Why This Contact. Output is a single 'Curated Profiles (Enriched)' sheet that other tools (generate_event_outreach_drafts, apply_template_to_outreach_drafts) accept as input. Use this when the user uploads a thin contact list (First Name / Last Name / Firm / Email) and wants outreach-ready enrichment before drafting.",
  params: `{ "xlsxBase64": "<<XLSXn>>", "senderContext": string (what the sender is offering / who they are - shapes every personalisation hook), "sheet"?: string, "limit"?: number (cap rows enriched, default 500, hard max 1000), "concurrency"?: number (default 4, max 8), "columns"?: string[] (which of the 4 enrichment columns to produce - default all 4) }`,
  async run(inp): Promise<ToolResult> {
    const wb = decodeXlsx(inp.xlsxBase64);
    if (!wb) return { observation: "No XLSX attached or marker did not resolve. Caller must pass xlsxBase64: \"<<XLSXn>>\"." };
    const senderContext = clean(inp.senderContext);
    if (!senderContext) return { observation: "senderContext is required - one sentence describing what the sender is offering, e.g. 'We are a venture studio commercialising university software, raising Fund II from family offices.'" };
    const concurrency = Math.min(Math.max(Number(inp.concurrency) || 4, 1), 8);
    const limitN = Math.min(Number(inp.limit) || 500, 1000);
    const wantCols: Set<string> = new Set(
      Array.isArray(inp.columns) && inp.columns.length
        ? inp.columns.map((c: unknown) => String(c).toLowerCase())
        : ["personalisation_hook", "firm_intelligence", "investment_mandate", "why_this_contact"]
    );

    // Pick the input sheet
    let ws: XLSX.WorkSheet | null = inp.sheet ? wb.Sheets[String(inp.sheet)] : null;
    if (!ws) {
      ws = pickSheet(wb, "Curated Profiles (Enriched)", "Profiles", "Sheet1", "Ranked Master") || wb.Sheets[wb.SheetNames[0]];
    }
    if (!ws) return { observation: `Could not find an input sheet. Available: ${wb.SheetNames.join(", ")}.` };
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
    if (!rows.length) return { observation: "Input sheet is empty." };

    const col = (r: Record<string, unknown>, ...names: string[]): string => {
      for (const n of names) {
        const v = r[n];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    };

    interface SrcRow { idx: number; original: Record<string, unknown>; name: string; firm: string; title: string; lpType: string; sectors: string; location: string; linkedin: string; website: string; email: string; }
    const src: SrcRow[] = rows.slice(0, limitN).map((r, i): SrcRow => {
      const first = col(r, "First Name", "FirstName", "first_name");
      const last  = col(r, "Last Name",  "LastName",  "last_name");
      const name  = col(r, "Name") || [first, last].filter(Boolean).join(" ");
      return {
        idx: i,
        original: r,
        name,
        firm: col(r, "Firm Name", "Firm", "Company", "Account"),
        title: col(r, "Title/Role", "Title", "Role"),
        lpType: col(r, "LP Type", "Investor Type", "Type"),
        sectors: col(r, "Sectors", "Industry"),
        location: col(r, "Location", "HQ", "HQ Location"),
        linkedin: col(r, "LinkedIn", "LinkedIn URL"),
        website: col(r, "Website", "Firm Website"),
        email: col(r, "Email"),
      };
    }).filter((s) => s.name && s.firm);

    if (!src.length) return { observation: "No rows had both Name and Firm filled - cannot enrich. Check the column headers in the input sheet." };

    // Build prompts
    const prompts: string[] = src.map((s) => [
      "You enrich investor / LP contacts for outreach personalisation.",
      "",
      "SENDER CONTEXT (what the sender is offering / why outreach):",
      senderContext,
      "",
      "CONTACT ROW:",
      `Name: ${s.name}`,
      `Title: ${s.title}`,
      `Firm: ${s.firm}`,
      `LP Type: ${s.lpType}`,
      `Location: ${s.location}`,
      `Sectors: ${s.sectors}`,
      `LinkedIn: ${s.linkedin}`,
      `Website: ${s.website}`,
      "",
      "For each field below, return a SHORT factual answer (1-2 sentences MAX, no marketing language, no em-dashes, no exclamation marks):",
      "",
      "- firm_intelligence: 1 short sentence describing the firm (what they are, what they invest in). Use Title + Firm + Sectors as cues. If unknown, return empty string.",
      "- investment_mandate: 1 short sentence inferring likely investment focus (sectors, stage, geography). If insufficient signal, return empty string.",
      "- why_this_contact: 1 short sentence on why this contact is worth approaching given the sender context (sector overlap, role fit, thesis alignment).",
      "- personalisation_hook: 1 short sentence tying the contact's background to the sender's offering, suitable as the opening hook line of a cold email. Concrete, not generic.",
      "",
      "Return ONLY this JSON (no markdown fence, no commentary):",
      `{"firm_intelligence":"...","investment_mandate":"...","why_this_contact":"...","personalisation_hook":"..."}`,
    ].join("\n"));

    // generateBatch routes through the configured AI provider (Qwen via DashScope when configured).
    const outs = await generateBatch(prompts, { json: true, maxTokens: 350, temperature: 0.4, task: "enrich_firm" as any }, concurrency);

    // Stitch enrichment back into the rows
    let okCount = 0, parseFailures = 0;
    const enrichedRows = rows.map((r) => ({ ...r })); // shallow copy
    for (let i = 0; i < src.length; i++) {
      const s = src[i];
      const raw = outs[i] || "";
      let parsed: { firm_intelligence?: string; investment_mandate?: string; why_this_contact?: string; personalisation_hook?: string } = {};
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch { parseFailures++; }

      const out = enrichedRows[s.idx];
      const hadAny = Object.values(parsed).some((v) => typeof v === "string" && v.trim());
      if (hadAny) okCount++;
      if (wantCols.has("firm_intelligence")    && parsed.firm_intelligence)    out["Firm Intelligence"]    = sanitize(String(parsed.firm_intelligence));
      if (wantCols.has("investment_mandate")   && parsed.investment_mandate)   out["Investment Mandate"]   = sanitize(String(parsed.investment_mandate));
      if (wantCols.has("why_this_contact")     && parsed.why_this_contact)     out["Why This Contact"]     = sanitize(String(parsed.why_this_contact));
      if (wantCols.has("personalisation_hook") && parsed.personalisation_hook) out["Personalisation Hook"] = sanitize(String(parsed.personalisation_hook));

      // Normalize key columns so downstream tools find them
      if (!out["Name"] && s.name) out["Name"] = s.name;
      if (!out["Title/Role"] && s.title) out["Title/Role"] = s.title;
      if (!out["LP Type"] && s.lpType) out["LP Type"] = s.lpType;
      if (!out["#"]) out["#"] = String(s.idx + 1);
    }

    // Reorder columns: original first, then enriched fields at the end (deterministic).
    const allKeys = new Set<string>();
    for (const r of enrichedRows) for (const k of Object.keys(r)) allKeys.add(k);
    const tailCols = ["Why This Contact", "Firm Intelligence", "Investment Mandate", "Personalisation Hook"];
    const orderedKeys: string[] = [
      ...Array.from(allKeys).filter((k) => !tailCols.includes(k)),
      ...tailCols.filter((k) => allKeys.has(k)),
    ];
    const ordered = enrichedRows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const k of orderedKeys) o[k] = r[k] ?? "";
      return o;
    });

    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ["Sender context", senderContext.slice(0, 200)],
      ["Input rows", rows.length],
      ["Rows enriched", okCount],
      ["JSON parse failures", parseFailures],
      ["Concurrency", concurrency],
      ["Columns produced", Array.from(wantCols).join(", ")],
    ]), "Summary");
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(ordered), "Curated Profiles (Enriched)");
    const buf = XLSX.write(wbOut, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, `Enriched_${senderContext.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`, "xlsx");

    return {
      observation: `Enriched ${okCount}/${src.length} contact rows (${parseFailures} JSON parse failures). Enriched columns: ${Array.from(wantCols).join(", ")}. Curated XLSX -> ${artifact.url}. Pipe this into generate_event_outreach_drafts or apply_template_to_outreach_drafts next.`,
      artifact,
    };
  },
};

// ── export ─────────────────────────────────────────────────────────────────
export const FO_TOOLS: Record<string, ToolDef> = {
  enrich_db_from_xlsx,
  enrich_xlsx_with_llm,
  db_gap_analysis,
  generate_event_outreach_drafts,
  apply_template_to_outreach_drafts,
};
