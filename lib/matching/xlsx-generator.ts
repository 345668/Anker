/**
 * XLSX Generator for LP Pipeline Spreadsheets
 * 
 * Produces formatted multi-sheet Excel workbooks from LP matching results.
 */

import * as XLSX from "xlsx";
import type { ScoredFirm, ScoredContact, LpMatchingResult } from "./lp-matchmaking";

// ─── Column Definitions ──────────────────────────────────────────────────────
const FIRM_COLUMNS = [
  { header: "#", key: "idx", width: 5 },
  { header: "Score", key: "score", width: 8 },
  { header: "Firm Name", key: "name", width: 32 },
  { header: "LP Type", key: "type", width: 18 },
  { header: "Tags", key: "tags", width: 18 },
  { header: "Location", key: "location", width: 28 },
  { header: "AUM", key: "aum", width: 22 },
  { header: "Sectors", key: "sectors", width: 35 },
  { header: "Why This LP", key: "reasons", width: 50 },
  { header: "Website", key: "website", width: 30 },
  { header: "LinkedIn", key: "linkedin", width: 35 },
  { header: "Status", key: "status", width: 14 },
  { header: "Notes", key: "notes", width: 20 },
];

const CONTACT_COLUMNS = [
  { header: "#", key: "idx", width: 5 },
  { header: "Score", key: "score", width: 8 },
  { header: "Name", key: "name", width: 26 },
  { header: "Title/Role", key: "title", width: 30 },
  { header: "LP Type", key: "type", width: 18 },
  { header: "Tags", key: "tags", width: 18 },
  { header: "Location", key: "location", width: 28 },
  { header: "Email", key: "email", width: 30 },
  { header: "LinkedIn", key: "linkedin", width: 35 },
  { header: "Sectors", key: "sectors", width: 30 },
  { header: "Why This Contact", key: "reasons", width: 45 },
  { header: "Status", key: "status", width: 14 },
  { header: "Notes", key: "notes", width: 20 },
];

// ─── Helper: Create a worksheet from rows ────────────────────────────────────
function createFirmSheet(
  firms: ScoredFirm[],
  title: string,
  subtitle?: string,
): XLSX.WorkSheet {
  const data: any[][] = [];
  
  // Title rows
  data.push([title]);
  data.push([subtitle ?? `${firms.length} qualified firms`]);
  data.push([]); // blank row
  
  // Header row
  data.push(FIRM_COLUMNS.map(c => c.header));
  
  // Data rows
  firms.forEach((firm, idx) => {
    data.push([
      idx + 1,
      firm.score,
      firm.name,
      firm.type,
      firm.tags.join(", "),
      firm.location,
      firm.aum,
      firm.sectors,
      firm.reasons.join("; "),
      firm.website,
      firm.linkedin,
      "", // status
      "", // notes
    ]);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Set column widths
  ws["!cols"] = FIRM_COLUMNS.map(c => ({ wch: c.width }));
  
  // Merge title row
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
  ];
  
  return ws;
}

function createContactSheet(
  contacts: ScoredContact[],
  title: string,
  subtitle?: string,
): XLSX.WorkSheet {
  const data: any[][] = [];
  
  data.push([title]);
  data.push([subtitle ?? `${contacts.length} qualified contacts`]);
  data.push([]);
  data.push(CONTACT_COLUMNS.map(c => c.header));
  
  contacts.forEach((contact, idx) => {
    data.push([
      idx + 1,
      contact.score,
      contact.name,
      contact.title,
      contact.type,
      contact.tags.join(", "),
      contact.location,
      contact.email,
      contact.linkedin,
      contact.sectors,
      contact.reasons.join("; "),
      "",
      "",
    ]);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = CONTACT_COLUMNS.map(c => ({ wch: c.width }));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
  ];
  
  return ws;
}

// ─── Main Export Function ────────────────────────────────────────────────────
export function generateLpPipelineXlsx(result: LpMatchingResult): Buffer {
  const wb = XLSX.utils.book_new();
  
  // ─── Sheet 1: Executive Summary ────────────────────────────────────────
  const summaryData: any[][] = [
    [`${result.fundName} — LP Prospect Pipeline`],
    [`Generated: ${new Date().toISOString().split("T")[0]}`],
    [],
    ["PIPELINE SUMMARY", ""],
    ["Total firms scored", result.totalFirmsScored],
    ["Qualified LP firms", result.qualifiedFirms],
    ["Total individuals scored", result.totalContactsScored],
    ["Qualified LP contacts", result.qualifiedContacts],
    ["Contacts with email", result.contactsWithEmail],
    ["Anchor candidates ($500M+ AUM)", result.anchorCandidates],
    [],
    ["FIRM TIER BREAKDOWN", ""],
    ["Champion (80+)", result.tierCounts.firms.champion ?? 0],
    ["Priority A (60-79)", result.tierCounts.firms.A ?? 0],
    ["Priority B (40-59)", result.tierCounts.firms.B ?? 0],
    ["Prospect C (20-39)", result.tierCounts.firms.C ?? 0],
    [],
    ["CONTACT TIER BREAKDOWN", ""],
    ["Champion (80+)", result.tierCounts.contacts.champion ?? 0],
    ["Priority A (60-79)", result.tierCounts.contacts.A ?? 0],
    ["Priority B (40-59)", result.tierCounts.contacts.B ?? 0],
    ["Prospect C (20-39)", result.tierCounts.contacts.C ?? 0],
    [],
    ["SEGMENT HIGHLIGHTS", ""],
    ["Local LPs", result.firms.filter(f => f.tags.includes("LOCAL")).length],
    ["Regional LPs", result.firms.filter(f => f.tags.includes("REGIONAL")).length],
    ["Emerging manager programs", result.firms.filter(f => f.tags.includes("EM")).length],
    ["University/research focus", result.firms.filter(f => f.tags.includes("UNI")).length],
    ["Family office firms", result.firms.filter(f => f.tags.includes("FO")).length],
    ["Fund of funds", result.firms.filter(f => f.tags.includes("FoF")).length],
    [],
    ["Scoring duration (ms)", result.durationMs],
  ];
  
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs["!cols"] = [{ wch: 45 }, { wch: 20 }];
  summaryWs["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Executive Summary");
  
  // ─── Sheet 2: Priority LP Firms ────────────────────────────────────────
  const localFirms = result.firms.filter(f => f.tags.includes("LOCAL"));
  const emFirms = result.firms.filter(f => f.tags.includes("EM") && !f.tags.includes("LOCAL"));
  const uniFirms = result.firms.filter(f => f.tags.includes("UNI") && !f.tags.includes("LOCAL") && !f.tags.includes("EM"));
  const anchorFirms = result.firms.filter(f => f.tags.includes("ANCHOR") && !f.tags.includes("LOCAL") && !f.tags.includes("EM") && !f.tags.includes("UNI")).slice(0, 200);
  const otherFirms = result.firms.filter(f => !f.tags.includes("LOCAL") && !f.tags.includes("EM") && !f.tags.includes("UNI") && !f.tags.includes("ANCHOR")).slice(0, 100);
  
  const allSegmentedFirms = [
    ...localFirms, ...emFirms, ...uniFirms, ...anchorFirms, ...otherFirms,
  ];
  
  const firmWs = createFirmSheet(
    allSegmentedFirms,
    `${result.fundName} — Priority LP Firms`,
    `${result.qualifiedFirms} qualified | Local: ${localFirms.length} | Anchors: ${result.anchorCandidates} | EM: ${emFirms.length} | University: ${uniFirms.length}`,
  );
  XLSX.utils.book_append_sheet(wb, firmWs, "Priority LP Firms");
  
  // ─── Sheet 3: Priority LP Contacts ─────────────────────────────────────
  const emailContacts = result.contacts.filter(c => c.email);
  const noEmailContacts = result.contacts.filter(c => !c.email).slice(0, 200);
  const allContacts = [...emailContacts, ...noEmailContacts];
  
  const contactWs = createContactSheet(
    allContacts,
    `${result.fundName} — LP Contacts`,
    `${result.qualifiedContacts} qualified | ${result.contactsWithEmail} with email`,
  );
  XLSX.utils.book_append_sheet(wb, contactWs, "Priority LP Contacts");
  
  // ─── Sheet 4: International LPs ────────────────────────────────────────
  const intlTags = ["DACH", "GULF", "INDIA", "IT", "CAN", "UK"];
  const intlFirms = result.firms.filter(f => f.tags.some(t => intlTags.includes(t)));
  
  const intlWs = createFirmSheet(
    intlFirms.slice(0, 500),
    `${result.fundName} — International LP Prospects`,
    `${intlFirms.length} international firms`,
  );
  XLSX.utils.book_append_sheet(wb, intlWs, "International LPs");
  
  // ─── Sheet 5: Ready to Contact ─────────────────────────────────────────
  const readyWs = createContactSheet(
    emailContacts.slice(0, 500),
    `Contacts with Email — Ready for Outreach`,
    `${emailContacts.length} contacts with verified email addresses`,
  );
  XLSX.utils.book_append_sheet(wb, readyWs, "Ready to Contact");
  
  // Write to buffer
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuffer);
}

/**
 * Generate a simple CSV export of firms or contacts.
 */
export function generateLpFirmsCsv(firms: ScoredFirm[]): string {
  const headers = FIRM_COLUMNS.map(c => c.header).join(",");
  const rows = firms.map((f, i) => [
    i + 1, f.score, `"${f.name}"`, `"${f.type}"`, `"${f.tags.join("; ")}"`,
    `"${f.location}"`, `"${f.aum}"`, `"${f.sectors}"`, `"${f.reasons.join("; ")}"`,
    `"${f.website}"`, `"${f.linkedin}"`, "", "",
  ].join(","));
  return [headers, ...rows].join("\n");
}

export function generateLpContactsCsv(contacts: ScoredContact[]): string {
  const headers = CONTACT_COLUMNS.map(c => c.header).join(",");
  const rows = contacts.map((c, i) => [
    i + 1, c.score, `"${c.name}"`, `"${c.title}"`, `"${c.type}"`, `"${c.tags.join("; ")}"`,
    `"${c.location}"`, `"${c.email}"`, `"${c.linkedin}"`, `"${c.sectors}"`,
    `"${c.reasons.join("; ")}"`, "", "",
  ].join(","));
  return [headers, ...rows].join("\n");
}
