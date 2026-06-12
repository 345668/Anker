import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
for (const t of ["investment_firms","investors"]) {
  const r = await cli.query(`select source, count(*)::int n
    from ${t}
    where source like '%fo_ai_webinar%' or source like '%svs_fund2_fo_webinar%' or source like '%fo-webinar%'
    group by source order by n desc`);
  console.log(`\n${t}:`);
  if (r.rowCount === 0) console.log("  (no rows with the new source tags yet)");
  else for (const row of r.rows) console.log(`  ${row.source}  ->  ${row.n}`);
}
const r2 = await cli.query(`
  select count(*)::int as n_with_svs_meta
  from investors
  where metadata ? 'svs_fund2_fo_webinar_invite' or metadata ? 'fo_ai_webinar_2026_06_18'`);
console.log(`\ninvestors with new metadata blobs: ${r2.rows[0].n_with_svs_meta}`);
await cli.end();
