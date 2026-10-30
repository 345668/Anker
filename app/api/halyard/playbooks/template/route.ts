import { NextRequest, NextResponse } from "next/server"
import { halyardWho, halyardFailure } from "@/lib/halyard/route"
import { shippedText } from "@/lib/halyard/playbooks"
import { HalyardError } from "@/lib/halyard/sessions"

export const runtime = "nodejs"
const BLANK = `---
name: my-call-mode
description: One sentence on what this call mode is for and when to use it.
halyard:
  base: call
  mode: "My call mode"
  notesFocus: "What the notes should pay particular attention to in this kind of call."
  prepHint: "What to paste into Prep before the call (names, the deal, the questions to ask)."
  answerLength: short
---

# My call mode

Who "You" and "Them" are in this call, and what a good outcome looks like.

## Action: say

How the next sentence to say should sound, and what it should do.

## Action: followup

Which follow-up questions are worth asking in this kind of call.

## Action: notes

What to capture in the notes, and what to leave out.

## Action: email

How the follow-up email should read.
`
/** ?from=<built-in mode id> returns that mode's text to copy and edit; without it, a short template. */
export async function GET(req: NextRequest) {
  try {
    await halyardWho(false)
    const from = req.nextUrl.searchParams.get("from")
    if (!from) return NextResponse.json({ text: BLANK })
    const text = shippedText(from)
    if (!text) throw new HalyardError("That built-in mode was not found.", 404, "not_found")
    return NextResponse.json({ text: text.replace(/^name:.*$/m, "name: my-copy-of-" + from.slice(0, 20)).replace(/^(\s*)mode:.*$/m, `$1mode: "My copy of ${from.slice(0, 30)}"`) })
  } catch (e) { return halyardFailure(e) }
}
