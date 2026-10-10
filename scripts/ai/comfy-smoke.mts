// npx tsx scripts/ai/comfy-smoke.mts   (reads COMFY_BASE_URL and COMFY_API_KEY): checks the gateway and worker end to end with no model.
import { comfyConfig, comfyStats } from "@/lib/ai/studio/comfy/client"
import { runSmoke } from "@/lib/ai/studio/comfy/smoke"
const cfg = comfyConfig()
if (!cfg) { console.error("Set COMFY_BASE_URL (https, or http on localhost) and COMFY_API_KEY."); process.exit(1) }
const s = await comfyStats(cfg).catch((e) => ({ system: { error: String(e) } }))
console.log("worker:", JSON.stringify((s as any).system ?? s).slice(0, 200))
const r = await runSmoke(cfg)
console.log(r.ok ? "PASS" : "FAIL", `${r.ms} ms`, r.detail)
process.exit(r.ok ? 0 : 1)
