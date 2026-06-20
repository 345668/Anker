import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();

console.log("=== Exact-ish match: first/last name + firm contains 'alvarez' ===");
const r1 = await cli.query(`
  SELECT i.id, i.first_name, i.last_name, i.email, i.phone, i.title,
         i.linkedin_url, i.location, i.source, i.created_at,
         f.name AS firm_name, f.website
  FROM investors i
  LEFT JOIN investment_firms f ON f.id = i.firm_id
  WHERE LOWER(i.first_name) LIKE '%alan%'
    AND LOWER(i.last_name) LIKE '%kirschenbaum%'
  ORDER BY i.updated_at DESC NULLS LAST
  LIMIT 10
`);
if (!r1.rows.length) console.log("  (no rows)");
for (const r of r1.rows) {
  console.log(`  #${r.id}  ${r.first_name} ${r.last_name}`);
  console.log(`    firm:     ${r.firm_name ?? "(no firm linked)"}`);
  console.log(`    email:    ${r.email ?? "(none on file)"}`);
  console.log(`    title:    ${r.title ?? ""}`);
  console.log(`    linkedin: ${r.linkedin_url ?? ""}`);
  console.log(`    location: ${r.location ?? ""}`);
  console.log(`    source:   ${r.source ?? ""}`);
  console.log("");
}

console.log("=== Fuzzy fallback: any row whose name contains 'kirschenbaum' ===");
const r2 = await cli.query(`
  SELECT i.first_name, i.last_name, i.email, i.title,
         f.name AS firm_name
  FROM investors i
  LEFT JOIN investment_firms f ON f.id = i.firm_id
  WHERE LOWER(i.first_name || ' ' || COALESCE(i.last_name,'')) LIKE '%kirschenbaum%'
     OR LOWER(COALESCE(i.email,'')) LIKE '%kirschenbaum%'
  LIMIT 5
`);
if (!r2.rows.length) console.log("  (no rows)");
for (const r of r2.rows) {
  console.log(`  ${r.first_name} ${r.last_name}  ${r.email ?? "(no email)"}  ${r.firm_name ?? ""}`);
}

console.log("\n=== Sanity: do we even have an Alvarez & Marsal firm record? ===");
const r3 = await cli.query(`
  SELECT id, name, website, type
  FROM investment_firms
  WHERE LOWER(name) LIKE '%alvarez%' OR LOWER(name) LIKE '%marsal%'
  LIMIT 5
`);
if (!r3.rows.length) console.log("  (no Alvarez & Marsal record in investment_firms)");
for (const r of r3.rows) console.log(`  ${r.name}  [${r.type ?? "no type"}]  ${r.website ?? ""}`);

await cli.end();
