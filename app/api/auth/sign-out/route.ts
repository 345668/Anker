import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth/local"

export const runtime = "nodejs"

export async function POST() {
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
