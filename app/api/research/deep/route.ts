import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

// Get user's Mistral API key from settings
async function getMistralKey(userId: string): Promise<string | null> {
  try {
    const result = await sql`SELECT mistral_api_key FROM user_settings WHERE user_id = ${userId}`
    return result[0]?.mistral_api_key || null
  } catch {
    return null
  }
}

// Check if user is admin
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const result = await sql`SELECT is_admin FROM profiles WHERE id = ${userId}`
    return result[0]?.is_admin === true
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  // Check admin status for certain operations
  const admin = await isAdmin(user.id)
  
  try {
    const body = await request.json()
    const { researchType, target, options } = body
    
    // Get user's Mistral API key
    const mistralKey = await getMistralKey(user.id)
    if (!mistralKey) {
      return NextResponse.json({ 
        error: "Mistral API key not configured. Please add your API key in Settings > API Keys." 
      }, { status: 400 })
    }
    
    // Build research prompt based on type
    let systemPrompt = ""
    let userPrompt = ""
    
    switch (researchType) {
      case "investor_profile":
        systemPrompt = `You are an expert investment research analyst. Provide comprehensive research on the investor or investment firm.`
        userPrompt = `Research this investor/firm thoroughly: "${target}"
        
Provide:
1. **Background** - History, founding, key milestones
2. **Investment Focus** - Sectors, stages, geography
3. **Notable Investments** - Top 10 portfolio companies
4. **Investment Team** - Key partners and their backgrounds
5. **Investment Process** - How they evaluate deals
6. **Check Size & Terms** - Typical investment size and terms
7. **Recent Activity** - Last 12 months of investments
8. **Contact Strategy** - Best ways to reach them
9. **Reputation** - Founder-friendliness, value-add
10. **Red Flags** - Any concerns to be aware of

${options?.url ? `\nWebsite to reference: ${options.url}` : ''}`
        break
        
      case "url_verification":
        if (!admin) {
          return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }
        systemPrompt = `You are a data verification specialist. Verify and extract accurate information from websites.`
        userPrompt = `Verify the information at this URL: ${target}
        
Check for:
1. **URL Status** - Is the URL valid and accessible?
2. **Company/Person Match** - Does the content match expected entity?
3. **Contact Information** - Extract emails, phone, addresses
4. **Social Links** - LinkedIn, Twitter, other profiles
5. **Recent Updates** - When was content last updated?
6. **Data Accuracy** - Flag any inconsistencies
7. **Additional Sources** - Other URLs to verify

Return structured verification results.`
        break
        
      case "company_research":
        systemPrompt = `You are a startup research analyst specializing in competitive intelligence.`
        userPrompt = `Research this company thoroughly: "${target}"
        
Provide:
1. **Company Overview** - What they do, founding date, location
2. **Funding History** - All funding rounds, investors, amounts
3. **Team** - Key executives and their backgrounds
4. **Product/Service** - Core offering, pricing, customers
5. **Market Position** - Competitors, market share, differentiation
6. **Traction** - Users, revenue, growth metrics
7. **Technology** - Tech stack, patents, innovations
8. **News & Press** - Recent coverage, announcements
9. **Risks** - Potential challenges, red flags
10. **Valuation Estimate** - Based on comparables

${options?.url ? `\nWebsite to reference: ${options.url}` : ''}`
        break
        
      case "market_analysis":
        systemPrompt = `You are a market research expert with deep knowledge of venture capital and startups.`
        userPrompt = `Analyze this market/sector: "${target}"
        
Provide:
1. **Market Size** - TAM, SAM, SOM estimates
2. **Growth Rate** - Historical and projected CAGR
3. **Key Trends** - Major shifts and developments
4. **Major Players** - Top companies by segment
5. **Investment Activity** - VC funding trends, notable deals
6. **Barriers to Entry** - What it takes to compete
7. **Regulatory Environment** - Key regulations, compliance
8. **Technology Drivers** - Enabling technologies
9. **Customer Dynamics** - Buyer behavior, preferences
10. **Opportunities** - White spaces, underserved segments
11. **Risks** - Market risks, disruption threats
12. **Outlook** - 5-year forecast`
        break
        
      case "email_finder":
        if (!admin) {
          return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }
        systemPrompt = `You are an expert at finding professional contact information.`
        userPrompt = `Find email and contact information for: "${target}"
        
Look for:
1. **Primary Email** - Most likely business email
2. **Email Patterns** - Company email format (first.last@, etc.)
3. **LinkedIn Profile** - Professional profile URL
4. **Twitter/X** - Social media handle
5. **Phone** - If publicly available
6. **Assistant Contact** - EA or assistant info
7. **Best Contact Method** - Recommended approach
8. **Verification** - Confidence level in the information

Note: Only provide publicly available information.`
        break
        
      default:
        systemPrompt = `You are a helpful research assistant.`
        userPrompt = `Research the following: "${target}"\n\n${options?.prompt || 'Provide comprehensive information.'}`
    }
    
    // Call Mistral API
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mistralKey}`
      },
      body: JSON.stringify({
        model: options?.model || "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4096
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Mistral API error: ${error}`)
    }
    
    const result = await response.json()
    const researchContent = result.choices[0]?.message?.content || ""
    
    return NextResponse.json({
      success: true,
      research: researchContent,
      researchType,
      target,
      model: options?.model || "mistral-large-latest",
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error("Deep research error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Research failed" 
    }, { status: 500 })
  }
}
