import { NextRequest, NextResponse } from "next/server"
import { halyardWho, halyardFailure } from "@/lib/halyard/route"
import { HalyardError } from "@/lib/halyard/sessions"
import { deletePlaybook, getPlaybookText, updatePlaybook } from "@/lib/halyard/playbooks"

export const runtime = "nodejs"
type P = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: P) { try { const w = await halyardWho(false); return NextResponse.json(await getPlaybookText(w.orgId, w.userId, (await params).id)) } catch (e) { return halyardFailure(e) } }
const browserOnly = async () => { const w = await halyardWho(true); if (w.via === "device") throw new HalyardError("Write playbooks in the web app.", 403, "browser_only"); return w }
export async function PUT(req: NextRequest, { params }: P) { try { const w = await browserOnly(); return NextResponse.json({ playbook: await updatePlaybook(w, (await params).id, (await req.json())?.text) }) } catch (e) { return halyardFailure(e) } }
export async function DELETE(_r: NextRequest, { params }: P) { try { const w = await browserOnly(); await deletePlaybook(w, (await params).id); return NextResponse.json({ ok: true }) } catch (e) { return halyardFailure(e) } }
