import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === 'true' ||
  process.env.LOCAL_DB === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://stub.supabase.co'

export async function middleware(request: NextRequest) {
  // Local mode: skip Supabase session refresh entirely
  if (LOCAL) return NextResponse.next()
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
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
