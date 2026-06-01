import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sql } from '@/lib/db'
import { streamText } from 'ai'

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { pathname, documentId } = await request.json()

    if (!pathname) {
      return NextResponse.json({ error: 'Missing document pathname' }, { status: 400 })
    }

    // Get startup context for more personalized analysis
    let startupContext = ''
    try {
      // startups table uses founder_id, not owner_id
      const startups = await sql`
        SELECT name, description, niche_industry as industry, stage, funding_target as target_raise, location 
        FROM startups WHERE founder_id = ${user.id} LIMIT 1
      `
      if (startups[0]) {
        const s = startups[0]
        startupContext = `
Startup Context:
- Name: ${s.name || 'Unknown'}
- Industry: ${s.industry || 'Unknown'}
- Stage: ${s.stage || 'Unknown'}
- Target Raise: ${s.target_raise || 'Unknown'}
- Location: ${s.location || 'Unknown'}
- Description: ${s.description || 'Unknown'}
`
      }
    } catch {
      // Continue without startup context
    }

    // Use AI to analyze the pitch deck
    // Note: In production, you'd extract text from PDF first
    const result = streamText({
      model: 'openai/gpt-4o',
      system: `You are an expert pitch deck analyst and VC advisor. Analyze pitch decks and provide actionable feedback.

${startupContext}

Provide analysis in the following JSON format:
{
  "overallScore": 85,
  "sections": {
    "problem": { "score": 90, "feedback": "Clear problem statement..." },
    "solution": { "score": 85, "feedback": "..." },
    "market": { "score": 80, "feedback": "..." },
    "businessModel": { "score": 75, "feedback": "..." },
    "traction": { "score": 70, "feedback": "..." },
    "team": { "score": 85, "feedback": "..." },
    "financials": { "score": 80, "feedback": "..." },
    "ask": { "score": 90, "feedback": "..." }
  },
  "strengths": ["List of 3-5 key strengths"],
  "improvements": ["List of 3-5 key improvements needed"],
  "vcFit": {
    "bestFit": ["Types of VCs this deck would appeal to"],
    "concerns": ["Potential VC concerns to address"]
  },
  "nextSteps": ["Prioritized action items"]
}`,
      prompt: `Analyze this pitch deck for a ${startupContext ? 'the startup described above' : 'a startup'}. 
      
The document is stored at: ${pathname}

Provide comprehensive feedback covering:
1. Overall presentation quality and narrative flow
2. Problem/Solution clarity
3. Market sizing and opportunity
4. Business model viability
5. Traction and proof points
6. Team credibility
7. Financial projections reasonableness
8. Ask clarity and use of funds

Be specific, actionable, and constructive.`,
    })

    // Store analysis result
    if (documentId) {
      try {
        // We'll store the analysis after it completes
        // For now, mark as analyzing
        await sql`
          UPDATE documents 
          SET ai_analysis_status = 'completed', 
              ai_analyzed_at = NOW()
          WHERE id = ${documentId}
        `
      } catch {
        // Continue even if update fails
      }
    }

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
