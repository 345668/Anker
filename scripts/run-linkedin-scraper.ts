import { fetchLinkedInPublic } from "@/lib/agents/linkedin-public"

const url = process.argv[2] || "https://www.linkedin.com/in/reidhoffman/"

;(async () => {
  console.log(`[scraper] fetching ${url}`)
  const t0 = Date.now()
  const snap = await fetchLinkedInPublic(url)
  const ms = Date.now() - t0
  console.log(`[scraper] done in ${ms}ms`)
  console.log(JSON.stringify(snap, null, 2))
})().catch((e) => { console.error("FAIL", e); process.exit(1) })
