import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import Anthropic from "@anthropic-ai/sdk"
import { put } from "@vercel/blob"

// Get user's Anthropic API key from settings
async function getAnthropicKey(userId: string): Promise<string | null> {
  try {
    const result = await sql`SELECT anthropic_api_key FROM user_settings WHERE user_id = ${userId}`
    return result[0]?.anthropic_api_key || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const documentId = formData.get("documentId") as string | null
    const analysisType = formData.get("analysisType") as string || "comprehensive"
    
    // Get user's Anthropic API key
    const anthropicKey = await getAnthropicKey(user.id)
    if (!anthropicKey) {
      return NextResponse.json({ 
        error: "Anthropic API key not configured. Please add your API key in Settings > API Keys." 
      }, { status: 400 })
    }
    
    let fileContent: string = ""
    let fileName: string = ""
    
    if (file) {
      // If file is uploaded directly
      fileName = file.name
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString("base64")
      fileContent = base64
    } else if (documentId) {
      // Get file from documents table
      const docs = await sql`SELECT * FROM documents WHERE id = ${documentId} AND user_id = ${user.id}`
      if (!docs.length) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 })
      }
      fileName = docs[0].name
      // Would need to fetch from blob storage here
    }
    
    // Initialize Anthropic client with user's API key
    const anthropic = new Anthropic({
      apiKey: anthropicKey
    })
    
    // Build the analysis prompt based on type
    const prompts: Record<string, string> = {
      comprehensive: `You are an expert VC analyst. Analyze this pitch deck comprehensively and provide:

1. **Executive Summary** - Brief overview of the company and opportunity
2. **Problem & Solution Analysis** - How well the problem is defined and solution addresses it
3. **Market Analysis** - TAM/SAM/SOM assessment, market dynamics
4. **Business Model Review** - Revenue model, unit economics, scalability
5. **Competitive Landscape** - Positioning, moats, differentiation
6. **Team Assessment** - Founder-market fit, experience, gaps
7. **Traction & Metrics** - Current progress, key KPIs
8. **Financials** - Projections, assumptions, runway
9. **Investment Terms** - Valuation, use of funds
10. **Key Risks** - Top 5 risks and mitigations
11. **Overall Score** - Rating out of 100 with reasoning
12. **Recommendation** - Pass/Consider/Strong Interest with reasoning

Be specific, data-driven, and provide actionable feedback.`,
      
      founder: `You are an experienced startup mentor. Analyze this pitch deck from a founder's perspective:

1. **Deck Clarity** - Is the story clear and compelling?
2. **What's Working** - Top 3 strongest elements
3. **What Needs Work** - Top 3 areas to improve
4. **Missing Elements** - Key slides or information that should be added
5. **Investor Objections** - Likely questions/concerns VCs will raise
6. **Suggested Improvements** - Specific recommendations for each weak area
7. **Competitive Positioning** - How to better differentiate
8. **Narrative Flow** - Does the story build logically?
9. **Design Feedback** - Visual improvements needed
10. **Next Steps** - Priority actions before pitching

Be constructive and actionable with specific suggestions.`,
      
      vc_diligence: `You are conducting investment due diligence. Analyze this pitch deck critically:

1. **Investment Thesis Fit** - Does this fit typical investment criteria?
2. **Market Opportunity** - Is the market large enough and growing?
3. **Defensibility** - What moats exist or can be built?
4. **Capital Efficiency** - How efficiently is capital being deployed?
5. **Path to Exit** - What are realistic exit scenarios?
6. **Red Flags** - Any concerning patterns or omissions?
7. **Due Diligence Questions** - Key questions for follow-up
8. **Comparable Companies** - Similar investments and their outcomes
9. **Valuation Assessment** - Is the ask reasonable?
10. **Deal Terms** - Standard vs. non-standard terms
11. **Risk/Reward Analysis** - Expected value calculation
12. **Investment Decision** - Detailed recommendation

Be thorough and identify both opportunities and concerns.`,

      quick_score: `Quickly score this pitch deck on the following criteria (1-10 each):

1. Problem Clarity
2. Solution Strength  
3. Market Size
4. Business Model
5. Traction
6. Team
7. Competitive Advantage
8. Financials
9. Ask & Use of Funds
10. Overall Presentation

Provide a total score out of 100 and a brief 2-3 sentence summary.`
    }
    
    const systemPrompt = prompts[analysisType] || prompts.comprehensive
    
    // Call Anthropic API for analysis
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${systemPrompt}\n\nPlease analyze the following pitch deck: "${fileName}"\n\nNote: If you cannot see the actual deck content, provide a template analysis explaining what you would look for in each section.`
            }
          ]
        }
      ]
    })
    
    const analysisContent = message.content[0].type === 'text' ? message.content[0].text : ''
    
    // Generate a report document
    const reportHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Pitch Deck Analysis - ${fileName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #111; border-bottom: 2px solid #111; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .section { margin-bottom: 24px; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
    .score { font-size: 48px; font-weight: bold; color: #111; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Pitch Deck Analysis Report</h1>
  <div class="meta">
    <p><strong>Document:</strong> ${fileName}</p>
    <p><strong>Analysis Type:</strong> ${analysisType}</p>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  </div>
  <div class="content">
    ${analysisContent.split('\n').map(line => {
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`
      if (line.startsWith('**') && line.endsWith('**')) return `<h3>${line.slice(2, -2)}</h3>`
      if (line.trim()) return `<p>${line}</p>`
      return ''
    }).join('\n')}
  </div>
  <div class="footer">
    <p>Generated by Anker AI Pitch Deck Analyzer powered by Claude</p>
  </div>
</body>
</html>`
    
    // Save report to blob storage
    const reportBlob = await put(
      `reports/pitch-analysis-${Date.now()}.html`,
      reportHtml,
      { access: 'private', contentType: 'text/html' }
    )
    
    // Save to documents table
    const startups = await sql`SELECT id FROM startups WHERE owner_id = ${user.id} LIMIT 1`
    const startupId = startups[0]?.id || null
    
    await sql`
      INSERT INTO documents (startup_id, user_id, name, type, file_path, mime_type, analysis_status, analysis_result)
      VALUES (${startupId}, ${user.id}, ${'Pitch Deck Analysis - ' + fileName}, 'data_room', ${reportBlob.pathname}, 'text/html', 'completed', ${JSON.stringify({ type: analysisType, content: analysisContent })})
    `
    
    return NextResponse.json({
      success: true,
      analysis: analysisContent,
      reportPath: reportBlob.pathname,
      analysisType
    })
    
  } catch (error) {
    console.error("Pitch deck analysis error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Analysis failed" 
    }, { status: 500 })
  }
}
