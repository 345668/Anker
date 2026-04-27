import { updateSession } from "@/lib/supabase/middleware"
import { jwtVerify } from "jose"
import { NextResponse, type NextRequest } from "next/server"

const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === "true" ||
  process.env.LOCAL_DB === "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://stub.supabase.co"

const SESSION_COOKIE = "anker_session"

const PROTECTED_PREFIXES = ["/dashboard"]
const AUTH_PATHS = ["/auth/login", "/auth/sign-up", "/auth/forgot-password", "/auth/reset-password", "/login", "/register"]

let _key: Uint8Array | null = null
function key(): Uint8Array {
  if (_key) return _key
  const secret = process.env.SECRET_KEY ?? "dev-fallback-key-change-me"
  _key = new TextEncoder().encode(secret)
  return _key
}

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    await jwtVerify(token, key())
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  if (LOCAL) {
    const { pathname } = request.nextUrl
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
    const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))

    const token = request.cookies.get(SESSION_COOKIE)?.value
    const valid = await hasValidSession(token)

    if (isProtected && !valid) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      url.searchParams.set("next", pathname)
      return NextResponse.redirect(url)
    }
    if (isAuthPage && valid) {
      const url = request.nextUrl.clone()
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - api/auth (auth endpoints must be unprotected)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
