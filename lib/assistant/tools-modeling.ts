/**
 * Anker AI Assistant — engine-backed modeling + fund-ops tools (§D of the tooling
 * expansion). Merged into the main TOOLS catalog in lib/assistant/agent.ts.
 *
 * Every figure these tools produce comes from a deterministic engine under
 * lib/modules/* — the sealed-engine invariant: the model chooses inputs and drafts
 * narrative, the engine computes, a person approves. None of these send or mutate;
 * they emit a downloadable workbook / document for review.
 *
 *   model_vesting        Option/RSU vesting (cliff + schedule) — lib/modules/vesting
 *   model_409a           OPM 409A common FMV — lib/modules/opm-409a
 *   model_waterfall      Fund distribution waterfall + per-LP split — lib/modules/waterfall
 *   draft_capital_call   Pro-rata capital call across LP commitments (draft, human-approved)
 *   ic_memo              Investment-committee memo in the white-paper house style (docx)
 */
import * as XLSX from "xlsx";
import { sql } from "@/lib/db";
import { type ToolDef, type ToolResult, saveArtifact } from "./artifact";
import { computeVesting, buildVestingSchedule, type VestingInputs } from "@/lib/modules/vesting";
import { compute409a, type OpmInputs } from "@/lib/modules/opm-409a";
import { computeWaterfall, distributeToInvestors, type CapTableRow } from "@/lib/modules/waterfall";
import { runMonteCarlo } from "@/lib/portfolio/monte-carlo";
import { listCompanies, getLatestKpi } from "@/lib/portfolio/queries";
import { markdownToDocxBuffer } from "@/lib/ai/docx-export";

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Number(v), but falls back to `d` for null/undefined/NaN — unlike `Number(v) ?? d`
 *  (which lets NaN through) or `Number(v) || d` (which wrongly overrides a legit 0). */
const numOr = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const model_vesting: ToolDef = {
  name: "model_vesting",
  description:
    "Compute an equity vesting position (options/RSUs) from a grant: vested vs unvested as of a date, cliff status, fully-vested date, and the full month-by-month schedule. Deterministic engine (lib/modules/vesting) — the model supplies grant terms, the engine computes. Returns a schedule workbook. Use for cap-table / employee-equity questions.",
  params: `{ "totalOptions": number, "vestingStart": "YYYY-MM-DD", "vestMonths"?: number(=48), "cliffMonths"?: number(=12), "terminatedOn"?: "YYYY-MM-DD"|null, "asOf"?: "YYYY-MM-DD" }`,
  async run(inp): Promise<ToolResult> {
    const total = Number(inp.totalOptions);
    if (!Number.isFinite(total) || total <= 0) return { observation: "Provide a positive 'totalOptions'." };
    if (!inp.vestingStart) return { observation: "Provide 'vestingStart' (YYYY-MM-DD)." };
    const input: VestingInputs = {
      totalOptions: total,
      vestingStart: String(inp.vestingStart),
      vestMonths: numOr(inp.vestMonths, 48),
      cliffMonths: numOr(inp.cliffMonths, 12),
      terminatedOn: inp.terminatedOn ? String(inp.terminatedOn) : null,
    };
    const asOf = inp.asOf ? new Date(String(inp.asOf)) : new Date();
    const res = computeVesting(input, asOf);
    const schedule = buildVestingSchedule(input);
    const aoa: (string | number)[][] = [
      ["ANKER · Vesting schedule"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["Total granted", input.totalOptions],
      ["Vesting start", input.vestingStart ?? ""],
      ["Vest months / cliff", `${input.vestMonths} / ${input.cliffMonths}`],
      ["As of", asOf.toISOString().slice(0, 10)],
      ["Vested", res.vested],
      ["Unvested", res.unvested],
      ["Fraction vested", `${(res.fractionVested * 100).toFixed(1)}%`],
      ["Cliff reached?", res.cliffReached ? "YES" : "NO"],
      ["Fully vested on", res.fullyVestedOn ?? "—"],
      [],
      ["Month", "Date", "Vested", "Vested this month", "Cliff?"],
      ...schedule.map((r) => [r.month, r.date, r.vested, r.vestedThisMonth, r.isCliff ? "cliff" : ""]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Vesting");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, "Vesting_Schedule", "xlsx");
    return { observation: `Vesting as of ${asOf.toISOString().slice(0, 10)}: ${res.vested} vested / ${res.unvested} unvested (${(res.fractionVested * 100).toFixed(1)}%), cliff ${res.cliffReached ? "reached" : "not reached"}, fully vested ${res.fullyVestedOn ?? "n/a"}. Schedule → ${artifact.url}`, artifact };
  },
};

const model_409a: ToolDef = {
  name: "model_409a",
  description:
    "Estimate a 409A common-share fair market value via the Option Pricing Model (OPM backsolve + Black-Scholes allocation + DLOM). Deterministic engine (lib/modules/opm-409a). Indicative only — not a substitute for an independent 409A appraisal. Returns the common FMV, breakpoints, and tranche allocation as a workbook.",
  params: `{ "commonShares": number, "preferredShares": number, "liquidationPref": number($ total), "recentPrice": number($/preferred share), "volatility"?: number(=0.6), "riskFreeRate"?: number(=0.04), "yearsToLiquidity"?: number(=4), "dlom"?: number(=0.25) }`,
  async run(inp): Promise<ToolResult> {
    const i: OpmInputs = {
      commonShares: Number(inp.commonShares) || 0,
      preferredShares: Number(inp.preferredShares) || 0,
      liquidationPref: Number(inp.liquidationPref) || 0,
      recentPrice: Number(inp.recentPrice) || 0,
      volatility: numOr(inp.volatility, 0.6),
      riskFreeRate: numOr(inp.riskFreeRate, 0.04),
      yearsToLiquidity: numOr(inp.yearsToLiquidity, 4),
      dlom: numOr(inp.dlom, 0.25),
    };
    if (i.commonShares <= 0 || i.preferredShares <= 0 || i.recentPrice <= 0) return { observation: "Provide positive commonShares, preferredShares, and recentPrice." };
    const r = compute409a(i);
    const aoa: (string | number)[][] = [
      ["ANKER · 409A (OPM) — indicative"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["Common shares", i.commonShares], ["Preferred shares", i.preferredShares],
      ["Liquidation preference", i.liquidationPref], ["Recent preferred price", i.recentPrice],
      ["Volatility / rf / years / DLOM", `${i.volatility} / ${i.riskFreeRate} / ${i.yearsToLiquidity} / ${i.dlom}`], [],
      ["Backsolved equity value", round2(r.equityValue)],
      ["Implied post-money", round2(r.impliedPostMoney)],
      ["Common value (marketable)", round2(r.commonValue)],
      ["Common per share (marketable)", round2(r.commonPerShareMarketable)],
      ["Common FMV (after DLOM) — 409A", round2(r.commonFmv)],
      [], ["Breakpoint: liq pref", round2(r.breakpoints.lp)], ["Breakpoint: conversion", round2(r.breakpoints.conversion)],
      [], ["Tranche", "From", "To", "→ Common", "→ Preferred", "Value"],
      ...r.tranches.map((t) => [t.label, round2(t.from), t.to == null ? "∞" : round2(t.to), round2(t.toCommon), round2(t.toPreferred), round2(t.value)]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "409A OPM");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, "409A_OPM", "xlsx");
    return { observation: `409A (OPM, indicative): common FMV ${money(r.commonFmv)}/share (marketable ${money(r.commonPerShareMarketable)}, DLOM ${(i.dlom * 100).toFixed(0)}%). Backsolved equity ${money(r.equityValue)}. Workbook → ${artifact.url}. NOTE: indicative — not an independent appraisal.`, artifact };
  },
};

const model_waterfall: ToolDef = {
  name: "model_waterfall",
  description:
    "Model a fund distribution waterfall (return of capital → LP preferred/hurdle → carry split) at a given exit, and optionally split the LP total pro-rata across investors. Deterministic engine (lib/modules/waterfall). Returns MOICs + a per-investor workbook.",
  params: `{ "contributed": number, "proceeds": number, "carryPct"?: number(=20), "hurdlePct"?: number(=8), "investors"?: { "investor": string, "contributed": number, "ownership": number(0-1) }[] }`,
  async run(inp): Promise<ToolResult> {
    const contributed = Number(inp.contributed), proceeds = Number(inp.proceeds);
    if (!Number.isFinite(contributed) || !Number.isFinite(proceeds)) return { observation: "Provide numeric 'contributed' and 'proceeds'." };
    const carryPct = numOr(inp.carryPct, 20), hurdlePct = numOr(inp.hurdlePct, 8);
    const wf = computeWaterfall(contributed, proceeds, carryPct, hurdlePct);
    const rows: CapTableRow[] = Array.isArray(inp.investors)
      ? inp.investors.map((r: any) => ({ investor: String(r?.investor ?? "LP"), contributed: Number(r?.contributed) || 0, ownership: Number(r?.ownership) || 0 }))
      : [];
    const perInvestor = rows.length ? distributeToInvestors(rows, wf) : [];
    const aoa: (string | number)[][] = [
      ["ANKER · Distribution waterfall"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["Contributed", round2(wf.contributed)], ["Proceeds", round2(wf.proceeds)], ["Profit", round2(wf.profit)],
      ["Return of capital", round2(wf.returnOfCapital)], [`LP preferred (${hurdlePct}% hurdle)`, round2(wf.lpPreferred)],
      ["LP profit share", round2(wf.lpProfitShare)], [`GP carry (${carryPct}%)`, round2(wf.gpCarry)],
      ["LP total", round2(wf.lpTotal)], ["GP total", round2(wf.gpTotal)],
      ["Gross MOIC", round2(wf.grossMoic)], ["LP MOIC", round2(wf.lpMoic)],
    ];
    if (perInvestor.length) {
      aoa.push([], ["Investor", "Contributed", "Ownership", "Distribution", "Gain", "MOIC"],
        ...perInvestor.map((p) => [p.investor, round2(p.contributed), `${(p.ownership * 100).toFixed(1)}%`, round2(p.distribution), round2(p.gain), round2(p.moic)]));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Waterfall");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, "Distribution_Waterfall", "xlsx");
    return { observation: `Waterfall: LP total ${money(wf.lpTotal)} (MOIC ${wf.lpMoic.toFixed(2)}×), GP carry ${money(wf.gpCarry)}; gross MOIC ${wf.grossMoic.toFixed(2)}×.${perInvestor.length ? ` Split across ${perInvestor.length} investor(s).` : ""} Workbook → ${artifact.url}`, artifact };
  },
};

const draft_capital_call: ToolDef = {
  name: "draft_capital_call",
  description:
    "Draft a pro-rata capital call across LP commitments (DRAFT only — never sends). The engine splits the total call by each LP's share of committed capital and assigns the rounding remainder to the largest LP so the per-LP amounts sum EXACTLY to the call. The model may draft the purpose narrative; the amounts are engine-computed. Returns a per-LP notice workbook for a person to review and send.",
  params: `{ "fundName": string, "callAmount": number($ total to call), "purpose"?: string, "dueDate"?: "YYYY-MM-DD", "lps": { "name": string, "commitment": number }[] }`,
  async run(inp): Promise<ToolResult> {
    const fundName = String(inp.fundName ?? "").trim();
    const callAmount = Number(inp.callAmount);
    const lps: { name: string; commitment: number }[] = Array.isArray(inp.lps)
      ? inp.lps.map((l: any) => ({ name: String(l?.name ?? "LP"), commitment: Number(l?.commitment) || 0 })).filter((l: any) => l.commitment > 0)
      : [];
    if (!fundName) return { observation: "Provide 'fundName'." };
    if (!Number.isFinite(callAmount) || callAmount <= 0) return { observation: "Provide a positive 'callAmount'." };
    if (!lps.length) return { observation: "Provide 'lps' — a list of { name, commitment } with positive commitments." };

    const totalCommit = lps.reduce((s, l) => s + l.commitment, 0);
    // Round each share to the cent, then push the residual onto the largest LP so the
    // per-LP amounts tie to the call exactly (no penny lost to rounding).
    let allocated = 0;
    const draft = lps.map((l) => {
      const share = l.commitment / totalCommit;
      const amount = round2(callAmount * share);
      allocated = round2(allocated + amount);
      return { name: l.name, commitment: l.commitment, pct: share, amount };
    });
    const residual = round2(callAmount - allocated);
    if (residual !== 0 && draft.length) {
      const biggest = draft.reduce((a, b) => (b.commitment > a.commitment ? b : a));
      biggest.amount = round2(biggest.amount + residual);
    }
    const tie = round2(draft.reduce((s, d) => s + d.amount, 0));

    const aoa: (string | number)[][] = [
      ["ANKER · Capital call — DRAFT (not sent)"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["Fund", fundName], ["Call amount", round2(callAmount)], ["Purpose", String(inp.purpose ?? "")],
      ["Due date", String(inp.dueDate ?? "")], ["Total committed capital", totalCommit], ["Sum of per-LP calls (ties to call?)", `${tie} ${tie === round2(callAmount) ? "✓" : "✗"}`], [],
      ["LP", "Commitment", "Share %", "Called this notice"],
      ...draft.map((d) => [d.name, d.commitment, `${(d.pct * 100).toFixed(2)}%`, d.amount]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Capital call");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, `Capital_Call_${fundName}`, "xlsx");
    return { observation: `DRAFT capital call for "${fundName}": ${money(callAmount)} split pro-rata across ${draft.length} LP(s); per-LP amounts sum to ${money(tie)} (${tie === round2(callAmount) ? "ties" : "does NOT tie"}). Review + send manually — nothing was sent. Workbook → ${artifact.url}`, artifact };
  },
};

const ic_memo: ToolDef = {
  name: "ic_memo",
  description:
    "Generate an Investment Committee memo in the Anker white-paper house style (branded .docx: cover, numbered sections, justified serif). You supply the narrative for each section; the tool provides the standard IC structure + branding. Any figures you include should come from the modeling tools (model_waterfall / model_409a / the data-room engines), not be invented. Returns a docx.",
  params: `{ "company": string, "recommendation"?: string, "thesis"?: string, "market"?: string, "product"?: string, "team"?: string, "terms"?: string, "financials"?: string, "risks"?: string, "author"?: string }`,
  async run(inp): Promise<ToolResult> {
    const company = String(inp.company ?? "").trim();
    if (!company) return { observation: "Provide 'company'." };
    const sec = (title: string, body: unknown) => {
      const t = String(body ?? "").trim();
      return t ? `## ${title}\n\n${t}\n` : "";
    };
    const md = [
      inp.recommendation ? `## Recommendation\n\n${String(inp.recommendation).trim()}\n` : "",
      sec("Thesis", inp.thesis),
      sec("Market", inp.market),
      sec("Product & technology", inp.product),
      sec("Team", inp.team),
      sec("Deal terms", inp.terms),
      sec("Financials", inp.financials),
      sec("Risks & mitigants", inp.risks),
    ].filter(Boolean).join("\n");
    if (!md.trim()) return { observation: "Provide at least one section (thesis, market, recommendation, …)." };
    const buf = await markdownToDocxBuffer(md, `Investment Committee Memo — ${company}`, {
      subtitle: "Investment Committee Memo",
      author: inp.author ? String(inp.author) : undefined,
      role: "Confidential — for IC review",
      metaLine: `${new Date().toISOString().slice(0, 10)}  ·  an-ker.de`,
    });
    const artifact = await saveArtifact(buf, `IC_Memo_${company}`, "docx");
    return { observation: `IC memo for "${company}" generated in the house style (branded docx). → ${artifact.url}`, artifact };
  },
};

const portfolio_kpi_rollup: ToolDef = {
  name: "portfolio_kpi_rollup",
  description:
    "Roll up the latest monthly KPI snapshot across a fund's portfolio companies: total ARR, revenue, net burn, cash, blended gross margin, headcount, portfolio-at-cost, and a fund-level blended runway — plus per-company detail. Deterministic aggregation over portfolio_companies + the latest portfolio_kpis_monthly per company; no figure is invented. Read-only, returns a workbook.",
  params: `{ "fundId"?: string(=svs-fund-ii), "status"?: "active"|"exited"|"written_off"|"on_watch"|"all"(=active) }`,
  async run(inp): Promise<ToolResult> {
    const fundId = inp.fundId ? String(inp.fundId) : "svs-fund-ii";
    const status = inp.status ? String(inp.status) : "active";
    let companies: Awaited<ReturnType<typeof listCompanies>>["rows"];
    try { companies = (await listCompanies({ fundId, status: status as any, limit: 500 })).rows; }
    catch (e: any) { return { observation: `Could not read the portfolio (${e?.message ?? "db error"}). Portfolio tables may not be provisioned here.` }; }
    if (!companies.length) return { observation: `No ${status === "all" ? "" : status + " "}companies in fund "${fundId}".` };

    const withKpi = await Promise.all(companies.map(async (c) => ({ c, k: await getLatestKpi(c.id).catch(() => null) })));
    const sum = (f: (x: { c: any; k: any }) => number | null | undefined) => withKpi.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const totalArr = sum((x) => x.k?.arr);
    const totalRev = sum((x) => x.k?.monthly_revenue);
    const totalBurn = sum((x) => x.k?.monthly_burn);
    const totalCash = sum((x) => x.k?.cash_balance);
    const totalHead = sum((x) => x.k?.headcount);
    const totalCustomers = sum((x) => x.k?.customers);
    const atCost = sum((x) => x.c?.total_invested_amount);
    // Revenue-weighted blended gross margin; fund-level runway from aggregate cash / burn.
    const gmWeighted = withKpi.reduce((s, x) => s + (Number(x.k?.gross_margin_pct) || 0) * (Number(x.k?.monthly_revenue) || 0), 0);
    const blendedGm = totalRev > 0 ? gmWeighted / totalRev : 0;
    const blendedRunway = totalBurn > 0 ? totalCash / totalBurn : null;
    const withKpiCount = withKpi.filter((x) => x.k).length;

    const rows: (string | number)[][] = withKpi.map(({ c, k }) => [
      c.name, c.sector ?? "", c.stage ?? "", c.status,
      k?.month_end ?? "—", round2(Number(k?.arr) || 0), round2(Number(k?.monthly_revenue) || 0),
      round2(Number(k?.monthly_burn) || 0), k?.runway_months != null ? Number(k.runway_months) : "—",
      Number(k?.headcount) || 0, round2(Number(c.total_invested_amount) || 0),
    ]);
    const aoa: (string | number)[][] = [
      ["ANKER · Portfolio KPI roll-up"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["Fund", fundId], ["Companies", companies.length], ["With a KPI snapshot", withKpiCount], [],
      ["Company", "Sector", "Stage", "Status", "KPI month", "ARR", "MRR", "Net burn", "Runway (mo)", "Headcount", "Invested (cost)"],
      ...rows,
      [],
      ["TOTALS", "", "", "", "", round2(totalArr), round2(totalRev), round2(totalBurn), blendedRunway != null ? round2(blendedRunway) : "—", totalHead, round2(atCost)],
      ["Blended gross margin", `${(blendedGm * 100).toFixed(1)}%`],
      ["Total cash on hand", round2(totalCash)],
      ["Total customers", totalCustomers],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 10 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "KPI roll-up");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, `Portfolio_KPI_${fundId}`, "xlsx");
    return {
      observation: `Portfolio roll-up for "${fundId}" (${companies.length} ${status} companies, ${withKpiCount} with KPIs): ARR ${money(totalArr)}, MRR ${money(totalRev)}, net burn ${money(totalBurn)}/mo, cash ${money(totalCash)}, blended runway ${blendedRunway != null ? blendedRunway.toFixed(1) + " mo" : "n/a"}, ${totalHead} FTEs, ${money(atCost)} at cost. Workbook → ${artifact.url}`,
      artifact,
    };
  },
};

const lp_capital_account: ToolDef = {
  name: "lp_capital_account",
  description:
    "Explain an LP's capital account in a fund: commitment, called (paid-in), distributed, remaining unfunded, paid-in %, and DPI — computed deterministically from fund_lps. Pass an lpName for one LP's statement, or omit it for a fund-wide roster. Read-only; every figure is engine-computed (LP-facing, so no figure is invented). Returns a statement workbook.",
  params: `{ "fundId": string (funds.id or slug, e.g. "svs-fund-ii"), "lpName"?: string }`,
  async run(inp): Promise<ToolResult> {
    const fundRef = String(inp.fundId ?? "").trim();
    if (!fundRef) return { observation: "Provide 'fundId' (a fund id or slug)." };
    let fund: { id: string; name: string; currency: string } | null = null;
    try {
      const fr = await sql`SELECT id, name, coalesce(currency,'USD') AS currency FROM funds WHERE id = ${fundRef} OR slug = ${fundRef} LIMIT 1` as any[];
      fund = fr[0] ?? null;
    } catch (e: any) { return { observation: `Could not read funds (${e?.message ?? "db error"}). Fund tables may not be provisioned here.` }; }
    if (!fund) return { observation: `No fund found for "${fundRef}" (tried id and slug).` };

    const lpName = inp.lpName ? String(inp.lpName).trim() : "";
    let lps: any[];
    try {
      lps = lpName
        ? await sql`SELECT lp_name, lp_type, commitment_amount, called_amount, distributed_amount, ownership_pct, status
                    FROM fund_lps WHERE fund_id = ${fund.id} AND lp_name ILIKE ${`%${lpName}%`} ORDER BY commitment_amount DESC NULLS LAST` as any[]
        : await sql`SELECT lp_name, lp_type, commitment_amount, called_amount, distributed_amount, ownership_pct, status
                    FROM fund_lps WHERE fund_id = ${fund.id} ORDER BY commitment_amount DESC NULLS LAST` as any[];
    } catch (e: any) { return { observation: `Could not read fund_lps (${e?.message ?? "db error"}).` }; }
    if (!lps.length) return { observation: lpName ? `No LP matching "${lpName}" in ${fund.name}.` : `No LPs recorded for ${fund.name}.` };

    const acct = lps.map((l) => {
      const commitment = Number(l.commitment_amount) || 0;
      const called = Number(l.called_amount) || 0;
      const distributed = Number(l.distributed_amount) || 0;
      const unfunded = round2(commitment - called);
      const paidInPct = commitment > 0 ? called / commitment : 0;
      const dpi = called > 0 ? distributed / called : 0;
      return { name: l.lp_name, type: l.lp_type ?? "", commitment, called, distributed, unfunded, paidInPct, dpi, ownership: Number(l.ownership_pct) || 0, status: l.status ?? "" };
    });

    const aoa: (string | number)[][] = [
      [`ANKER · Capital account — ${fund.name}`], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["LP", "Type", "Commitment", "Called (paid-in)", "Distributed", "Unfunded", "Paid-in %", "DPI", "Ownership %", "Status"],
      ...acct.map((a) => [a.name, a.type, round2(a.commitment), round2(a.called), round2(a.distributed), a.unfunded, `${(a.paidInPct * 100).toFixed(1)}%`, `${a.dpi.toFixed(2)}×`, `${(a.ownership * 100).toFixed(2)}%`, a.status]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 15 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Capital account");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, `Capital_Account_${fund.name}`, "xlsx");

    const explain = acct.length === 1
      ? (() => { const a = acct[0]; return `${a.name} committed ${money(a.commitment)} to ${fund.name}. To date ${money(a.called)} has been called (${(a.paidInPct * 100).toFixed(1)}% paid in), leaving ${money(a.unfunded)} unfunded. Distributions received: ${money(a.distributed)} (DPI ${a.dpi.toFixed(2)}×). Ownership ${(a.ownership * 100).toFixed(2)}%.`; })()
      : `${acct.length} LPs in ${fund.name}: total commitment ${money(acct.reduce((s, a) => s + a.commitment, 0))}, called ${money(acct.reduce((s, a) => s + a.called, 0))}, distributed ${money(acct.reduce((s, a) => s + a.distributed, 0))}.`;
    return { observation: `${explain} Statement → ${artifact.url}`, artifact };
  },
};

const simulate_fund_returns: ToolDef = {
  name: "simulate_fund_returns",
  description:
    "Monte-Carlo simulation of fund returns. Treats the blended exit multiple on deployed capital as uncertain (lognormal — the heavy-tailed shape of venture outcomes) and runs N trials to produce a full distribution of TVPI / MOIC / projected value: percentiles (P5..P95), mean, and the probability of returning capital (>=1x), a home run (>=3x), and a loss (<1x). Deterministic engine (lib/portfolio/monte-carlo) — seeded + reproducible. Returns a workbook.",
  params: `{ "navFV": number, "called": number, "distributed": number, "invested": number, "deployable": number($ about to be deployed), "reservePct"?: number(=30), "medianMultiple": number(median exit multiple on deployed capital), "sigma"?: number(=0.6, lognormal vol), "trials"?: number(=10000), "seed"?: number(=1) }`,
  async run(inp): Promise<ToolResult> {
    const num = (v: any) => Number(v) || 0;
    if (!Number.isFinite(Number(inp.medianMultiple)) || Number(inp.medianMultiple) <= 0) return { observation: "Provide a positive 'medianMultiple' (median exit multiple on deployed capital)." };
    const r = runMonteCarlo({
      navFV: num(inp.navFV), called: num(inp.called), distributed: num(inp.distributed), invested: num(inp.invested),
      deployable: num(inp.deployable), reservePct: numOr(inp.reservePct, 30),
      medianMultiple: Number(inp.medianMultiple), sigma: numOr(inp.sigma, 0.6),
      trials: numOr(inp.trials, 10000), seed: numOr(inp.seed, 1),
    });
    const pctRow = (label: string, d: typeof r.tvpi, fmt: (n: number) => string) =>
      [label, fmt(d.p5), fmt(d.p10), fmt(d.p25), fmt(d.p50), fmt(d.p75), fmt(d.p90), fmt(d.p95), fmt(d.mean)];
    const x = (n: number) => `${n.toFixed(2)}×`;
    const aoa: (string | number)[][] = [
      ["ANKER · Fund-returns Monte-Carlo"], ["an-ker.de", new Date().toISOString().slice(0, 10)], [],
      ["Trials", r.trials], ["Seed (reproducible)", r.seed], ["Median multiple", x(r.medianMultiple)], ["Sigma (lognormal vol)", r.sigma], [],
      ["Metric", "P5", "P10", "P25", "P50", "P75", "P90", "P95", "Mean"],
      pctRow("TVPI", r.tvpi, x),
      pctRow("MOIC", r.moic, x),
      pctRow("Projected value", r.value, (n) => money(n)),
      [],
      ["Probability of returning capital (>=1x)", `${Math.round(r.probReturnCapital * 100)}%`],
      ["Probability of a home run (>=3x)", `${Math.round(r.probHomeRun * 100)}%`],
      ["Probability of a loss (<1x)", `${Math.round(r.probLoss * 100)}%`],
      [], ["Note", "Blended exit multiple drawn from a lognormal (median above, sigma vol). Directional planning only — not a forecast of returns. Every figure engine-computed."],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 40 }, ...Array(8).fill({ wch: 12 })];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Simulation");
    // TVPI histogram on a second sheet.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["TVPI from", "TVPI to", "Trials"], ...r.histogram.map((h) => [h.from, h.to, h.count])]), "TVPI histogram");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const artifact = await saveArtifact(buf, "Fund_Returns_MonteCarlo", "xlsx");
    return {
      observation: `Monte-Carlo (${r.trials.toLocaleString()} trials, median ${x(r.medianMultiple)}, σ ${r.sigma}): TVPI P10 ${x(r.tvpi.p10)} · P50 ${x(r.tvpi.p50)} · P90 ${x(r.tvpi.p90)} (mean ${x(r.tvpi.mean)}). P(≥1×) ${Math.round(r.probReturnCapital * 100)}%, P(≥3×) ${Math.round(r.probHomeRun * 100)}%, P(loss) ${Math.round(r.probLoss * 100)}%. Workbook → ${artifact.url}`,
      artifact,
    };
  },
};

export const MODELING_TOOLS: Record<string, ToolDef> = {
  model_vesting, model_409a, model_waterfall, draft_capital_call, ic_memo,
  portfolio_kpi_rollup, lp_capital_account, simulate_fund_returns,
};
