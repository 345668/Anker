import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
const r = await cli.query(`
  select i.first_name, i.last_name, i.email, i.title, i.source, f.name as firm,
         i.metadata
  from investors i left join investment_firms f on f.id = i.firm_id
  where i.metadata ? 'svs_fund2_fo_webinar_invite'
  order by (i.metadata->'svs_fund2_fo_webinar_invite'->>'score')::int desc nulls last
  limit 3`);
for (const row of r.rows) {
  console.log("---");
  console.log("  name:", row.first_name, row.last_name);
  console.log("  firm:", row.firm);
  console.log("  email:", row.email || "(none)");
  console.log("  title:", row.title || "(none)");
  console.log("  source:", row.source);
  console.log("  metadata.svs:", JSON.stringify(row.metadata.svs_fund2_fo_webinar_invite));
}
await cli.end();
