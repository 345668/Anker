import type { Startup, Investor, InvestmentFirm, Match } from "@shared/schema";

interface IntroGenerationContext {
  startup?: Startup | null;
  investor?: Investor | null;
  firm?: InvestmentFirm | null;
  match?: Match | null;
  founderName?: string;
  customNotes?: string;
}

interface IntroGenerationResult {
  message: string;
  subject: string;
  tokensUsed: number;
  confidence: number;
}

class IntroGenerationService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private model = "mistral-large-latest";

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || "";
  }

  async generateIntroMessage(context: IntroGenerationContext): Promise<IntroGenerationResult> {
    if (!this.apiKey) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    const { startup, investor, firm, match, founderName, customNotes } = context;

    const startupInfo = startup ? {
      name: startup.name,
      industry: startup.industry,
      stage: startup.stage,
      location: startup.location,
      description: startup.description,
      targetAmount: startup.targetAmount,
    } : null;

    const investorInfo = investor ? {
      name: [investor.firstName, investor.lastName].filter(Boolean).join(" "),
      title: investor.title,
      focus: investor.investmentFocus,
    } : null;

    const firmInfo = firm ? {
      name: firm.name,
      type: firm.type,
      sectors: firm.sectors,
      stages: firm.stages,
      checkSize: firm.checkSizeMin && firm.checkSizeMax 
        ? `$${(firm.checkSizeMin / 1000000).toFixed(1)}M - $${(firm.checkSizeMax / 1000000).toFixed(1)}M`
        : null,
    } : null;

    const matchInfo = match ? {
      score: match.matchScore,
      reasons: match.matchReasons,
    } : null;

    const systemPrompt = `You are an expert at crafting warm introduction emails for venture capital fundraising. 
Your goal is to create compelling, personalized, and professional introduction requests that:
1. Are concise (2-3 short paragraphs max)
2. Highlight relevant alignment between the startup and investor
3. Include a clear ask and value proposition
4. Sound authentic and warm, not templated
5. Reference specific match reasons when available

Respond in JSON format with "subject" and "message" fields.`;

    const userPrompt = `Generate a warm introduction email for a startup founder seeking an introduction to an investor.

STARTUP INFORMATION:
${startupInfo ? JSON.stringify(startupInfo, null, 2) : "Not provided"}

INVESTOR INFORMATION:
${investorInfo ? JSON.stringify(investorInfo, null, 2) : "Not provided"}

INVESTMENT FIRM:
${firmInfo ? JSON.stringify(firmInfo, null, 2) : "Not provided"}

MATCH DETAILS:
${matchInfo ? JSON.stringify(matchInfo, null, 2) : "Not provided"}

FOUNDER NAME: ${founderName || "The founder"}

${customNotes ? `ADDITIONAL CONTEXT FROM FOUNDER: ${customNotes}` : ""}

Generate a warm, personalized introduction email that the founder can send to request an introduction to this investor. The email should feel authentic and highlight why this is a great fit.`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const tokensUsed = data.usage?.total_tokens || 0;

    try {
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      
      return {
        message: parsed.message || this.getFallbackMessage(context),
        subject: parsed.subject || this.getFallbackSubject(context),
        tokensUsed,
        confidence: 0.85,
      };
    } catch (e) {
      console.error("[IntroGeneration] Failed to parse Mistral response:", e);
      return {
        message: this.getFallbackMessage(context),
        subject: this.getFallbackSubject(context),
        tokensUsed,
        confidence: 0.5,
      };
    }
  }

  private getFallbackMessage(context: IntroGenerationContext): string {
    const { startup, investor, firm, founderName } = context;
    const investorName = investor 
      ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
      : "the investor";
    const firmName = firm?.name || "your firm";
    const startupName = startup?.name || "our startup";
    const industry = startup?.industry || "our industry";

    return `Hi,

I'm ${founderName || "a founder"} at ${startupName}, and I'm reaching out because I believe there's a strong alignment between what we're building and ${firmName}'s investment focus in ${industry}.

${startup?.description ? `We're ${startup.description.slice(0, 200)}...` : "We're building something exciting that I'd love to share with you."}

I'd be grateful for the opportunity to connect with ${investorName} to explore whether there might be a fit. Would you be open to making an introduction?

Thank you for considering this request.

Best regards,
${founderName || "The Founder"}`;
  }

  private getFallbackSubject(context: IntroGenerationContext): string {
    const { startup, firm } = context;
    const startupName = startup?.name || "Startup";
    const firmName = firm?.name || "Investment Opportunity";
    return `Introduction Request: ${startupName} → ${firmName}`;
  }
}

export const introGenerationService = new IntroGenerationService();
