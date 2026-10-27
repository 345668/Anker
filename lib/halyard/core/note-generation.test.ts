import { describe, expect, it } from "vitest"
import { generateNotes, generateEmail, splitTranscript, MAX_PARTS, CHUNK_CHARS, MAX_LIST, NoteGenerationError } from "./note-generation"

const GOOD = "Meeting Summary:\nS.\nKey Points:\n- a\nDecisions:\nNot recorded\nAction Items:\n- b\nFollow-Up:\n- c"
describe("note generation limits", () => {
  it("refuses an empty transcript, one over a million characters, one needing more than 25 parts, and says nothing was truncated", async () => {
    await expect(generateNotes(async () => GOOD, "  ")).rejects.toThrow(/Add or capture/)
    await expect(generateNotes(async () => GOOD, "x".repeat(1_000_001))).rejects.toThrow(/nothing has been truncated/)
    const many = Array.from({ length: 33 }, () => "a".repeat(29000)).join("\n")
    await expect(generateNotes(async () => GOOD, many)).rejects.toThrow(/more than 25 parts/)
  })
  it("times out with a message that says the saved note is unchanged, and rejects an empty or oversized answer", async () => {
    await expect(generateNotes(() => new Promise(() => {}), "Them: hello there friend", "", { timeoutMs: 20 })).rejects.toThrow(/timed out. Your saved note is unchanged/)
    await expect(generateNotes(async () => "  ", "Them: hello")).rejects.toThrow(/no notes/)
    await expect(generateNotes(async () => "x".repeat(40001), "Them: hello")).rejects.toThrow(/size limit/)
    await expect(generateNotes(async () => { throw new NoteGenerationError("boom") }, "Them: hello")).rejects.toBeInstanceOf(NoteGenerationError)
  })
  it("caps merged lists at 200 and reports progress through a long call", async () => {
    const t = Array.from({ length: 3 }, () => "Them: " + "word ".repeat(9000)).join("\n"), prog: string[] = []
    let n = 0
    const out = await generateNotes(async (q) => (/summaries of consecutive/.test(q.text) ? "Whole." : "Meeting Summary:\nP.\nKey Points:\n" + Array.from({ length: 150 }, () => `- point ${++n}`).join("\n")), t, "", { onProgress: (p, of) => prog.push(`${p}/${of}`) })
    expect(out.keyPoints).toHaveLength(MAX_LIST); expect(out.summary).toBe("Whole."); const parts = splitTranscript(t).length; expect(prog[0]).toBe(`1/${parts + 1}`); expect(prog.at(-1)).toBe(`${parts + 1}/${parts + 1}`)
  })
  it("a long monologue is cut on a space, never mid-word, and no part exceeds the size", () => {
    const parts = splitTranscript("word ".repeat(30000), 45000); expect(parts.every((p) => p.length <= 45000)).toBe(true); expect(parts.join(" ").replace(/\s+/g, " ").trim().split(" ").every((w) => w === "word")).toBe(true)
  })
  it("the email is written from notes only", async () => { await expect(generateEmail(async () => "x", { title: "t", summary: "" })).rejects.toThrow(/notes first/) })
})
