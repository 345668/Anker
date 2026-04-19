import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DocumentsContent } from "@/components/tesseract/documents-content"
import { sql } from "@/lib/db"

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Fetch user's documents
  let documents: Array<{
    id: string
    name: string
    blob_pathname: string
    content_type: string
    size: number
    type: string
    folder: string
    ai_score?: number
    ai_analysis_status?: string
    view_count?: number
    created_at: string
  }> = []

  try {
    documents = await sql`
      SELECT id, name, blob_pathname, content_type, size, type, folder, 
             ai_score, ai_analysis_status, view_count, created_at
      FROM documents 
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `
  } catch {
    // Table might not exist yet, continue with empty array
  }

  return (
    <DocumentsContent 
      user={user} 
      documents={JSON.parse(JSON.stringify(documents))}
    />
  )
}
