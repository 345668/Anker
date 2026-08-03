/**
 * ANKER AI media generation.
 *
 * POST /api/anker/media
 *   { model, prompt, refImages?, size?, resolution?, duration? }
 *   → image models: synchronous, returns { kind:"image", images:[url] }
 *   → video models: async, returns { kind:"video", taskId }
 *
 * GET /api/anker/media?task=<id>
 *   → poll a video task → { status, videoUrl, images }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getModel } from "@/lib/ai/model-catalog"
import { dashscopeKey, generateImage, submitVideo, pollTask } from "@/lib/ai/dashscope-media"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { model?: string; prompt?: string; refImages?: string[]; size?: string; resolution?: string; duration?: number }
    | null
  const model = body?.model && getModel(body.model)
  if (!model) return NextResponse.json({ error: "Unknown model" }, { status: 400 })
  const prompt = (body?.prompt || "").trim()
  if (!prompt && !(body?.refImages?.length)) return NextResponse.json({ error: "A prompt is required" }, { status: 400 })

  const key = await dashscopeKey()
  if (!key) return NextResponse.json({ error: "DashScope key not configured" }, { status: 503 })

  try {
    if (model.category === "image") {
      const r = await generateImage(key, model.id, prompt, { refImages: body?.refImages, size: body?.size })
      return NextResponse.json({ kind: "image", images: r.images })
    }
    if (model.category === "video") {
      const taskId = await submitVideo(key, model.id, prompt, {
        firstFrame: body?.refImages?.[0], refImages: body?.refImages,
        resolution: body?.resolution, duration: body?.duration,
      })
      return NextResponse.json({ kind: "video", taskId })
    }
    return NextResponse.json({ error: `Model '${model.id}' is not an image/video model.` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const taskId = new URL(req.url).searchParams.get("task")
  if (!taskId) return NextResponse.json({ error: "task required" }, { status: 400 })
  const key = await dashscopeKey()
  if (!key) return NextResponse.json({ error: "DashScope key not configured" }, { status: 503 })
  try {
    return NextResponse.json(await pollTask(key, taskId))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "poll failed" }, { status: 502 })
  }
}
