import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { providerChain, hasCredential } from "./provider"
import type { AiRouterConfig } from "./runtime-config"

// providerChain() consults process.env as a fallback, so clear every provider
// env var before each test to make the saved-config path deterministic.
const PROVIDER_ENV = [
  "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY",
  "MISTRAL_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY", "QWEN_WORKSPACE_ID",
  "AI_PROVIDER", "LOCAL_AI_ENABLED",
]
let saved: Record<string, string | undefined> = {}
beforeEach(() => {
  saved = {}
  for (const k of PROVIDER_ENV) { saved[k] = process.env[k]; delete process.env[k] }
})
afterEach(() => {
  for (const k of PROVIDER_ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function cfg(overrides: Partial<AiRouterConfig> = {}): AiRouterConfig {
  return {
    enabled: {}, modelOverride: {},
    providerOverride: null, providerStrict: false,
    geminiApiKey: null, anthropicApiKey: null, openaiApiKey: null,
    mistralApiKey: null, qwenApiKey: null, qwenWorkspaceId: null,
    geminiModel: null, anthropicModel: null, openaiModel: null,
    mistralModel: null, qwenModel: null,
    localEnabled: false,
    ...overrides,
  }
}

describe("providerChain", () => {
  it("returns ['none'] with no keys and no env", () => {
    expect(providerChain(cfg())).toEqual(["none"])
    expect(providerChain(null)).toEqual(["none"])
  })

  it("orders saved keys canonically: anthropic → gemini → openai → mistral → qwen", () => {
    const chain = providerChain(cfg({
      anthropicApiKey: "a", geminiApiKey: "g", openaiApiKey: "o",
      mistralApiKey: "m", qwenApiKey: "q",
    }))
    expect(chain).toEqual(["anthropic", "gemini", "openai", "mistral", "qwen"])
  })

  it("appends ollama last only when localEnabled", () => {
    expect(providerChain(cfg({ anthropicApiKey: "a", localEnabled: true })))
      .toEqual(["anthropic", "ollama"])
  })

  // The exact regression fixed in 82b1c17: a pinned provider must LEAD the
  // chain in the order it was pinned, not be reordered behind another key.
  it("pins the chosen provider first, keeping others as backups (non-strict)", () => {
    const chain = providerChain(cfg({
      providerOverride: "mistral", providerStrict: false,
      mistralApiKey: "m", qwenApiKey: "q", anthropicApiKey: "a",
    }))
    expect(chain[0]).toBe("mistral")
    expect(chain).toContain("qwen")
    expect(chain).toContain("anthropic")
  })

  it("honours strict pin with no failover", () => {
    expect(providerChain(cfg({
      providerOverride: "mistral", providerStrict: true,
      mistralApiKey: "m", qwenApiKey: "q",
    }))).toEqual(["mistral"])
  })

  it("skips a keyless pin when real backups exist", () => {
    // anthropic pinned but no anthropic key; gemini has one → chain is [gemini]
    const chain = providerChain(cfg({
      providerOverride: "anthropic", anthropicApiKey: null, geminiApiKey: "g",
    }))
    expect(chain).toEqual(["gemini"])
  })

  it("keeps a keyless pin as sole entry when there are no backups (for a clear error)", () => {
    expect(providerChain(cfg({ providerOverride: "anthropic", anthropicApiKey: null })))
      .toEqual(["anthropic"])
  })

  it("returns ['none'] when the pin is 'none'", () => {
    expect(providerChain(cfg({ providerOverride: "none", anthropicApiKey: "a" })))
      .toEqual(["none"])
  })

  // The DASHSCOPE-takeover bug: once ANY key is saved, a stray env key must
  // NOT inject a provider the admin didn't configure.
  it("ignores stray env keys once a provider key is saved in config", () => {
    process.env.DASHSCOPE_API_KEY = "leftover-qwen-key"
    const chain = providerChain(cfg({ anthropicApiKey: "a" }))
    expect(chain).toEqual(["anthropic"])
    expect(chain).not.toContain("qwen")
  })

  // Before any key is saved (bootstrap / self-hosted), env keys still count.
  it("honours env keys when no keys are saved in config", () => {
    process.env.ANTHROPIC_API_KEY = "env-anthropic"
    expect(providerChain(cfg())).toEqual(["anthropic"])
  })
})

describe("hasCredential", () => {
  it("is true for a provider with a saved key", () => {
    expect(hasCredential("anthropic", cfg({ anthropicApiKey: "a" }))).toBe(true)
  })

  it("is false for a keyless provider once other keys are saved", () => {
    expect(hasCredential("anthropic", cfg({ geminiApiKey: "g" }))).toBe(false)
  })

  it("treats ollama as credentialled only when localEnabled", () => {
    expect(hasCredential("ollama", cfg({ localEnabled: true }))).toBe(true)
    expect(hasCredential("ollama", cfg({ localEnabled: false }))).toBe(false)
  })
})
