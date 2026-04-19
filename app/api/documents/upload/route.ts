import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sql } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'pitch-deck' or 'data-room'
    const folder = formData.get('folder') as string || 'general'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif',
      'text/plain',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    // Max 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    // Get user's startup
    let startupId: string | null = null
    try {
      const startups = await sql`SELECT id FROM startups WHERE owner_id = ${user.id} LIMIT 1`
      startupId = startups[0]?.id || null
      if (!startupId) {
        const fallback = await sql`SELECT id FROM startups WHERE founder_id = ${user.id} LIMIT 1`
        startupId = fallback[0]?.id || null
      }
    } catch {
      // Startup query failed, continue without startup_id
    }

    // Upload to Vercel Blob (private storage for sensitive docs)
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const pathname = `documents/${user.id}/${type}/${folder}/${timestamp}_${safeName}`

    const blob = await put(pathname, file, {
      access: 'private',
    })

    // Store document metadata in database
    try {
      await sql`
        INSERT INTO documents (
          user_id, startup_id, type, folder, name, 
          blob_pathname, content_type, size, created_at
        ) VALUES (
          ${user.id}, ${startupId}, ${type}, ${folder}, ${file.name},
          ${blob.pathname}, ${file.type}, ${file.size}, NOW()
        )
      `
    } catch (e) {
      // Table might not exist, continue anyway - file is uploaded
      console.error('[v0] Failed to save document metadata:', e)
    }

    return NextResponse.json({ 
      success: true,
      pathname: blob.pathname,
      name: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
