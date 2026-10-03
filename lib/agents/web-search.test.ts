import { describe, it, expect, vi, afterEach } from "vitest"
vi.mock("@/lib/ai/qwen-standard", () => ({ standardQwen: async () => ({ apiKey: "k", baseUrl: "https://qwen.test/v1" }) }))
import { searchProviders, searchWithStatus } from "./web-search"

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("searchProviders", () => {
  it("production with nothing configured uses Qwen search, never the unreachable localhost SearXNG", () => {
    expect(searchProviders({ NODE_ENV: "production" }).map((p) => p.name)).toEqual(["qwen-search"])
  })
  it("tries what the operator configured first", () => {
    const names = searchProviders({ NODE_ENV: "production", SEARXNG_URL: "https://s.example", TAVILY_API_KEY: "t", SERPER_API_KEY: "s" }).map((p) => p.name)
    expect(names).toEqual(["searxng", "tavily", "serper", "qwen-search"])
  })
  it("Qwen search can be switched off", () => {
    expect(searchProviders({ NODE_ENV: "production", QWEN_WEB_SEARCH: "off" })).toEqual([])
  })
  it("development falls back to the local sidecar", () => {
    expect(searchProviders({ NODE_ENV: "development", QWEN_WEB_SEARCH: "off" }).map((p) => p.name)).toEqual(["searxng"])
  })
})

describe("searchWithStatus", () => {
  it("returns the Qwen answer first, then its sources", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Berlin is 14 °C and cloudy today." } }],
      search_info: { search_results: [{ title: "Forecast", url: "https://weather.example/berlin", site_name: "Weather" }] },
    }), { status: 200 })))
    const { hits, attempts } = await searchWithStatus("weather in Berlin today", { limit: 3 })
    expect(hits[0].snippet).toContain("14 °C")
    expect(hits[0].url).toBe("https://weather.example/berlin")
    expect(hits).toHaveLength(2)
    expect(attempts).toEqual([{ provider: "qwen-search", ok: true, note: undefined }])
  })
  it("falls through a failing provider and reports what failed", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TAVILY_API_KEY", "t")
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url))
      return String(url).includes("tavily") ? new Response("no", { status: 401 }) : new Response(JSON.stringify({ choices: [{ message: { content: "ok answer" } }] }), { status: 200 })
    }))
    const { hits, attempts } = await searchWithStatus("q")
    expect(hits[0].snippet).toBe("ok answer")
    expect(attempts[0]).toEqual({ provider: "tavily", ok: false, note: "HTTP 401" })
    expect(attempts[1].ok).toBe(true)
  })
  it("no results and no secrets in the report", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })))
    const { hits, attempts } = await searchWithStatus("q")
    expect(hits).toEqual([])
    expect(JSON.stringify(attempts)).not.toContain("Bearer")
  })
})
