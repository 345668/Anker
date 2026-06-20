import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
// 1) Does the public.users table exist? What columns?
const t = await cli.query(`
  select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='users'
  order by ordinal_position
`);
console.log(`public.users columns (${t.rowCount}):`);
for (const r of t.rows) console.log(`  - ${r.column_name}  ${r.data_type}`);
console.log("");

// 2) Anyone flagged is_admin?
if (t.rows.some(r => r.column_name === "is_admin")) {
  const r = await cli.query(`select id, email, is_admin from users where is_admin = true limit 20`);
  console.log(`users with is_admin=true: ${r.rowCount}`);
  for (const u of r.rows) console.log(`  ${u.email}  (${u.id})`);
} else {
  console.log("(public.users has NO is_admin column — the DB-based admin check is broken regardless of sidebar)");
}
console.log("");

// 3) auth.users sample - what user_metadata.role values exist?
const m = await cli.query(`
  select email, raw_user_meta_data->>'role' as meta_role
  from auth.users
  where raw_user_meta_data is not null
  limit 20
`);
console.log(`auth.users sample (${m.rowCount}): emails + meta.role`);
for (const u of m.rows) console.log(`  ${u.email}  meta.role=${u.meta_role ?? "(none)"}`);
await cli.end();
