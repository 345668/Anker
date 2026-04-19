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

// Get user settings for context
async function getUserSettings(userId: string) {
  try {
    const result = await sql`SELECT * FROM user_settings WHERE user_id = ${userId}`
    return result[0] || null
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
    const body = await request.json()
    const { documentType, context } = body
    
    // Get user's Anthropic API key
    const anthropicKey = await getAnthropicKey(user.id)
    if (!anthropicKey) {
      return NextResponse.json({ 
        error: "Anthropic API key not configured. Please add your API key in Settings > API Keys." 
      }, { status: 400 })
    }
    
    // Get user settings for company context
    const settings = await getUserSettings(user.id)
    
    // Build document generation prompt based on type
    const prompts: Record<string, { system: string; user: string; filename: string }> = {
      executive_summary: {
        system: `You are an expert startup consultant specializing in creating compelling executive summaries for fundraising. Generate professional, concise documents that capture investor attention.`,
        user: `Create a professional Executive Summary document for the following company:

Company: ${settings?.company_name || context?.companyName || 'Company Name'}
Industry: ${settings?.company_industry || context?.industry || 'Technology'}
Stage: ${settings?.company_stage || context?.stage || 'Seed'}
One-liner: ${settings?.company_one_liner || context?.oneLiner || ''}
Description: ${settings?.company_description || context?.description || ''}
Target Raise: $${((settings?.target_raise || context?.targetRaise || 0) / 1000000).toFixed(1)}M
Current ARR: $${((settings?.current_arr || context?.currentArr || 0) / 1000).toFixed(0)}K

Additional context: ${context?.additionalContext || 'None provided'}

Create a compelling 1-2 page executive summary that includes:
1. Company Overview
2. Problem & Solution
3. Market Opportunity
4. Business Model
5. Traction & Milestones
6. Team Highlights
7. Funding Ask & Use of Funds

Format the output as clean HTML with professional styling.`,
        filename: 'Executive-Summary'
      },
      
      investment_memo: {
        system: `You are an investment analyst at a top-tier VC firm. Generate comprehensive investment memos that would be used internally to evaluate deals.`,
        user: `Create an Investment Memo for the following opportunity:

Company: ${settings?.company_name || context?.companyName || 'Company Name'}
Industry: ${settings?.company_industry || context?.industry || 'Technology'}
Stage: ${settings?.company_stage || context?.stage || 'Seed'}
Description: ${settings?.company_description || context?.description || ''}
Target Raise: $${((settings?.target_raise || context?.targetRaise || 0) / 1000000).toFixed(1)}M

Additional context: ${context?.additionalContext || 'None provided'}

Create a comprehensive investment memo including:
1. Executive Summary
2. Company Background
3. Product & Technology
4. Market Analysis (TAM/SAM/SOM)
5. Business Model & Unit Economics
6. Competitive Landscape
7. Team Assessment
8. Traction & KPIs
9. Financial Projections
10. Key Risks & Mitigations
11. Deal Terms
12. Investment Recommendation

Format the output as clean HTML with professional styling.`,
        filename: 'Investment-Memo'
      },
      
      due_diligence_checklist: {
        system: `You are an expert in startup due diligence. Generate comprehensive checklists used by professional investors.`,
        user: `Create a Due Diligence Checklist for evaluating:

Company: ${settings?.company_name || context?.companyName || 'Startup'}
Industry: ${settings?.company_industry || context?.industry || 'Technology'}
Stage: ${settings?.company_stage || context?.stage || 'Seed'}

Generate a comprehensive due diligence checklist organized by category:
1. Legal & Corporate
2. Financial & Accounting
3. Product & Technology
4. Market & Competition
5. Team & HR
6. Customer & Revenue
7. Operations
8. Intellectual Property
9. Regulatory & Compliance
10. Key Questions for Founders

Include specific items to verify, documents to request, and questions to ask.

Format the output as clean HTML with checkboxes and professional styling.`,
        filename: 'Due-Diligence-Checklist'
      },
      
      term_sheet_template: {
        system: `You are an experienced startup lawyer specializing in venture capital transactions.`,
        user: `Generate a Term Sheet Template for a ${settings?.company_stage || context?.stage || 'Seed'} round:

Company: ${settings?.company_name || context?.companyName || 'Company'}
Raise Amount: $${((settings?.target_raise || context?.targetRaise || 0) / 1000000).toFixed(1)}M

Create a standard term sheet template with common terms for this stage, including:
1. Offering Terms (Amount, Type of Security, Valuation)
2. Investor Rights
3. Board Composition
4. Protective Provisions
5. Anti-dilution Provisions
6. Dividend Policy
7. Liquidation Preference
8. Redemption Rights
9. Conversion Rights
10. Information Rights
11. Registration Rights
12. Right of First Refusal
13. Drag-Along/Tag-Along
14. Founder Vesting
15. Option Pool

Include standard market terms for the stage with explanatory notes.

Format the output as clean HTML with professional legal document styling.`,
        filename: 'Term-Sheet-Template'
      },
      
      company_overview: {
        system: `You are a startup marketing expert specializing in creating compelling company profiles.`,
        user: `Create a Company Overview document for:

Company: ${settings?.company_name || context?.companyName || 'Company'}
Industry: ${settings?.company_industry || context?.industry || 'Technology'}
Stage: ${settings?.company_stage || context?.stage || 'Early'}
One-liner: ${settings?.company_one_liner || context?.oneLiner || ''}
Description: ${settings?.company_description || context?.description || ''}

Generate a professional company overview including:
1. Mission & Vision
2. Company Story
3. Core Values
4. Product/Service Overview
5. Key Differentiators
6. Target Market
7. Achievements & Milestones
8. Team Highlights
9. Contact Information

Format the output as clean HTML with modern, professional styling suitable for sharing with investors and partners.`,
        filename: 'Company-Overview'
      }
    }
    
    const prompt = prompts[documentType]
    if (!prompt) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 })
    }
    
    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    
    // Generate document
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        { role: "user", content: prompt.user }
      ],
      system: prompt.system
    })
    
    const content = message.content[0].type === 'text' ? message.content[0].text : ''
    
    // Wrap in HTML document
    const htmlDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prompt.filename} - ${settings?.company_name || 'Document'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      line-height: 1.6; 
      color: #1a1a1a; 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 40px 20px;
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 24px; color: #111; }
    h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #333; border-bottom: 2px solid #eee; padding-bottom: 8px; }
    h3 { font-size: 16px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #444; }
    p { margin-bottom: 16px; color: #555; }
    ul, ol { margin-bottom: 16px; padding-left: 24px; }
    li { margin-bottom: 8px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f9f9f9; font-weight: 600; }
    .meta { color: #888; font-size: 12px; margin-bottom: 32px; }
    .highlight { background: #f0f9ff; padding: 16px; border-left: 4px solid #0ea5e9; margin: 20px 0; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; color: #888; font-size: 12px; }
    input[type="checkbox"] { margin-right: 8px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="meta">
    <strong>${settings?.company_name || 'Document'}</strong> | Generated ${new Date().toLocaleDateString()}
  </div>
  ${content}
  <div class="footer">
    <p>Generated by Anker AI | Confidential</p>
  </div>
</body>
</html>`
    
    // Save to blob storage
    const timestamp = Date.now()
    const filename = `${prompt.filename}-${timestamp}.html`
    const blob = await put(
      `documents/${user.id}/${filename}`,
      htmlDocument,
      { access: 'private', contentType: 'text/html' }
    )
    
    // Save to documents table
    const startups = await sql`SELECT id FROM startups WHERE owner_id = ${user.id} LIMIT 1`
    const startupId = startups[0]?.id || null
    
    const doc = await sql`
      INSERT INTO documents (startup_id, user_id, name, type, file_path, mime_type)
      VALUES (${startupId}, ${user.id}, ${prompt.filename}, 'data_room', ${blob.pathname}, 'text/html')
      RETURNING *
    `
    
    return NextResponse.json({
      success: true,
      document: doc[0],
      url: blob.url,
      filename: prompt.filename
    })
    
  } catch (error) {
    console.error("Document generation error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Generation failed" 
    }, { status: 500 })
  }
}
