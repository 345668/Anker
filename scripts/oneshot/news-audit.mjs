import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
const r = await cli.query(`
  select status, count(*)::int n
  from news_articles
  group by status
  order by n desc
`);
console.log("status counts:"); for (const x of r.rows) console.log(`  ${x.status}: ${x.n}`);
const recent = await cli.query(`
  select id, status, blog_type, headline, published_at, scheduled_for, created_at, length(content) as content_len
  from news_articles
  order by created_at desc nulls last
  limit 6
`);
console.log("\nmost recent 6:");
for (const r of recent.rows) console.log(`  [${r.status}] ${r.blog_type}: ${(r.headline || "").slice(0, 60)}  (content ${r.content_len} chars, created ${r.created_at?.toISOString().slice(0,10)})`);
await cli.end();
