/**
 * POST /api/anker/chat — streaming chat for the ANKER AI chatbot.
 *
 * Streams token-by-token (like Claude's UI) from the selected model. Chat/
 * vision/omni models run over DashScope's OpenAI-compatible endpoint via SSE;
 * the deltas are re-emitted as a plain UTF-8 text stream the client appends.
 *
 * Body: { model: string, messages: {role,content}[], system?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readRouterConfig } from "@/lib/ai/runtime-config"
import { getModel, CHATTABLE, DEFAULT_CHAT_MODEL } from "@/lib/ai/model-catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const DASHSCOPE_CHAT = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"

const SYSTEM = `You are ANKER AI, the assistant inside the Anker platform — an AI-native operating system for venture fundraising (for founders) and fund operations (for VCs/LPs). Be concise, direct, and helpful. Use Markdown. When you don't know something specific to this user's data, say so plainly rather than inventing it.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { model?: string; messages?: { role: string; content: string }[]; system?: string }
    | null
  if (!body?.messages?.length) return NextResponse.json({ error: "messages required" }, { status: 400 })

  const modelId = body.model || DEFAULT_CHAT_MODEL
  const model = getModel(modelId)
  if (!model || !CHATTABLE.includes(model.category)) {
    return NextResponse.json({ error: `Model '${modelId}' is not a conversation model.` }, { status: 400 })
  }

  const cfg = await readRouterConfig().catch(() => null)
  const key = cfg?.qwenApiKey || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY
  if (!key) return NextResponse.json({ error: "DashScope key not configured." }, { status: 503 })

  const messages = [
    { role: "system", content: body.system?.trim() || SYSTEM },
    ...body.messages.slice(-30).map((m) => ({ role: m.role, content: String(m.content).slice(0, 60_000) })),
  ]

  let upstream: Response
  try {
    upstream = await fetch(DASHSCOPE_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages, stream: true, max_tokens: Math.min(model.maxOutTokens ?? 4096, 8192) }),
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Upstream error: ${e?.message ?? e}` }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    return NextResponse.json({ error: `Model error ${upstream.status}: ${detail.slice(0, 300)}` }, { status: 502 })
  }

  // Transform OpenAI-style SSE → plain text token stream.
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith("data:")) continue
            const data = t.slice(5).trim()
            if (data === "[DONE]") { controller.close(); return }
            try {
              const json = JSON.parse(data)
              const delta = json?.choices?.[0]?.delta?.content
              if (delta) controller.enqueue(encoder.encode(delta))
            } catch { /* keep partial in buffer next round */ }
          }
        }
      } catch (e: any) {
        controller.enqueue(encoder.encode(`\n\n[stream error: ${e?.message ?? e}]`))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
