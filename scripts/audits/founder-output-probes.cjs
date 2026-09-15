/** Read-only audit probes. Synthetic data only; no credentials, live DB or AI calls.
 * Run from the repo root: node scripts/audits/founder-output-probes.cjs
 * These record current behavior; they are not passing regression assertions.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const XLSX = require('xlsx');
const { PGlite } = require('@electric-sql/pglite');
const { NextRequest } = require('next/server');
const { buildFounderWorkbook, workbookToBuffer } = require('../../lib/matching/v2/founder-xlsx.ts');
const { POST } = require('../../app/api/tools/[slug]/export/route.ts');
const { parseShortlist } = require('../../lib/crm/shortlist.ts');
const { generateLpContactsCsv } = require('../../lib/matching/xlsx-generator.ts');

async function main() {
  const contact = { id: 'synthetic-contact', kind: 'person', name: 'Synthetic Müller', title: 'Partner',
    type: 'VC', location: 'Berlin', sectors: ['climate'], score: 80, tier: 'A', tags: [],
    segments: ['sector_match'], whyMatch: 'Synthetic match', email: 'sample@example.test', emailVerified: true };
  const firm = { ...contact, id: 'synthetic-firm', kind: 'firm', name: 'Synthetic Ventures', segments: ['lead'], tags: ['LEAD'] };
  const startup = { name: 'Synthetic Company', stage: 'seed', location: 'Berlin', sectors: ['climate'], askAmount: 2000000 };
  const result = { startupName: startup.name, ranAt: '2026-09-11T00:00:00Z', firms: [firm], contacts: [contact],
    totals: { rawFirms: 1, rawContacts: 1, qualifiedFirms: 1, qualifiedContacts: 1, contactsWithEmail: 1, leadCandidates: 1, duplicatesMerged: 0 },
    tierCounts: { firms: {}, contacts: {} }, segmentCounts: { firms: {}, contacts: {} }, funnel: { firms: [], contacts: [] } };
  const bytes = workbookToBuffer(buildFounderWorkbook(result, startup));
  const wb = XLSX.read(bytes, { type: 'buffer' });
  const zip = XLSX.CFB.read(bytes, { type: 'buffer' });
  const xml = zip.FileIndex.filter(e => /sheet\d+\.xml$/.test(e.name)).map(e => Buffer.from(e.content).toString());
  if (xml.length !== wb.SheetNames.length) throw new Error('Could not inspect every worksheet XML file');
  const rows = wb.SheetNames.flatMap(sheet => XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true }).map(row => ({ sheet, row })));
  const occurrences = rows.filter(({ row }) => row.includes('contact:synthetic-contact'));
  // Simulate unchecking the main contact sheet; the secondary sheet remains true.
  occurrences.find(x => x.sheet === 'Investor Contacts').row[0] = false;
  const selection = wb.Sheets['Import Selection'];
  if (selection) {
    const selectionRows = XLSX.utils.sheet_to_json(selection, { header: 1, raw: true });
    const rowIndex = selectionRows.findIndex(row => row.includes('contact:synthetic-contact'));
    selection[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })] = { t: 'b', v: false };
  }
  const output = {
    founderWorkbook: { sheets: wb.SheetNames, worksheetXmlFilesInspected: xml.length, zipReadable: true, worksheetXmlHasFrozenPane: xml.some(x => /<pane\b/.test(x)),
      contactCopies: occurrences.map(({ sheet, row }) => ({ sheet, contactSelected: row[0] })),
      stillImportableAfterUncheckingSelectionSheet: parseShortlist(wb).rows.some(row => row.key === 'contact:synthetic-contact' && row.selected) },
  };
  const input = { startingCustomers: 10, startingMrr: 1000, newCustomersM1: 2, newCustomersM60: 3,
    arpaMonthly: 100, monthlyChurn: 0.02, monthlyExpansion: 0.01, grossMargin: 0.8, monthsHorizon: 3 };
  const response = await POST(new NextRequest('https://audit.invalid/api/tools/saas-forecast/export', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), { params: Promise.resolve({ slug: 'saas-forecast' }) });
  const tool = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  output.saasExport = { statusWithoutSession: response.status, cacheControl: response.headers.get('Cache-Control'),
    startingMrrCell: tool.Sheets.Inputs.B6, formulaCount: Object.values(tool.Sheets).reduce((n, sheet) =>
      n + Object.entries(sheet).filter(([key, cell]) => !key.startsWith('!') && cell.f).length, 0) };
  const csv = generateLpContactsCsv([{ ...contact, name: 'Synthetic "Quoted" Name', reasons: ['Test'], tags: [] }]);
  output.adjacentLpCsv = { embeddedQuotesEscaped: csv.includes('"Synthetic ""Quoted"" Name"'), utf8Bom: csv.charCodeAt(0) === 0xfeff };
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync(path.join(root, 'scripts/migrations/2026-05-04-crm-entries.sql'), 'utf8'));
    for (let i = 0; i < 2; i++) await db.query(`INSERT INTO crm_entries (user_id,source,firm_id,investor_id,display_name)
      VALUES ('synthetic-user','founder_matching','synthetic-firm',NULL,'Synthetic Ventures')
      ON CONFLICT (user_id,source,firm_id,investor_id) DO NOTHING`);
    output.baselineCrmMigrationBeforeIntegrityFix = { sameFirmInsertedTwice: Number((await db.query('SELECT count(*) AS n FROM crm_entries')).rows[0].n) };
  } finally { await db.close(); }
  console.log(JSON.stringify(output, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
