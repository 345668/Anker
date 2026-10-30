import { NextRequest, NextResponse } from "next/server"
import { halyardWho, halyardFailure } from "@/lib/halyard/route"
import { previewPlaybook } from "@/lib/halyard/playbooks"

export const runtime = "nodejs"
/** { text } — what the parser understood, without saving anything. */
export async function POST(req: NextRequest) { try { await halyardWho(false); return NextResponse.json(previewPlaybook((await req.json())?.text)) } catch (e) { return halyardFailure(e) } }
