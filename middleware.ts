import { updateSession } from "@/lib/supabase/middleware"
import { NextResponse, type NextRequest } from "next/server"

// ─── URL rationalization (Jul 11 IA overhaul) ────────────────────────────
//
// Six admin routes were promoted to first-class user pages. Old URLs 301 to
// their new homes so bookmarks + LP-portal deep links + the Chrome extension
// keep working.
//
// Order matters — longer prefixes first so /admin/newsroom/api-keys doesn't
// match the /admin/newsroom rule before the /admin/newsroom/api-keys one.
const IA_REDIRECTS: Array<[from: string, to: string]> = [
  // Newsroom → Content
  ["/dashboard/admin/newsroom/api-keys", "/dashboard/content/api-keys"],
  ["/dashboard/admin/newsroom/sources",  "/dashboard/content/sources"],
  ["/dashboard/admin/newsroom/new",       "/dashboard/content/new"],
  ["/dashboard/admin/newsroom",           "/dashboard/content"],
  // Outbox + Inbox → Send Center
  ["/dashboard/admin/inbox",              "/dashboard/send-center/replies"],
  ["/dashboard/admin/email",              "/dashboard/send-center"],
  ["/dashboard/admin/email-check",        "/dashboard/send-center/deliverability"],
  // Data ops → Imports
  ["/dashboard/admin/imports",            "/dashboard/imports"],
  ["/dashboard/admin/enrichment",         "/dashboard/imports/enrichment"],
  ["/dashboard/admin/crawl",              "/dashboard/imports/crawl"],
  ["/dashboard/admin/url-check",          "/dashboard/imports/url-check"],
]

function iaRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl
  for (const [from, to] of IA_REDIRECTS) {
    if (pathname === from) {
      const url = request.nextUrl.clone()
      url.pathname = to
      return NextResponse.redirect(url, 301)
    }
    if (pathname.startsWith(from + "/")) {
      const url = request.nextUrl.clone()
      url.pathname = to + pathname.slice(from.length)
      return NextResponse.redirect(url, 301)
    }
  }
  return null
}

export async function middleware(request: NextRequest) {
  const redirected = iaRedirect(request)
  if (redirected) return redirected
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
