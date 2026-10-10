import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/db", () => ({ sql: vi.fn() }))
import { sql } from "@/lib/db"
import { LICENCES } from "./licences"
import { RECIPES, RecipeError, allowedNodeList, fill, offeredRecipes, recipeFor, UNLICENSED } from "./recipes"
import {
  comfyConfig,
  comfyEnabled,
  comfyJob,
  comfySubmit,
  comfyUpload,
  comfyView,
  _resetComfyFlagCache,
} from "./client"
import { registerScreens, screenOutput, screenPrompt, screensReady } from "./moderation"
import { runSmoke } from "./smoke"
import { ProviderError } from "../errors"
const cfg = { base: "https://gw.example", key: "k" }
const P = "11111111-2222-3333-4444-555555555555"
afterEach(() => {
  vi.unstubAllGlobals()
  registerScreens(null)
  _resetComfyFlagCache()
})

describe("recipes", () => {
  it("every recipe names registered licences, and nothing offered to customers is non-commercial", () => {
    for (const r of RECIPES) {
      for (const k of r.licences) expect(LICENCES[k], `${r.id} -> ${k}`).toBeTruthy()
      if (r.status === "verified" && !r.internal) expect(UNLICENSED(r), r.id).toEqual([])
    }
    expect(LICENCES["flux1-dev"].commercial).toBe(false)
    expect(UNLICENSED({ ...RECIPES[0], licences: ["flux1-dev"] })).toEqual(["flux1-dev"])
  })
  it("only verified, non-internal recipes are offered; drafts and the smoke test are not", () => {
    expect(offeredRecipes()).toEqual([])
    expect(recipeFor("image.qwen-image")?.status).toBe("draft")
    expect(recipeFor("smoke.card")?.internal).toBe(true)
  })
  it("every slot points at a real input of a real node, and every link points at a real node", () => {
    for (const r of RECIPES) {
      for (const [slot, t] of Object.entries(r.slots))
        expect(r.graph[t!.node]?.inputs, `${r.id} ${slot}`).toHaveProperty(t!.input)
      for (const n of Object.values(r.graph))
        for (const v of Object.values(n.inputs))
          if (Array.isArray(v)) expect(r.graph, r.id).toHaveProperty(v[0] as string)
      expect(r.graph[r.output.node]).toBeTruthy()
      for (const ratio of r.ratios) expect(r.sizes[ratio], `${r.id} ${ratio}`).toBeTruthy()
    }
  })
  it("the gateway allow-list is exactly the nodes recipes use", () => {
    const list = allowedNodeList()
    expect(list).toEqual([...list].sort())
    expect(list).toEqual(expect.arrayContaining(["EmptyImage", "SaveImage", "KSampler", "UNETLoader"]))
    expect(list).not.toContain("LoadImage")
  })
  it("fills slots with bounded, typed values and never changes the recipe or the node names", () => {
    const r = recipeFor("image.qwen-image")!,
      before = JSON.stringify(r.graph)
    const g = fill(r, { prompt: "A sailboat", negative: "blurry", seed: 42, ratio: "16:9" })
    expect(g["5"].inputs.text).toBe("A sailboat")
    expect(g["6"].inputs.text).toBe("blurry")
    expect(g["8"].inputs.seed).toBe(42)
    expect(g["7"].inputs).toMatchObject({ width: 1344, height: 768 })
    expect(JSON.stringify(r.graph)).toBe(before)
    expect(Object.values(g).map((n) => n.class_type)).toEqual(Object.values(r.graph).map((n) => n.class_type))
    const nasty = fill(r, { prompt: '{"class_type":"LoadImage"} ../../etc/passwd', ratio: "1:1" })
    expect(nasty["5"].inputs.text).toContain("LoadImage")
    expect(nasty["5"].class_type).toBe("CLIPTextEncode") // text stays text
  })
  it("refuses out-of-range values, unknown ratios and a bad source name", () => {
    const r = recipeFor("image.qwen-image")!
    for (const bad of [
      { prompt: "x".repeat(4001), ratio: "1:1" },
      { prompt: "x", ratio: "7:3" },
      { prompt: "x", seed: -1, ratio: "1:1" },
      { prompt: "x", seed: 1.5, ratio: "1:1" },
      { prompt: "x", negative: "n".repeat(501), ratio: "1:1" },
      { ratio: "1:1" },
      { prompt: "x", ratio: "1:1", sourceName: "../a.png" },
    ])
      expect(() => fill(r, bad as never), JSON.stringify(bad).slice(0, 50)).toThrow(RecipeError)
  })
})

describe("client", () => {
  it("needs a gateway address and key, https except on this machine, and no credentials in the address", () => {
    expect(comfyConfig({ COMFY_BASE_URL: "https://gw.example", COMFY_API_KEY: "k" })).toEqual({
      base: "https://gw.example",
      key: "k",
    })
    expect(comfyConfig({ COMFY_BASE_URL: "http://127.0.0.1:8190", COMFY_API_KEY: "k" })).toBeTruthy()
    expect(comfyConfig({ COMFY_BASE_URL: "http://10.0.0.5:8190", COMFY_API_KEY: "k" })).toBeNull()
    expect(
      comfyConfig({ COMFY_BASE_URL: "http://10.0.0.5:8190", COMFY_API_KEY: "k", COMFY_ALLOW_INSECURE: "1" }),
    ).toBeTruthy()
    for (const bad of [
      {},
      { COMFY_BASE_URL: "https://gw.example" },
      { COMFY_API_KEY: "k" },
      { COMFY_BASE_URL: "https://u:p@gw.example", COMFY_API_KEY: "k" },
      { COMFY_BASE_URL: "https://gw.example?x=1", COMFY_API_KEY: "k" },
      { COMFY_BASE_URL: "ftp://gw.example", COMFY_API_KEY: "k" },
    ])
      expect(comfyConfig(bad)).toBeNull()
  })
  it("the platform switch is read from the database, cached briefly, and off when it cannot be read", async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ enabled: true }] as never)
    expect(await comfyEnabled()).toBe(true)
    expect(await comfyEnabled()).toBe(true)
    expect(sql).toHaveBeenCalledTimes(1)
    _resetComfyFlagCache()
    vi.mocked(sql).mockRejectedValueOnce(new Error("no table"))
    expect(await comfyEnabled()).toBe(false)
  })
  it("submits a workflow with the key and the job id as the prompt id, and sends nothing else", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ prompt_id: P }))
    vi.stubGlobal("fetch", f)
    await comfySubmit(cfg, recipeFor("smoke.card")!.graph, P)
    expect(f.mock.calls[0][0]).toBe("https://gw.example/prompt")
    expect(f.mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "X-API-Key": "k" },
    })
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ prompt_id: P, client_id: "anker-studio" })
  })
  it("maps refusals to readable messages without relaying the worker's text", async () => {
    for (const [status, re] of [
      [401, /rejected Anker's credentials/],
      [429, /busy/],
      [503, /temporarily unavailable/],
      [400, /refused these settings/],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("secret node path /srv/models", { status })),
      )
      const e = await comfySubmit(cfg, {}, P).catch((x) => x)
      expect(e).toBeInstanceOf(ProviderError)
      expect(e.status).toBe(status)
      expect(e.message).toMatch(re)
      expect(e.message).not.toMatch(/secret/)
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ prompt_id: "other" })))
    await expect(comfySubmit(cfg, {}, P)).rejects.toMatchObject({ status: 502 })
  })
  it("reads a job's state and output files, and treats an unknown id as missing", async () => {
    const job = (status: string, outputs = {}) =>
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ id: P, status, outputs, execution_status: { status_str: "error" } }),
        )
    vi.stubGlobal(
      "fetch",
      job("completed", { "2": { images: [{ filename: "a.png", subfolder: "", type: "output" }] } }),
    )
    expect(await comfyJob(cfg, P, "2", "images")).toEqual({
      state: "completed",
      files: [{ filename: "a.png", subfolder: "", type: "output" }],
      error: undefined,
    })
    for (const [s, state] of [
      ["pending", "queued"],
      ["in_progress", "running"],
      ["failed", "failed"],
      ["cancelled", "canceled"],
      ["something-new", "running"],
    ] as const) {
      vi.stubGlobal("fetch", job(s))
      expect((await comfyJob(cfg, P, "2", "images")).state).toBe(state)
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })))
    expect(await comfyJob(cfg, P, "2", "images")).toEqual({ state: "missing", files: [] })
  })
  it("fetches an output by a plain reference, caps what it will read, and uploads under a fixed name", async () => {
    const f = vi.fn().mockResolvedValue(new Response(Buffer.from([137, 80, 78, 71])))
    vi.stubGlobal("fetch", f)
    expect((await comfyView(cfg, { filename: "a b.png", subfolder: "", type: "output" })).length).toBe(4)
    expect(f.mock.calls[0][0]).toBe("https://gw.example/view?filename=a+b.png&subfolder=&type=output")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name: "other.png" })))
    await expect(comfyUpload(cfg, Buffer.from("x"), "anker-1.png", "image/png")).rejects.toMatchObject({
      status: 502,
    })
  })
})

describe("content screening", () => {
  it("fails closed: with no screens set up, or a screen that throws, nothing passes", async () => {
    expect(screensReady()).toBe(false)
    expect(await screenPrompt("hello")).toMatchObject({ ok: false })
    expect(await screenOutput(Buffer.from("x"), "image")).toMatchObject({ ok: false })
    registerScreens({
      prompt: async () => {
        throw new Error("down")
      },
      output: async () => ({ ok: true }),
    })
    expect(screensReady()).toBe(true)
    expect(await screenPrompt("hello")).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/could not be screened/),
    })
    expect(await screenOutput(Buffer.from("x"), "image")).toEqual({ ok: true })
  })
})

describe("smoke test", () => {
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]),
    Buffer.from([0, 0, 2, 0, 0, 0, 1, 32]),
  ])
  it("passes when the worker returns the expected picture, fails on a wrong one, a failed job or a timeout", async () => {
    // the prompt reply must echo the generated id, so route it dynamically
    let sent = ""
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (u: string, init: RequestInit) => {
        if (u.endsWith("/prompt")) {
          sent = JSON.parse(String(init.body)).prompt_id
          return Response.json({ prompt_id: sent })
        }
        if (u.includes("/api/jobs/"))
          return Response.json({
            id: sent,
            status: "completed",
            outputs: { "2": { images: [{ filename: "s.png", subfolder: "", type: "output" }] } },
          })
        return new Response(png)
      }),
    )
    expect(await runSmoke(cfg, { pollMs: 1 })).toMatchObject({
      ok: true,
      detail: expect.stringContaining("512x288"),
    })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (u: string, init: RequestInit) =>
          u.endsWith("/prompt")
            ? Response.json({ prompt_id: JSON.parse(String(init.body)).prompt_id })
            : u.includes("/api/jobs/")
              ? Response.json({ status: "failed" })
              : new Response(png),
        ),
    )
    expect(await runSmoke(cfg, { pollMs: 1 })).toMatchObject({ ok: false, detail: "job failed" })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (u: string, init: RequestInit) =>
          u.endsWith("/prompt")
            ? Response.json({ prompt_id: JSON.parse(String(init.body)).prompt_id })
            : Response.json({ status: "in_progress" }),
        ),
    )
    expect(await runSmoke(cfg, { pollMs: 1, timeoutMs: 20 })).toMatchObject({
      ok: false,
      detail: "timed out",
    })
  })
})
