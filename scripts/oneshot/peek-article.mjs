import pg from "pg";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
const cols = await cli.query(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name='news_articles'
  order by ordinal_position
`);
console.log("news_articles columns:");
console.log("  " + cols.rows.map(r => r.column_name).join(", "));
console.log("");

const r = await cli.query(`
  select * from news_articles
  where content is not null and length(content) > 500
  order by published_at desc nulls last
  limit 1
`);
if (!r.rows.length) { console.log("(no rows)"); process.exit(0); }
const a = r.rows[0];
console.log(`Article: ${a.headline}`);
console.log(`  type:    ${a.blog_type}  author: ${a.author}`);
console.log(`  length:  ${(a.content || "").length} chars`);
console.log(``);
console.log(`--- raw content (first 2200 chars) ---`);
console.log((a.content || "").slice(0, 2200));
console.log(``);
console.log(`--- non-ASCII characters present (count) ---`);
const odd = {};
for (const ch of (a.content || "")) {
  const code = ch.charCodeAt(0);
  if (code > 127) odd[ch] = (odd[ch] || 0) + 1;
}
for (const [ch, n] of Object.entries(odd).sort((a,b) => b[1]-a[1]).slice(0, 30)) {
  console.log(`  ${JSON.stringify(ch)}  (U+${ch.charCodeAt(0).toString(16).padStart(4, "0")})  x${n}`);
}
await cli.end();
