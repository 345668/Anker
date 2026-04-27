import { NextRequest, NextResponse } from "next/server"
import { createUser, setSessionCookie } from "@/lib/auth/local"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await createUser({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: body.name ? String(body.name) : undefined,
      role: body.role === "vc" ? "vc" : "founder",
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    await setSessionCookie(result.user)
    return NextResponse.json({ user: result.user })
  } catch (e: any) {
    console.error("[sign-up] error:", e)
    return NextResponse.json({ error: e?.message ?? "Sign-up failed" }, { status: 500 })
  }
}
