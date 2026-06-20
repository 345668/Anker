import { renderArticleHtml } from "../../lib/newsroom/markdown";
import pg from "pg";

const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
const r = await cli.query(`select content from news_articles where length(content) > 1000 order by published_at desc nulls last limit 1`);
const md = r.rows[0].content;
console.log("=== raw (first 600 chars) ===");
console.log(md.slice(0, 600));
console.log("");
console.log("=== rendered HTML (first 1800 chars) ===");
const html = renderArticleHtml(md);
console.log(html.slice(0, 1800));
console.log("");
const tagCounts = {};
for (const m of html.matchAll(/<(h2|h3|h4|p|ul|ol|li|blockquote|strong|em|a)[\s>]/g)) {
  tagCounts[m[1]] = (tagCounts[m[1]] || 0) + 1;
}
console.log("\n=== tag distribution ===");
for (const [t, n] of Object.entries(tagCounts).sort((a,b) => b[1]-a[1])) console.log(`  <${t}> x${n}`);
await cli.end();
