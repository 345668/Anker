import { db } from "../db";
import { researchDocuments, investmentSignals, documentChunks } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";

// Signal extraction service using AI to identify investment signals from research documents

const SIGNAL_EXTRACTION_PROMPT = `You are an investment analyst extracting key investment signals from research documents. 
Analyze the following text and extract any investment-relevant data points.

For each signal found, provide:
1. signal_type: One of (market_size, growth_rate, risk, trend, regulatory, timing, valuation, margin, adoption, competitive)
2. signal_category: More specific category (TAM, SAM, SOM, CAGR, NPM, GPM, penetration, etc.)
3. raw_text: The exact text containing the signal
4. normalized_value: The numeric/structured value if applicable
5. unit: The unit of measurement (%, $B, $M, years, etc.)
6. sector: The industry/sector this applies to
7. geography: The region/country if mentioned
8. timeframe: The time period referenced

Return as JSON array. Only include signals with concrete, verifiable data points.
Example:
[
  {
    "signal_type": "market_size",
    "signal_category": "TAM",
    "raw_text": "The global AI market is projected to reach $407 billion by 2027",
    "normalized_value": "407",
    "unit": "$B",
    "sector": "Artificial Intelligence",
    "geography": "Global",
    "timeframe": "2027"
  }
]

Text to analyze:
`;

export interface ExtractedSignal {
  signal_type: string;
  signal_category?: string;
  raw_text: string;
  normalized_value?: string;
  unit?: string;
  sector?: string;
  geography?: string;
  timeframe?: string;
  confidence?: number;
}

class SignalExtractionService {
  private mistralApiKey: string | undefined;

  constructor() {
    this.mistralApiKey = process.env.MISTRAL_API_KEY;
  }

  // Extract signals using AI
  async extractSignalsFromText(text: string, sourceWeight: number = 0.8): Promise<ExtractedSignal[]> {
    if (!this.mistralApiKey) {
      console.warn("[SignalExtraction] No MISTRAL_API_KEY configured, using rule-based extraction");
      return this.extractSignalsRuleBased(text, sourceWeight);
    }

    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.mistralApiKey}`,
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          messages: [
            {
              role: "user",
              content: SIGNAL_EXTRACTION_PROMPT + text.substring(0, 8000),
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Mistral API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "[]";
      
      // Parse JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.extractSignalsRuleBased(text, sourceWeight);
      }

      const signals: ExtractedSignal[] = JSON.parse(jsonMatch[0]);
      return signals.map(s => ({
        ...s,
        confidence: 0.85 * sourceWeight,
      }));
    } catch (error) {
      console.error("[SignalExtraction] AI extraction failed:", error);
      return this.extractSignalsRuleBased(text, sourceWeight);
    }
  }

  // Rule-based fallback extraction
  extractSignalsRuleBased(text: string, sourceWeight: number): ExtractedSignal[] {
    const signals: ExtractedSignal[] = [];

    // Market size patterns
    const marketSizePatterns = [
      /(?:market|industry|sector)(?:\s+(?:is|will|expected|projected|estimated))?(?:\s+(?:to|be))?\s+(?:reach|worth|valued at|grow to)\s*\$?([\d,.]+)\s*(billion|million|trillion|B|M|T)/gi,
      /\$?([\d,.]+)\s*(billion|million|trillion|B|M|T)\s+(?:market|industry|opportunity|TAM|SAM)/gi,
      /TAM\s+(?:of|is|:)\s*\$?([\d,.]+)\s*(billion|million|trillion|B|M|T)/gi,
    ];

    for (const pattern of marketSizePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1].replace(/,/g, "");
        const unit = this.normalizeUnit(match[2]);
        signals.push({
          signal_type: "market_size",
          signal_category: "TAM",
          raw_text: match[0].trim(),
          normalized_value: value,
          unit,
          confidence: 0.7 * sourceWeight,
        });
      }
    }

    // CAGR patterns
    const cagrPatterns = [
      /CAGR\s+(?:of|:)?\s*([\d.]+)%/gi,
      /(?:compound annual growth rate|growth rate)\s+(?:of|:)?\s*([\d.]+)%/gi,
      /(?:grow(?:ing)?|expand(?:ing)?)\s+(?:at|by)\s*([\d.]+)%\s*(?:annually|per year|CAGR)/gi,
    ];

    for (const pattern of cagrPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        signals.push({
          signal_type: "growth_rate",
          signal_category: "CAGR",
          raw_text: match[0].trim(),
          normalized_value: match[1],
          unit: "%",
          confidence: 0.75 * sourceWeight,
        });
      }
    }

    // Risk patterns
    const riskPatterns = [
      /(?:key|major|significant|critical)\s+(?:risk|challenge|threat|concern)[s]?\s*(?:include|:|\s)+([^.]+)/gi,
      /(?:risk|challenge)[s]?\s+(?:such as|including|like)\s+([^.]+)/gi,
    ];

    for (const pattern of riskPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        signals.push({
          signal_type: "risk",
          raw_text: match[0].trim(),
          confidence: 0.6 * sourceWeight,
        });
      }
    }

    // Trend patterns
    const trendPatterns = [
      /(?:emerging|key|major|growing)\s+trend[s]?\s*(?:include|:|\s)+([^.]+)/gi,
      /trend[s]?\s+(?:toward|in|of)\s+([^.]+)/gi,
    ];

    for (const pattern of trendPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        signals.push({
          signal_type: "trend",
          raw_text: match[0].trim(),
          confidence: 0.65 * sourceWeight,
        });
      }
    }

    // Timeframe patterns
    const timeframePatterns = [
      /by\s+(20\d{2})/gi,
      /(20\d{2})[-–](20\d{2})/gi,
      /(?:through|until|to)\s+(20\d{2})/gi,
    ];

    for (const signal of signals) {
      for (const pattern of timeframePatterns) {
        const match = pattern.exec(signal.raw_text);
        if (match) {
          signal.timeframe = match[0];
          break;
        }
      }
    }

    return signals;
  }

  private normalizeUnit(unit: string): string {
    const normalized = unit.toLowerCase();
    if (normalized === "billion" || normalized === "b") return "$B";
    if (normalized === "million" || normalized === "m") return "$M";
    if (normalized === "trillion" || normalized === "t") return "$T";
    return unit;
  }

  // Process a document and extract signals
  async processDocument(documentId: string): Promise<{ signalsExtracted: number; error?: string }> {
    try {
      const [doc] = await db.select()
        .from(researchDocuments)
        .where(eq(researchDocuments.id, documentId));

      if (!doc) {
        return { signalsExtracted: 0, error: "Document not found" };
      }

      // Get document chunks
      const chunks = await db.select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .orderBy(documentChunks.chunkIndex);

      let totalSignals = 0;
      const sourceWeight = doc.confidenceScore || 0.5;

      for (const chunk of chunks) {
        if (!chunk.text || chunk.text.length < 100) continue;

        const signals = await this.extractSignalsFromText(chunk.text, sourceWeight);
        
        for (const signal of signals) {
          await db.insert(investmentSignals).values({
            documentId,
            signalType: signal.signal_type,
            signalCategory: signal.signal_category,
            sector: signal.sector,
            geography: signal.geography,
            rawText: signal.raw_text,
            normalizedValue: signal.normalized_value,
            unit: signal.unit,
            timeframe: signal.timeframe,
            confidenceScore: signal.confidence || 0.5,
            sourceWeight,
            extractedBy: "ai",
          });
          totalSignals++;
        }
      }

      // Update document processing status
      await db.update(researchDocuments)
        .set({ 
          processingStatus: "completed",
          processedAt: new Date(),
        })
        .where(eq(researchDocuments.id, documentId));

      return { signalsExtracted: totalSignals };
    } catch (error: any) {
      console.error("[SignalExtraction] Error processing document:", error);
      return { signalsExtracted: 0, error: error.message };
    }
  }

  // Get signals summary
  async getSignalsSummary() {
    const total = await db.select({ count: sql<number>`count(*)` }).from(investmentSignals);
    
    const byType = await db.select({
      signalType: investmentSignals.signalType,
      count: sql<number>`count(*)`,
    })
      .from(investmentSignals)
      .groupBy(investmentSignals.signalType);

    const bySector = await db.select({
      sector: investmentSignals.sector,
      count: sql<number>`count(*)`,
    })
      .from(investmentSignals)
      .where(sql`${investmentSignals.sector} IS NOT NULL`)
      .groupBy(investmentSignals.sector)
      .limit(10);

    const highConfidence = await db.select({ count: sql<number>`count(*)` })
      .from(investmentSignals)
      .where(sql`${investmentSignals.confidenceScore} > 0.7`);

    return {
      total: total[0]?.count || 0,
      byType,
      bySector,
      highConfidence: highConfidence[0]?.count || 0,
    };
  }

  // Get recent signals
  async getRecentSignals(limit: number = 20) {
    return db.select({
      id: investmentSignals.id,
      signalType: investmentSignals.signalType,
      signalCategory: investmentSignals.signalCategory,
      rawText: investmentSignals.rawText,
      normalizedValue: investmentSignals.normalizedValue,
      unit: investmentSignals.unit,
      sector: investmentSignals.sector,
      geography: investmentSignals.geography,
      timeframe: investmentSignals.timeframe,
      confidenceScore: investmentSignals.confidenceScore,
      createdAt: investmentSignals.createdAt,
    })
      .from(investmentSignals)
      .orderBy(desc(investmentSignals.createdAt))
      .limit(limit);
  }

  // Process all pending documents
  async processAllPendingDocuments(): Promise<{ processed: number; signalsExtracted: number }> {
    const pendingDocs = await db.select()
      .from(researchDocuments)
      .where(eq(researchDocuments.processingStatus, "processed"));

    let processed = 0;
    let totalSignals = 0;

    for (const doc of pendingDocs) {
      const result = await this.processDocument(doc.id);
      if (!result.error) {
        processed++;
        totalSignals += result.signalsExtracted;
      }
    }

    return { processed, signalsExtracted: totalSignals };
  }
}

export const signalExtractionService = new SignalExtractionService();
