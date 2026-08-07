import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client. Bypasses RLS and can use the Auth Admin API
 * (auth.admin.*). Server-only — never import this into client components, and
 * never expose the service-role key to the browser.
 *
 * Used by the sign-up route to create + auto-confirm accounts so a freshly
 * registered user can sign in immediately without an email round-trip.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
