import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { changeRole, invite, leave, removeMember, revokeInvite } from "@/lib/investor/team"

export const runtime = "nodejs"
/** { action: "invite", email, role } | { action: "revoke_invite", inviteId } | { action: "remove", userId } | { action: "role", userId, role } | { action: "leave" } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await investorContext(), id = (await params).id, b = await req.json()
    switch (b?.action) {
      case "invite": await invite(c.userId, id, { email: b.email, role: b.role }); break
      case "revoke_invite": await revokeInvite(c.userId, id, String(b.inviteId ?? "")); break
      case "remove": await removeMember(c.userId, id, String(b.userId ?? "")); break
      case "role": await changeRole(c.userId, id, String(b.userId ?? ""), b.role); break
      case "leave": await leave(c.userId, id); break
      default: throw new InvestorError("Choose invite, revoke_invite, remove, role or leave.")
    }
    return NextResponse.json({ ok: true })
  } catch (e) { return investorFailure(e) }
}
