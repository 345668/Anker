import { NextRequest, NextResponse } from "next/server"
import { sessionContext, viewContext, halyardFailure } from "@/lib/halyard/route"
import { latestNotes, saveNotes } from "@/lib/halyard/notes"

export const runtime = "nodejs"
type P = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: P) { try { const { session, role } = await viewContext((await params).id); const n = await latestNotes(session.id); return NextResponse.json({ notes: n && role === "viewer" ? { ...n, body: { ...n.body, email: "" } } : n }) } catch (e) { return halyardFailure(e) } }
/** { summary, keyPoints, decisions, actionItems, followUp, figures, email } — the person's own edit, saved as a new version. */
export async function PUT(req: NextRequest, { params }: P) { try { const { session } = await sessionContext((await params).id); return NextResponse.json({ notes: await saveNotes(session, await req.json(), "user") }) } catch (e) { return halyardFailure(e) } }
