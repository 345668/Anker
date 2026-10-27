// @vitest-environment node
import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import os from "node:os"
import { createRepeatFilter } from "./repeat-filter"
import { createEchoFilter } from "./echo-filter"
import * as rolling from "./rolling-summary"
import { extractNoteFigures } from "./note-figures"
import { CALL_MODES } from "./prompts"
import { parseSkillMarkdown, loadSkillFiles, bodyFor } from "./skill-files"
import { UtteranceSegmenter } from "./utterance-segmenter"

/**
 * The differential test (docs/architecture/62 section 16): until the desktop adopts this package, the TypeScript port and the desktop's own JavaScript are run on the same
 * fixtures and must agree exactly. It runs where the desktop repository is present (HALYARD_DESKTOP_DIR, default ~/Call-Intelligence) and is skipped, loudly, where it is not.
 */
const DESKTOP = process.env.HALYARD_DESKTOP_DIR || path.join(os.homedir(), "Call-Intelligence")
const present = existsSync(path.join(DESKTOP, "src", "prompts.js"))
const d = (name: string) => createRequire(import.meta.url)(path.join(DESKTOP, "src", name))

const CALL = [
  { channel: "them", text: "So we closed the seed at five million dollars, with five LOIs from enterprise customers, and 40% month over month growth." },
  { channel: "you", text: "That's great. When does the first LOI convert, and what is the pricing? Q4 2026 or March 15th?" },
  { channel: "them", text: "We expect it by Q4. Pricing is $2.5m annual, 3x our current ACV, with 12,000 seats." },
  { channel: "you", text: "Got it. Who decides on your side, and how long is the legal review, two weeks or six months?" },
  { channel: "them", text: "The CFO decides. Legal review is about 3 weeks. We signed a term sheet with one lead for €1.2 million." },
  { channel: "you", text: "Okay, and the introduction you offered to the other fund, can you make that this week?" },
  { channel: "them", text: "Yes, I'll introduce you on the 15th of March. One more thing: we have 25 customers and 18 months of runway." },
]
const TRANSCRIPT = CALL.map((t) => `${t.channel === "them" ? "Them" : "You"}: ${t.text}`).join("\n")
const REPEATS: Array<[string, string, number]> = [
  ["them", "And the first floor. Now, let's go this way. Formal living room area, floating steel staircase with open riser design, glass railing that takes us up to the second floor.", 0],
  ["them", "panels just looks great. And a dual elevation bar set up here. Take a look at this Onyx. I've never seen Onyx with this kind of a vein cut in detail before.", 5000],
  ["them", "And the first floor. Now, let's go this way. Formal living room area, floating steel staircase with open riser design, glass railing that takes us up to the second floor. And a dual elevation bar set up here. Take a look at this Onyx. I've never seen Onyx with this kind of a vein cut in detail before.", 30000],
  ["you", "What is 1 plus 1?", 31000], ["you", "Again, what is 1 plus 1?", 34000], ["them", "Got a deal and it's back on the market for $21 million. You're going to find out exactly what's wrong with this unit", 35000],
  ["them", "got a deal and it's back on the market for 21 million dollars. You're going to find out exactly what's wrong with this unit by", 39000],
]

describe.skipIf(!present)("the TypeScript core agrees with the desktop's JavaScript on the same fixtures", () => {
  it("repeat filter: the same verdict and the same report for every turn", () => {
    const a = d("repeat-filter.js").createRepeatFilter(), b = createRepeatFilter()
    for (const [ch, text, ts] of REPEATS) { expect(b.inspect(ch, text, ts), text.slice(0, 20)).toEqual(a.inspect(ch, text, ts)); expect(b.isRepeat(ch, text, ts)).toBe(a.isRepeat(ch, text, ts)) }
    expect(b.report.suppressed).toBe(a.report.suppressed)
  })
  it("echo filter: the same verdict for a bleed, a short reply and an unrelated turn", () => {
    const a = d("echo-filter.js").createEchoFilter(), b = createEchoFilter()
    const remote = "floating steel staircase with open riser design and a glass railing that takes us up to the second floor"
    a.noteRemote(remote, 1000); b.noteRemote(remote, 1000)
    for (const [t, ts] of [["floating steel staircase with open riser design and glass railing that takes up to the second floor", 2500], ["yes that makes sense", 2600], ["what about the pricing for next year", 3000], ["floating steel staircase with open riser design", 20000]] as Array<[string, number]>)
      expect(b.inspect(t, ts)).toEqual(a.inspect(t, ts))
  })
  it("rolling summary: figures, the fold prompt, applying a fold, the formatted brief and the budget", () => {
    const a = d("rolling-summary.js")
    expect(rolling.extractFigures(CALL)).toEqual(a.extractFigures(CALL))
    expect(rolling.buildFoldPrompt("- earlier: seed discussed", CALL)).toBe(a.buildFoldPrompt("- earlier: seed discussed", CALL))
    expect(rolling.buildFoldPrompt("", CALL.slice(0, 2))).toBe(a.buildFoldPrompt("", CALL.slice(0, 2)))
    const messy = "## Running brief\n**Bold** line one. Line two.\n" + "x. ".repeat(1200)
    expect(rolling.applyFold(messy)).toBe(a.applyFold(messy)); expect(rolling.applyFold("  ")).toBe(a.applyFold("  ")); expect(rolling.applyFold(null)).toBe(a.applyFold(null))
    expect(rolling.formatBrief("- a")).toBe(a.formatBrief("- a")); expect(rolling.formatBrief("")).toBe(a.formatBrief(""))
    for (const max of [0, 40, 120, 400, 5000]) expect(rolling.fitToBudget("- brief of the first hour", CALL, max)).toEqual(a.fitToBudget("- brief of the first hour", CALL, max))
    expect(rolling.shouldFold(CALL)).toBe(a.shouldFold(CALL)); expect(rolling.shouldFold(CALL.slice(0, 5))).toBe(a.shouldFold(CALL.slice(0, 5)))
    expect([rolling.MAX_BRIEF_CHARS, rolling.MIN_TURNS_TO_FOLD]).toEqual([a.MAX_BRIEF_CHARS, a.MIN_TURNS_TO_FOLD])
  })
  it("note figures: the same figures, in the same order, with the same sentences and speakers", () => {
    const a = d("note-figures.js")
    expect(extractNoteFigures(TRANSCRIPT)).toEqual(a.extractNoteFigures(TRANSCRIPT))
    const stamped = "[14:05] Them: We raised $5m at a 3x multiple in Q4 2026.\n[14:06:10] You: Closing on March 15th or 15th of April?"
    expect(extractNoteFigures(stamped)).toEqual(a.extractNoteFigures(stamped))
  })
  it("the prompt contract: every action's system prompt and request, with and without a brief, rules and history", () => {
    const a = d("prompts.js").CALL_MODES
    const ctxs = [{ transcript: CALL, userText: "What did they say about pricing?" }, { transcript: [], userText: "" }, { transcript: CALL, previous: ["Earlier suggestion one.", "Earlier suggestion two."], answerLength: "long", userText: "Walk me through it" }]
    expect(Object.keys(CALL_MODES).sort()).toEqual(Object.keys(a).filter((k) => typeof a[k] === "object" && k !== "leetcode").sort()) // the coding solver is desktop-only
    for (const name of Object.keys(CALL_MODES) as Array<keyof typeof CALL_MODES>) {
      for (const [ctxBlock, rules] of [[null, ""], ["Earlier in this conversation (summarised, not verbatim):\n- seed closed", "Never use the word synergy."]] as Array<[string | null, string]>) expect(CALL_MODES[name].buildSystem(ctxBlock, rules), `${name} system`).toBe(a[name].buildSystem(ctxBlock, rules))
      for (const ctx of ctxs) expect(CALL_MODES[name].build(ctx as any), `${name} request`).toBe(a[name].build(ctx))
      expect([CALL_MODES[name].needsScreen, CALL_MODES[name].userBubble, CALL_MODES[name].small, CALL_MODES[name].maxTokens]).toEqual([a[name].needsScreen, a[name].userBubble, a[name].small, a[name].maxTokens])
    }
  })
  it("skill files: parsing, validation, action sections and the shipped skills agree", () => {
    const a = d("skill-files.js")
    const text = readShipped("founder-investor-call")
    expect(parseSkillMarkdown(text)).toEqual(a.parseSkillMarkdown(text))
    const mine = loadSkillFiles([{ dir: path.join(process.cwd(), "skills", "halyard"), source: "app" }]), theirs = a.loadSkillFiles([{ dir: path.join(DESKTOP, "skills"), source: "app" }])
    expect(mine.errors).toEqual(theirs.errors)
    const strip = (s: any) => ({ ...s, path: path.basename(path.dirname(s.path)) })
    expect(mine.skills.map(strip).sort((x: any, y: any) => x.id.localeCompare(y.id))).toEqual(theirs.skills.map(strip).sort((x: any, y: any) => x.id.localeCompare(y.id)))
    for (const sk of mine.skills) for (const act of ["say", "assist", "followup", "recap", "prep", "notes", "email"]) expect(bodyFor(sk, act), `${sk.id} ${act}`).toBe(a.bodyFor(theirs.skills.find((t: any) => t.id === sk.id), act))
  })
  it("the utterance segmenter cuts a synthetic two-burst signal at the same places", () => {
    const { UtteranceSegmenter: Theirs } = d("utterance-segmenter.js")
    const pcm = (ms: number, amp: number) => { const n = Math.floor(16 * ms); const b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * Math.sin(i / 5)), i * 2); return b }
    const signal = [pcm(2000, 30), pcm(800, 6000), pcm(1500, 30), pcm(30000, 6000), pcm(1200, 30)]
    const run = (Seg: any) => { const out: Array<[string, number]> = []; const s = new Seg({ channel: "them", onUtterance: (_c: string, b: Buffer) => out.push(["u", b.length]), onSpeechState: (_c: string, on: boolean) => out.push([on ? "start" : "end", 0]) }); for (const part of signal) for (let i = 0; i < part.length; i += 960) s.push(part.subarray(i, i + 960)); s.stop(); return out }
    const mine = run(UtteranceSegmenter), theirs = run(Theirs)
    expect(mine).toEqual(theirs); expect(mine.filter((x) => x[0] === "u").length).toBeGreaterThanOrEqual(2)
  })
})

function readShipped(name: string): string { return require("node:fs").readFileSync(path.join(process.cwd(), "skills", "halyard", name, "SKILL.md"), "utf8") }

describe("the differential test is not silently skipped in a place that has the desktop", () => {
  it("reports whether the desktop repository was found", () => { if (!present) console.warn(`[halyard-core] differential test skipped: no desktop repository at ${DESKTOP} (set HALYARD_DESKTOP_DIR)`); expect(typeof present).toBe("boolean") })
})
