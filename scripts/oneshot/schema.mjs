import pg from "pg";
const { Client } = pg;
async function inspect(label, dsn) {
  if (!dsn) { console.log(`\n=== ${label}: NO DSN ===`); return; }
  const cli = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
  try {
    await cli.connect();
    console.log(`\n=== ${label}: CONNECTED ===`);
    for (const t of ["investment_firms", "investors"]) {
      const r = await cli.query(
        `select column_name, data_type, is_nullable from information_schema.columns
         where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
      console.log(`\n  ${t} (${r.rowCount} cols):`);
      for (const row of r.rows) console.log(`    - ${row.column_name}: ${row.data_type}${row.is_nullable==='NO'?' NOT NULL':''}`);
      const c = await cli.query(`select count(*)::int as n from ${t}`);
      console.log(`  rows: ${c.rows[0].n}`);
    }
    const ix = await cli.query(`
      select tablename, indexname, indexdef from pg_indexes
      where schemaname='public' and tablename in ('investment_firms','investors')
      order by tablename, indexname`);
    console.log("\n  indexes:");
    for (const row of ix.rows) console.log(`    [${row.tablename}] ${row.indexname}: ${row.indexdef}`);
  } catch (e) {
    console.log(`\n=== ${label}: FAILED — ${e.message} ===`);
  } finally {
    try { await cli.end(); } catch {}
  }
}
await inspect("NEON", process.env.NEON_DSN);
await inspect("LOCAL", process.env.LOCAL_DSN);
