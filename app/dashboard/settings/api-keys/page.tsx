import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ApiKeysContent } from "@/components/tesseract/api-keys-content"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function ApiKeysPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  
  // Check admin status from users table (not just metadata)
  let isAdmin = false
  try {
    const result = await sql`SELECT is_admin FROM users WHERE id = ${user.id} OR email = ${user.email} LIMIT 1`
    isAdmin = result[0]?.is_admin === true
  } catch {
    // Fallback to metadata check
    const role = (user.user_metadata as any)?.role || (user.app_metadata as any)?.role || "founder"
    isAdmin = role === "admin"
  }
  
  return <ApiKeysContent isAdmin={isAdmin} />
}
