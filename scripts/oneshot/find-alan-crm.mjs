import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();

const cols = await cli.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'crm_entries'
  ORDER BY ordinal_position
`);
console.log("crm_entries columns:");
console.log("  " + cols.rows.map(r => r.column_name).join(", "));
console.log("");

// Search anywhere reasonable for 'kirschenbaum'
const r = await cli.query(`
  SELECT display_name, display_email, display_linkedin,
         display_title, display_company, display_firm, display_location, source, updated_at
  FROM crm_entries
  WHERE LOWER(COALESCE(display_name, '')) LIKE '%kirschenbaum%'
     OR LOWER(COALESCE(display_email, '')) LIKE '%kirschenbaum%'
     OR LOWER(COALESCE(display_linkedin, '')) LIKE '%kirschenbaum%'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 10
`).catch(async (e) => {
  // Some of those display_* cols may not exist; fall back to display_name/email/linkedin only.
  console.log("(some display_* columns missing — retrying with minimal set)");
  return await cli.query(`
    SELECT display_name, display_email, display_linkedin, source, updated_at
    FROM crm_entries
    WHERE LOWER(COALESCE(display_name, '')) LIKE '%kirschenbaum%'
       OR LOWER(COALESCE(display_email, '')) LIKE '%kirschenbaum%'
       OR LOWER(COALESCE(display_linkedin, '')) LIKE '%kirschenbaum%'
    LIMIT 10
  `);
});
console.log("=== kirschenbaum matches in crm_entries ===");
if (!r.rows.length) console.log("  (no rows)");
for (const x of r.rows) {
  console.log("  " + JSON.stringify(x, null, 2).split("\n").join("\n  "));
}

// Also: any contact whose firm/company contains 'alvarez' or 'marsal'
const rFirm = await cli.query(`
  SELECT display_name, display_email, display_linkedin, source
  FROM crm_entries
  WHERE LOWER(COALESCE(display_name, '') || ' ' || COALESCE(display_email, '')) ~ 'alvarez|marsal'
  LIMIT 20
`).catch(() => ({ rows: [] }));
console.log("\n=== crm_entries rows whose name or email contains 'alvarez' or 'marsal' ===");
if (!rFirm.rows.length) console.log("  (no rows)");
for (const x of rFirm.rows) console.log("  " + x.display_name + " | " + (x.display_email ?? ""));

await cli.end();
