import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { clearSessionCookie, getSession } from "@/lib/auth/local"

// Local mode = no real Supabase project. Triggered by any of:
//   - LOCAL_AUTH_BYPASS=true (explicit)
//   - LOCAL_DB=true (running on PGlite)
//   - NEXT_PUBLIC_SUPABASE_URL is the stub fixture
const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === "true" ||
  process.env.LOCAL_DB === "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://stub.supabase.co"

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  if (LOCAL) {
    return localClient()
  }

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component context — middleware will refresh sessions
          }
        },
      },
    },
  )
}

/**
 * Local-mode shim. Reads the JWT cookie set by /api/auth/sign-in and
 * exposes a Supabase-like surface so dashboard server components keep
 * working unchanged.
 */
async function localClient(): Promise<any> {
  const session = await getSession()

  // Build a User-shaped object compatible with @supabase/supabase-js User
  const user = session
    ? {
        id: session.sub,
        email: session.email,
        user_metadata: {
          first_name: session.name?.split(" ")[0] ?? "",
          last_name: session.name?.split(" ").slice(1).join(" ") ?? "",
          full_name: session.name,
          role: session.role,
        },
        app_metadata: { provider: "local", role: session.role },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      }
    : null

  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({
        data: user
          ? {
              session: {
                access_token: "local",
                refresh_token: "local",
                expires_in: 3600,
                token_type: "bearer",
                user,
              },
            }
          : { session: null },
        error: null,
      }),
      signOut: async () => {
        await clearSessionCookie()
        return { error: null }
      },
      // Sign-in / sign-up are handled by /api/auth/* — keep these as no-ops
      // so any legacy supabase.auth.signInWithPassword calls don't crash.
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: "Use POST /api/auth/sign-in in local mode" },
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: { message: "Use POST /api/auth/sign-up in local mode" },
      }),
    },
    from: () => ({
      select: () => ({ data: [], error: null }),
      insert: () => ({ data: null, error: null }),
      update: () => ({ data: null, error: null }),
      delete: () => ({ data: null, error: null }),
    }),
  }
}
