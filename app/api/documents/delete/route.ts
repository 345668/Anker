import { del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sql } from '@/lib/db'

export async function DELETE(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { pathname } = await request.json()

    if (!pathname) {
      return NextResponse.json({ error: 'No pathname provided' }, { status: 400 })
    }

    // Security: ensure user can only delete their own files
    if (!pathname.includes(`/${user.id}/`)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await del(pathname)

    // Remove from database
    try {
      await sql`DELETE FROM documents WHERE blob_pathname = ${pathname} AND user_id = ${user.id}`
    } catch {
      // Table might not exist, continue
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
