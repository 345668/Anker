const ANKER_KNOWLEDGE_BASE = `
# Anker Platform Knowledge Base

## About Anker
Anker is a modern venture capital platform that connects founders with investors. The platform features:
- AI-powered investor matching
- Deal flow management
- Pitch deck analysis
- Email outreach tools
- CRM with Folk integration
- Interview AI assistant
- Newsroom automation

## Key Features

### For Founders
- **Investor Matching**: AI analyzes your startup profile and pitch deck to find matching investors based on industry focus, stage preference, geographic coverage, and check size.
- **Pitch Deck Analysis**: Upload your pitch deck for AI-powered feedback on structure, content, and improvement suggestions.
- **Deal Rooms**: Collaborative spaces to manage fundraising with document sharing, milestones, and investor communication.
- **Email Outreach**: Send personalized emails to investors with templates and tracking.
- **Interview Assistant**: Practice investor pitches with AI that provides real-time feedback.

### For the Platform
- **Newsroom**: Automated news generation covering startup and VC ecosystem updates.
- **Onboarding**: Guided setup process for new founders to create profiles and submit startups.
- **Analytics Dashboard**: Track fundraising progress, investor engagement, and pipeline metrics.

## How Investor Matching Works
1. Create your startup profile with industry, stage, location, and funding target
2. Upload your pitch deck (optional but recommended)
3. Click "Generate Matches" to find aligned investors
4. Review matches with scores showing industry, stage, location, and check size fit
5. Save promising matches and initiate outreach

## Match Scoring Explained
- **Industry Match (30%)**: How well your sector aligns with investor focus
- **Stage Match (25%)**: Whether investor typically invests at your stage
- **Location Match (20%)**: Geographic fit and market access
- **Check Size Match (15%)**: Alignment between your raise and their typical investment
- **Investor Type (10%)**: Fit between your stage and investor type (angel, VC, etc.)

Matches above 20% are displayed, with higher scores indicating stronger alignment.

## Getting Started
1. Sign up using Replit authentication
2. Complete onboarding to set up your founder profile
3. Add your startup details (name, industry, stage, funding target)
4. Upload pitch deck for enhanced matching
5. Generate investor matches
6. Save matches and start outreach

## Contact & Support
- Email: vc@philippemasindet.com
- Platform: Anker Venture Capital

## FAQ

**Q: How are investors sourced?**
A: We aggregate investor data from various sources including our CRM integration with Folk, public databases, and curated lists of active investors.

**Q: Is my pitch deck data secure?**
A: Yes, pitch decks are analyzed using AI and the content is not stored or shared with third parties.

**Q: What stages do you support?**
A: We support all stages from pre-seed through growth/Series C+.

**Q: How often is investor data updated?**
A: Investor profiles are continuously enriched and updated through our Folk CRM sync.

**Q: Can I export my matches?**
A: Yes, you can save matches and export investor contact information.
`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callMistralAPI(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY not configured");
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-medium-latest",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for the Anker venture capital platform. Use the following knowledge base to answer user questions accurately and helpfully. Be concise but thorough. If asked about something not in the knowledge base, acknowledge that and provide general guidance.

${ANKER_KNOWLEDGE_BASE}

Guidelines:
- Be friendly and professional
- Provide specific, actionable answers
- Reference platform features when relevant
- Keep responses concise (2-4 sentences for simple questions)
- For complex questions, break down the answer into clear steps`
        },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.5,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
}

export async function chat(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<{ response: string; suggestedQuestions: string[] }> {
  const messages: ChatMessage[] = [
    ...conversationHistory.slice(-6),
    { role: 'user', content: userMessage }
  ];

  const response = await callMistralAPI(messages);

  const suggestedQuestions = generateSuggestedQuestions(userMessage);

  return { response, suggestedQuestions };
}

function generateSuggestedQuestions(lastQuestion: string): string[] {
  const questionCategories: Record<string, string[]> = {
    matching: [
      "How can I improve my match score?",
      "What do the match percentages mean?",
      "Can I filter investors by stage?"
    ],
    pitchDeck: [
      "What makes a good pitch deck?",
      "How is my pitch deck analyzed?",
      "Can I upload multiple pitch decks?"
    ],
    outreach: [
      "How do I contact matched investors?",
      "What email templates are available?",
      "How do I track email responses?"
    ],
    general: [
      "How do I get started?",
      "What features are available?",
      "How does investor matching work?"
    ],
    dealRooms: [
      "What are Deal Rooms?",
      "How do I share documents with investors?",
      "Can I track investor activity?"
    ]
  };

  const lowered = lastQuestion.toLowerCase();
  
  if (lowered.includes('match') || lowered.includes('investor') || lowered.includes('score')) {
    return questionCategories.matching;
  }
  if (lowered.includes('pitch') || lowered.includes('deck') || lowered.includes('upload')) {
    return questionCategories.pitchDeck;
  }
  if (lowered.includes('email') || lowered.includes('outreach') || lowered.includes('contact')) {
    return questionCategories.outreach;
  }
  if (lowered.includes('deal') || lowered.includes('room') || lowered.includes('document')) {
    return questionCategories.dealRooms;
  }
  
  return questionCategories.general;
}

export function getQuickAnswers(): Array<{ question: string; answer: string }> {
  return [
    {
      question: "How does investor matching work?",
      answer: "Our AI analyzes your startup profile (industry, stage, location, funding target) and compares it with investor preferences to generate match scores. Matches above 20% are displayed, with higher scores indicating better alignment."
    },
    {
      question: "How do I get started?",
      answer: "Sign up with Replit authentication, complete onboarding to set up your profile, add your startup details, optionally upload a pitch deck, then generate investor matches."
    },
    {
      question: "What features are available?",
      answer: "Anker offers investor matching, pitch deck analysis, deal flow management, email outreach, CRM integration with Folk, interview AI assistant, and newsroom automation."
    },
    {
      question: "How can I improve my match score?",
      answer: "Complete your startup profile with accurate industry tags, funding stage, location, and target amount. Upload a detailed pitch deck to help the AI better understand your business."
    },
    {
      question: "Is my data secure?",
      answer: "Yes, your pitch decks are analyzed using AI and content is not stored or shared with third parties. Your data is protected and only used to generate matches."
    }
  ];
}
