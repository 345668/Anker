import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { discoverableState, setDiscoverable } from "@/lib/investor/discovery"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: Ctx) { try { const c = await investorContext(); return NextResponse.json(await discoverableState(c.userId, (await params).id)) } catch (e) { return investorFailure(e) } }
/** { on: boolean } — owner only. */
export async function PUT(req: NextRequest, { params }: Ctx) { try { const c = await investorContext(), b = await req.json(); return NextResponse.json({ ok: true, ...(await setDiscoverable(c.userId, (await params).id, b?.on === true)) }) } catch (e) { return investorFailure(e) } }
