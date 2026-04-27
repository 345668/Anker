import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Bypass Supabase auth when running locally without a real Supabase project.
// Triggers on either: explicit LOCAL_AUTH_BYPASS=true, or LOCAL_DB=true,
// or when SUPABASE_URL is the stub fixture.
const LOCAL =
  process.env.LOCAL_AUTH_BYPASS === 'true' ||
  process.env.LOCAL_DB === 'true' ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://stub.supabase.co'
const LOCAL_USER = {
  id: 'local-user-00000000-0000-0000-0000-000000000001',
  email: 'founder@anker.local',
  user_metadata: { first_name: 'Local' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  // Local-mode shim — returns a Supabase-like object that always reports a
  // signed-in user, so dashboard pages render against PGlite without needing
  // a real Supabase project.
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
            // The "setAll" method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  )
}

function localClient(): any {
  return {
    auth: {
      getUser: async () => ({ data: { user: LOCAL_USER }, error: null }),
      getSession: async () => ({
        data: {
          session: {
            access_token: 'local',
            refresh_token: 'local',
            expires_in: 3600,
            token_type: 'bearer',
            user: LOCAL_USER,
          },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: LOCAL_USER, session: null }, error: null }),
      signUp: async () => ({ data: { user: LOCAL_USER, session: null }, error: null }),
    },
    from: () => ({
      select: () => ({ data: [], error: null }),
      insert: () => ({ data: null, error: null }),
      update: () => ({ data: null, error: null }),
      delete: () => ({ data: null, error: null }),
    }),
  }
}
