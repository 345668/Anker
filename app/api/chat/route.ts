import { NextResponse } from 'next/server'
import {
  consumeStream,
  convertToModelMessages,
  streamText,
  UIMessage,
} from 'ai'
import { getAiSdkModel } from '@/lib/ai/provider'
import { requireUser } from '@/lib/auth/require-user'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    // Auth: open LLM proxy otherwise — anyone with the URL burns tokens.
    const auth = await requireUser()
    if (auth instanceof NextResponse) return auth

    const { messages, context }: { messages: UIMessage[]; context?: { startup?: string; industry?: string } } = await req.json()

    // Get the configured AI model from runtime settings
    const { model } = await getAiSdkModel()

    // Build system prompt based on context
    const systemPrompt = `You are Anker AI, an expert fundraising advisor and assistant for startup founders. 
You help with:
- Pitch deck feedback and optimization
- Investor outreach strategy
- Fundraising best practices
- Valuation guidance
- Term sheet analysis
- Due diligence preparation

${context?.startup ? `The user is working on a startup called "${context.startup}"${context?.industry ? ` in the ${context.industry} industry` : ''}.` : ''}

Be concise, practical, and actionable in your advice. Use your knowledge of venture capital, angel investing, and startup ecosystems to provide expert guidance. When appropriate, provide specific examples and templates.`

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      abortSignal: req.signal,
    })

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      consumeSseStream: consumeStream,
    })
  } catch (error: any) {
    console.error("[chat] error:", error?.message)
    return new Response(JSON.stringify({ error: error?.message || "Chat failed" }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    })
  }
}
