/** An end-to-end check of the worker with no model: queue the smoke recipe, wait, fetch the picture, check it is a PNG of the right size. docs/architecture/49 section 7 (P0). */
import { randomUUID } from "node:crypto"
import { comfyJob, comfySubmit, comfyView, type ComfyConfig } from "./client"
import { fill, recipeFor } from "./recipes"
export interface SmokeResult {
  ok: boolean
  ms: number
  detail: string
}
export async function runSmoke(
  cfg: ComfyConfig,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<SmokeResult> {
  const t0 = Date.now(),
    r = recipeFor("smoke.card")!,
    id = randomUUID()
  const done = (ok: boolean, detail: string) => ({ ok, ms: Date.now() - t0, detail })
  try {
    await comfySubmit(cfg, fill(r, { ratio: "16:9", seed: Math.floor(Math.random() * 16000000) }), id)
    for (;;) {
      const j = await comfyJob(cfg, id, r.output.node, r.output.key)
      if (j.state === "failed" || j.state === "canceled" || j.state === "missing")
        return done(false, `job ${j.state}`)
      if (j.state === "completed") {
        if (!j.files.length) return done(false, "no output file")
        const png = await comfyView(cfg, j.files[0])
        const ok =
          png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
          png.readUInt32BE(16) === 512 &&
          png.readUInt32BE(20) === 288
        return done(ok, ok ? `512x288 PNG, ${png.length} bytes` : "output is not the expected PNG")
      }
      if (Date.now() - t0 > (opts.timeoutMs ?? 60000)) return done(false, "timed out")
      await new Promise((res) => setTimeout(res, opts.pollMs ?? 500))
    }
  } catch (e) {
    return done(false, e instanceof Error ? e.message : "error")
  }
}
