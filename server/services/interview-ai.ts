import { db } from "../db";
import { eq } from "drizzle-orm";
import { 
  interviews, 
  interviewMessages, 
  interviewScores, 
  interviewFeedback,
  Interview,
  InterviewMessage,
  InterviewScore,
  InterviewFeedback,
  INVESTOR_TYPES,
  INTERVIEW_PHASES,
} from "@shared/schema";

interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface DeckAnalysisResult {
  clarityScore: number;
  consistencyFlags: string[];
  missingSections: string[];
  redFlags: string[];
  extractedData: {
    problemStatement?: string;
    solution?: string;
    marketSize?: string;
    businessModel?: string;
    traction?: string;
    competitiveLandscape?: string;
    ask?: string;
  };
}

interface InterviewQuestion {
  phase: string;
  questionType: string;
  question: string;
  followUpContext?: string;
}

interface EvaluationResult {
  marketUnderstanding: number;
  businessModel: number;
  tractionMetrics: number;
  founderClarity: number;
  strategicFit: number;
  riskAwareness: number;
  overallScore: number;
  investorReadiness: string;
  riskLevel: string;
  keyConcerns: string[];
  followUpRequired: boolean;
}

interface FeedbackResult {
  executiveSummary: string;
  strengths: string[];
  criticalGaps: string[];
  redFlags: string[];
  deckImprovements: string[];
  nextSteps: string[];
  recommendedInvestorTypes: string[];
  fullFeedback: string;
}

class InterviewAIService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";
  private model = "mistral-large-latest";

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || "";
  }

  private async callMistral(
    messages: Array<{ role: string; content: string }>,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
  ): Promise<{ content: string; tokensUsed: number }> {
    if (!this.apiKey) {
      throw new Error("MISTRAL_API_KEY not configured");
    }

    const body: any = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as MistralResponse;
    return {
      content: data.choices[0]?.message?.content || "",
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  async analyzeDeck(deckContent: string): Promise<DeckAnalysisResult> {
    const systemPrompt = `You are the Deck Intelligence Agent - an expert venture capital analyst who evaluates pitch decks with institutional-grade rigor.

Your task is to analyze the pitch deck content and extract key information while identifying gaps and red flags.

Always respond with valid JSON containing:
- clarityScore: number 0-100 (how clear and well-structured the deck is)
- consistencyFlags: array of strings (any contradictions or inconsistencies found)
- missingSections: array of strings (critical sections that are missing)
- redFlags: array of strings (concerns that would make investors hesitant)
- extractedData: object with the following optional fields:
  - problemStatement: the problem being solved
  - solution: the proposed solution and differentiation
  - marketSize: TAM/SAM/SOM information
  - businessModel: how the company makes money
  - traction: key metrics and milestones
  - competitiveLandscape: competitors and positioning
  - ask: funding ask and use of funds

Be thorough but fair. Extract as much relevant information as possible.`;

    const prompt = `Analyze this pitch deck content and provide a comprehensive assessment:

${deckContent}

Return JSON with clarityScore, consistencyFlags, missingSections, redFlags, and extractedData.`;

    const { content } = await this.callMistral(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, jsonMode: true }
    );

    return JSON.parse(content);
  }

  async checkFounderConsistency(
    founderProfile: Record<string, any>,
    deckAnalysis: DeckAnalysisResult | null
  ): Promise<{ isConsistent: boolean; inconsistencies: string[] }> {
    const systemPrompt = `You are the Founder Consistency Agent - an expert at cross-referencing founder claims with available data.

Your task is to identify any contradictions or inconsistencies between what the founder claims and what the data shows.

Always respond with valid JSON containing:
- isConsistent: boolean (true if no major inconsistencies)
- inconsistencies: array of strings (specific contradictions found)

Be precise and only flag genuine inconsistencies, not minor discrepancies.`;

    const prompt = `Cross-check this founder profile against their pitch deck analysis:

FOUNDER PROFILE:
${JSON.stringify(founderProfile, null, 2)}

DECK ANALYSIS:
${deckAnalysis ? JSON.stringify(deckAnalysis, null, 2) : "No deck provided"}

Identify any contradictions between claimed metrics, market size, traction, or other data points.
Return JSON with isConsistent and inconsistencies.`;

    const { content } = await this.callMistral(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, jsonMode: true }
    );

    return JSON.parse(content);
  }

  getInterviewerSystemPrompt(investorTypes: string[]): string {
    const investorContext = this.getInvestorSpecificContext(investorTypes);
    
    return `You are an institutional AI investment interviewer simulating professional private capital investors. You evaluate founders based on their pitch deck, profile, and stated fundraising target.

CORE BEHAVIOR:
- You ask structured, investor-grade questions
- You adapt your questioning style to the target investor type(s): ${investorTypes.join(", ")}
- You surface risks and challenge unclear or inconsistent information
- You score readiness objectively
- You do NOT coach - you ASSESS
- If information is unclear or inconsistent, you challenge it professionally
- Maintain a neutral, institutional tone throughout

${investorContext}

INTERVIEW STRUCTURE:
1. Context Setup (3 min) - Confirm investor type and set expectations
2. Core Pitch Stress Test (10 min) - Business fundamentals
3. Investor-Specific Deep Dive (10 min) - Custom per capital source
4. Risk & Diligence (7 min) - Kill-zone questions
5. Wrap-Up (3-5 min) - Founder reflection

UNIVERSAL CORE QUESTIONS TO COVER:
- Problem & Customer: Who has the problem? How are they solving it today? Why now?
- Solution & Moat: What is defensible? Why you vs incumbents?
- Market: Bottom-up TAM logic, expansion path, geographic scalability
- Traction: What metric matters most? What changed in the last 90 days? What did not work?
- Business Model: Revenue drivers, gross margins, CAC/LTV logic

QUESTION FORMAT:
Ask ONE focused question at a time. Wait for the founder's response before moving on.
After they respond, you may ask a follow-up to probe deeper, then move to the next topic.
Be direct but professional. Challenge weak answers with specific follow-ups.`;
  }

  private getInvestorSpecificContext(investorTypes: string[]): string {
    const contexts: Record<string, string> = {
      "Angel": `ANGEL INVESTOR FOCUS:
- Founder motivation and personal commitment
- Speed of iteration and learning
- Vision clarity and passion
- Personal risk exposure and skin in the game`,

      "Syndicate": `SYNDICATE FOCUS:
- Deal terms and co-investor fit
- Founder track record
- Quick path to next milestone
- Portfolio synergies`,

      "Venture Capital": `VENTURE CAPITAL FOCUS:
- Growth velocity and scaling potential
- Category ownership opportunity
- Fund return math (can this be a 10-100x return?)
- Hiring roadmap and team building
- Competitive moat durability`,

      "Growth Equity": `GROWTH EQUITY FOCUS:
- Unit economics maturity and predictability
- Clear path to profitability
- Operating leverage potential
- Market leadership position
- Management team depth`,

      "Private Equity": `PRIVATE EQUITY FOCUS:
- EBITDA and cash flow stability
- Value creation levers
- Exit optionality
- Customer concentration risks
- Operational improvement potential`,

      "Fund of Funds": `FUND OF FUNDS FOCUS:
- Portfolio fit within broader strategy
- Risk dispersion characteristics
- GP quality signals
- Track record consistency
- Fee structure efficiency`,

      "Family Office": `FAMILY OFFICE FOCUS:
- Capital preservation logic
- Downside protection mechanisms
- Governance maturity
- Long-term value creation
- Alignment with family values/interests`,

      "Sovereign Wealth Fund": `SOVEREIGN WEALTH FUND FOCUS:
- Strategic alignment with national interests
- Geographic importance and presence
- Long-term durability (10+ year horizon)
- Regulatory exposure and compliance
- Economic development impact`,

      "Corporate VC": `CORPORATE VC FOCUS:
- Strategic fit with parent company
- Integration potential
- Competitive intelligence value
- Market expansion opportunities
- Technology synergies`,

      "Development Finance Institution": `DFI FOCUS:
- Development impact metrics
- ESG compliance and reporting
- Job creation potential
- Local market development
- Sustainable business model`,
    };

    return investorTypes
      .map(type => contexts[type] || "")
      .filter(Boolean)
      .join("\n\n");
  }

  async generateNextQuestion(
    interview: Interview,
    conversationHistory: InterviewMessage[],
    currentPhase: string
  ): Promise<InterviewQuestion> {
    const investorTypes = (interview.targetInvestorTypes as string[]) || ["Venture Capital"];
    const systemPrompt = this.getInterviewerSystemPrompt(investorTypes);
    
    const messages = [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: `INTERVIEW CONTEXT:
Company: ${interview.companyName}
Founder: ${interview.founderName} (${interview.role})
Stage: ${interview.stage}
Target Raise: ${interview.targetRaise}
Industry: ${interview.industry}

Current Phase: ${currentPhase}
Target Investors: ${investorTypes.join(", ")}

${interview.deckAnalysis ? `DECK ANALYSIS SUMMARY:
Clarity Score: ${(interview.deckAnalysis as any).clarityScore}/100
Red Flags: ${((interview.deckAnalysis as any).redFlags || []).join(", ") || "None identified"}
Missing Sections: ${((interview.deckAnalysis as any).missingSections || []).join(", ") || "None"}
` : ""}

Generate your next interview question based on the conversation so far.`
      },
    ];

    conversationHistory.forEach(msg => {
      if (msg.role === "assistant" || msg.role === "user") {
        messages.push({ role: msg.role, content: msg.content });
      }
    });

    messages.push({
      role: "user",
      content: `Based on the conversation so far, generate your next question for the ${currentPhase} phase. 
Ask ONE focused question that probes the founder's understanding and preparedness.
Be direct and professional. If the previous answer was weak or unclear, challenge it.
Just respond with the question - no preamble or explanation.`
    });

    const { content } = await this.callMistral(messages, { temperature: 0.8 });

    let questionType = "general";
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes("problem") || lowerContent.includes("customer")) questionType = "problem_customer";
    else if (lowerContent.includes("solution") || lowerContent.includes("moat") || lowerContent.includes("defensib")) questionType = "solution_moat";
    else if (lowerContent.includes("market") || lowerContent.includes("tam") || lowerContent.includes("sam")) questionType = "market";
    else if (lowerContent.includes("traction") || lowerContent.includes("metric") || lowerContent.includes("growth")) questionType = "traction";
    else if (lowerContent.includes("revenue") || lowerContent.includes("business model") || lowerContent.includes("monetiz")) questionType = "business_model";
    else if (lowerContent.includes("risk") || lowerContent.includes("cap table") || lowerContent.includes("diligence")) questionType = "diligence";

    return {
      phase: currentPhase,
      questionType,
      question: content.trim(),
    };
  }

  async evaluateInterview(
    interview: Interview,
    conversationHistory: InterviewMessage[]
  ): Promise<EvaluationResult> {
    const systemPrompt = `You are the Evaluation Agent - an expert at scoring founder readiness based on interview performance.

Your task is to objectively evaluate the founder's interview responses across multiple dimensions.

SCORING DIMENSIONS (0-100):
1. Market Understanding (20% weight) - Does the founder deeply understand their market?
2. Business Model (15% weight) - Is the business model clear, defensible, and scalable?
3. Traction & Metrics (20% weight) - Are there meaningful metrics and progress?
4. Founder Clarity (15% weight) - Does the founder communicate clearly and confidently?
5. Strategic Fit (15% weight) - Is this a fit for the target investor type(s)?
6. Risk Awareness (15% weight) - Does the founder acknowledge and address risks?

READINESS LEVELS:
- "Not Ready" - Major gaps, needs significant work
- "Pre-Seed Ready" - Early but has potential
- "Seed Ready" - Ready for seed-stage investors
- "Series A Ready" - Ready for Series A conversations
- "Growth Ready" - Ready for growth-stage capital

Always respond with valid JSON containing:
- marketUnderstanding: number 0-100
- businessModel: number 0-100
- tractionMetrics: number 0-100
- founderClarity: number 0-100
- strategicFit: number 0-100
- riskAwareness: number 0-100
- overallScore: number 0-100 (weighted average)
- investorReadiness: string (one of the levels above)
- riskLevel: "Low" | "Medium" | "High"
- keyConcerns: array of strings (top 3-5 concerns)
- followUpRequired: boolean`;

    const conversationText = conversationHistory
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    const prompt = `Evaluate this founder interview:

COMPANY: ${interview.companyName}
FOUNDER: ${interview.founderName}
STAGE: ${interview.stage}
TARGET RAISE: ${interview.targetRaise}
TARGET INVESTORS: ${(interview.targetInvestorTypes as string[] || []).join(", ")}

INTERVIEW TRANSCRIPT:
${conversationText}

Provide a comprehensive evaluation with scores and assessment.
Return JSON with all required fields.`;

    const { content } = await this.callMistral(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, jsonMode: true }
    );

    return JSON.parse(content);
  }

  async generateFeedback(
    interview: Interview,
    conversationHistory: InterviewMessage[],
    evaluation: EvaluationResult
  ): Promise<FeedbackResult> {
    const systemPrompt = `You are the Feedback Agent - an expert at providing institutional-grade investor feedback to founders.

Your task is to generate comprehensive, actionable feedback based on the interview performance.

The feedback should be:
- Direct and honest, but constructive
- Specific with concrete examples from the interview
- Actionable with clear next steps
- Written in the style of an investment memo

Always respond with valid JSON containing:
- executiveSummary: 2-3 paragraph summary of the founder's readiness
- strengths: array of 3-5 specific strengths demonstrated
- criticalGaps: array of 3-5 areas needing improvement
- redFlags: array of concerns that would give investors pause
- deckImprovements: array of specific pitch deck suggestions
- nextSteps: array of recommended actions before next investor meeting
- recommendedInvestorTypes: array of investor types best suited for this company
- fullFeedback: detailed written feedback (500-800 words)`;

    const conversationText = conversationHistory
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");

    const prompt = `Generate comprehensive investor-style feedback for this founder:

COMPANY: ${interview.companyName}
FOUNDER: ${interview.founderName}
STAGE: ${interview.stage}
TARGET RAISE: ${interview.targetRaise}

EVALUATION SCORES:
- Overall: ${evaluation.overallScore}/100
- Market Understanding: ${evaluation.marketUnderstanding}/100
- Business Model: ${evaluation.businessModel}/100
- Traction: ${evaluation.tractionMetrics}/100
- Founder Clarity: ${evaluation.founderClarity}/100
- Strategic Fit: ${evaluation.strategicFit}/100
- Risk Awareness: ${evaluation.riskAwareness}/100
- Readiness Level: ${evaluation.investorReadiness}
- Risk Level: ${evaluation.riskLevel}
- Key Concerns: ${evaluation.keyConcerns.join(", ")}

INTERVIEW TRANSCRIPT:
${conversationText}

Provide detailed, actionable feedback that will help this founder improve.
Return JSON with all required fields.`;

    const { content } = await this.callMistral(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      { temperature: 0.5, jsonMode: true, maxTokens: 4096 }
    );

    return JSON.parse(content);
  }

  async createInterview(data: {
    founderId: string;
    startupId?: string;
    founderName: string;
    companyName: string;
    role?: string;
    industry?: string;
    hqLocation?: string;
    incorporationCountry?: string;
    stage?: string;
    capitalRaisedToDate?: string;
    targetRaise?: string;
    useOfFunds?: string;
    revenue?: string;
    growthRate?: string;
    teamSize?: number;
    previousExits?: string[];
    targetInvestorTypes?: string[];
    targetGeography?: string;
    targetTicketSize?: string;
    investorStrategy?: string;
    pitchDeckUrl?: string;
  }): Promise<Interview> {
    const [interview] = await db.insert(interviews).values({
      ...data,
      status: "pending",
      phase: "setup",
      currentQuestionIndex: 0,
    }).returning();

    return interview;
  }

  async startInterview(interviewId: string): Promise<{ interview: Interview; firstQuestion: InterviewQuestion }> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId));
    if (!interview) throw new Error("Interview not found");

    await db.update(interviews)
      .set({ 
        status: "in_progress", 
        phase: "core_pitch",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId));

    const investorTypes = (interview.targetInvestorTypes as string[]) || ["Venture Capital"];
    const introMessage = `Welcome, ${interview.founderName}. I'm here to conduct an investor readiness interview for ${interview.companyName}. 

I'll be evaluating your pitch from the perspective of ${investorTypes.join(" and ")} investors. This interview will cover your market understanding, business model, traction, and risk awareness.

Let's begin with your core pitch.`;

    await db.insert(interviewMessages).values({
      interviewId,
      role: "assistant",
      content: introMessage,
      phase: "setup",
    });

    const firstQuestion = await this.generateNextQuestion(
      { ...interview, phase: "core_pitch" } as Interview,
      [],
      "core_pitch"
    );

    await db.insert(interviewMessages).values({
      interviewId,
      role: "assistant",
      content: firstQuestion.question,
      phase: firstQuestion.phase,
      questionType: firstQuestion.questionType,
    });

    const [updatedInterview] = await db.select().from(interviews).where(eq(interviews.id, interviewId));
    return { interview: updatedInterview, firstQuestion };
  }

  async submitResponse(interviewId: string, response: string): Promise<{ 
    nextQuestion: InterviewQuestion | null; 
    isComplete: boolean;
    newPhase?: string;
  }> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId));
    if (!interview) throw new Error("Interview not found");

    await db.insert(interviewMessages).values({
      interviewId,
      role: "user",
      content: response,
      phase: interview.phase || "core_pitch",
    });

    const allMessages = await db.select()
      .from(interviewMessages)
      .where(eq(interviewMessages.interviewId, interviewId))
      .orderBy(interviewMessages.createdAt);

    const userResponses = allMessages.filter(m => m.role === "user");
    const questionCount = userResponses.length;

    const phases = ["core_pitch", "investor_deep_dive", "risk_diligence", "wrap_up"];
    const currentPhaseIndex = phases.indexOf(interview.phase || "core_pitch");
    
    const questionsPerPhase = 3;
    const phaseQuestionCount = allMessages.filter(
      m => m.role === "user" && m.phase === interview.phase
    ).length;

    let newPhase = interview.phase;
    if (phaseQuestionCount >= questionsPerPhase && currentPhaseIndex < phases.length - 1) {
      newPhase = phases[currentPhaseIndex + 1];
      await db.update(interviews)
        .set({ phase: newPhase, updatedAt: new Date() })
        .where(eq(interviews.id, interviewId));
    }

    if (newPhase === "wrap_up" && phaseQuestionCount >= questionsPerPhase) {
      await db.update(interviews)
        .set({ 
          status: "completed", 
          phase: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(interviews.id, interviewId));

      return { nextQuestion: null, isComplete: true };
    }

    const nextQuestion = await this.generateNextQuestion(
      { ...interview, phase: newPhase } as Interview,
      allMessages,
      newPhase || "core_pitch"
    );

    await db.insert(interviewMessages).values({
      interviewId,
      role: "assistant",
      content: nextQuestion.question,
      phase: nextQuestion.phase,
      questionType: nextQuestion.questionType,
    });

    await db.update(interviews)
      .set({ 
        currentQuestionIndex: (interview.currentQuestionIndex || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId));

    return { 
      nextQuestion, 
      isComplete: false,
      newPhase: newPhase !== interview.phase ? newPhase || undefined : undefined,
    };
  }

  async completeInterview(interviewId: string): Promise<{
    score: InterviewScore;
    feedback: InterviewFeedback;
  }> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId));
    if (!interview) throw new Error("Interview not found");

    const allMessages = await db.select()
      .from(interviewMessages)
      .where(eq(interviewMessages.interviewId, interviewId))
      .orderBy(interviewMessages.createdAt);

    const evaluation = await this.evaluateInterview(interview, allMessages);

    const [score] = await db.insert(interviewScores).values({
      interviewId,
      marketUnderstanding: evaluation.marketUnderstanding,
      businessModel: evaluation.businessModel,
      tractionMetrics: evaluation.tractionMetrics,
      founderClarity: evaluation.founderClarity,
      strategicFit: evaluation.strategicFit,
      riskAwareness: evaluation.riskAwareness,
      overallScore: evaluation.overallScore,
      investorReadiness: evaluation.investorReadiness,
      riskLevel: evaluation.riskLevel,
      keyConcerns: evaluation.keyConcerns,
      followUpRequired: evaluation.followUpRequired,
    }).returning();

    const feedbackResult = await this.generateFeedback(interview, allMessages, evaluation);

    const [feedback] = await db.insert(interviewFeedback).values({
      interviewId,
      executiveSummary: feedbackResult.executiveSummary,
      strengths: feedbackResult.strengths,
      criticalGaps: feedbackResult.criticalGaps,
      redFlags: feedbackResult.redFlags,
      deckImprovements: feedbackResult.deckImprovements,
      nextSteps: feedbackResult.nextSteps,
      recommendedInvestorTypes: feedbackResult.recommendedInvestorTypes,
      fullFeedback: feedbackResult.fullFeedback,
    }).returning();

    await db.update(interviews)
      .set({ 
        status: "completed",
        phase: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId));

    return { score, feedback };
  }

  async getInterview(interviewId: string): Promise<Interview | null> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, interviewId));
    return interview || null;
  }

  async getInterviewMessages(interviewId: string): Promise<InterviewMessage[]> {
    return await db.select()
      .from(interviewMessages)
      .where(eq(interviewMessages.interviewId, interviewId))
      .orderBy(interviewMessages.createdAt);
  }

  async getInterviewScore(interviewId: string): Promise<InterviewScore | null> {
    const [score] = await db.select().from(interviewScores).where(eq(interviewScores.interviewId, interviewId));
    return score || null;
  }

  async getInterviewFeedback(interviewId: string): Promise<InterviewFeedback | null> {
    const [feedback] = await db.select().from(interviewFeedback).where(eq(interviewFeedback.interviewId, interviewId));
    return feedback || null;
  }

  async getUserInterviews(userId: string): Promise<Interview[]> {
    return await db.select()
      .from(interviews)
      .where(eq(interviews.founderId, userId))
      .orderBy(interviews.createdAt);
  }
}

export const interviewAIService = new InterviewAIService();
