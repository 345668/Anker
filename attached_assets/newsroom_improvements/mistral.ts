      console.error("[NewsroomAI] API key not configured");
      return null;
    }

    const startTime = Date.now();

    const systemPrompt = `You are an institutional-grade financial analyst. You analyze investment research reports, M&A outlooks, and private capital market publications. Your task is to:

1. Extract the source/publisher from the document (look for company logos, headers, footers, authorship)
2. Generate a professional headline that captures the main insight
3. Create a concise executive summary (3-4 bullet points)
4. Summarize the key findings into a well-structured article
5. Categorize the content appropriately
6. Generate proper APA 7th edition citation

For source extraction:
- Look for company names like "JP Morgan", "Goldman Sachs", "McKinsey", etc.
- Check the document header, footer, or watermarks
- If no source found in text, try to extract from the filename

You MUST return valid JSON with these fields:
{
  "headline": "Professional headline summarizing the key insight",
  "executiveSummary": "• Bullet point 1\\n• Bullet point 2\\n• Bullet point 3",
  "content": "Well-structured markdown article summarizing the report's key findings",
  "blogType": "Insights|Trends|Guides|Analysis",
  "capitalType": "VC|PE|Growth|FoF|IB|FO|SWF",
  "capitalStage": "Pre-Seed|Seed|Series A|Series B|Series C|Late-Stage|Growth|All Stages",
  "geography": "North America|Europe|MENA|APAC|LATAM|Africa|Global",
  "eventType": "Fund Close|Capital Raise|New Fund Launch|M&A|IPO|Regulatory|Strategy|Market Outlook",
  "tags": ["relevant", "topic", "tags"],
  "source": {
    "publisher": "Source organization name",
    "title": "Original document title",
    "date": "Publication date if found (YYYY-MM-DD format)",
    "authors": ["Author names if found"]
  }
}`;

    const userPrompt = `Analyze this investment research report and generate a newsroom article.

Filename: ${filename}

Document Content (first 8000 characters):
${extractedText.substring(0, 8000)}

Please:
1. Identify the source/publisher from the document or filename
2. Generate a compelling but institutional headline
3. Create a thorough summary of the key findings
4. Categorize appropriately for a private capital newsroom
5. Extract any publication date or authorship information

Return your analysis as valid JSON.`;

    try {
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
          temperature: 0.5,
          max_tokens: 3000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("[NewsroomAI] PDF analysis API error:", error);
        return null;
      }

      const data = await response.json() as MistralResponse;
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        console.error("[NewsroomAI] No content in PDF analysis response");
        return null;
      }

      const parsed = JSON.parse(content);
      const wordCount = parsed.content?.split(/\s+/).length || 0;

      const sourceInfo = parsed.source || {};
      const publisher = sourceInfo.publisher || this.extractPublisherFromFilename(filename);
      const publicationDate = sourceInfo.date || new Date().toISOString().split('T')[0];
      const docTitle = sourceInfo.title || parsed.headline || filename.replace(/_/g, ' ').replace(/\.pdf$/i, '');

      const citation = `${publisher}. (${new Date(publicationDate).getFullYear()}). ${docTitle}. Retrieved from uploaded document.`;

      return {
        headline: parsed.headline || "Investment Research Report Analysis",
        executiveSummary: parsed.executiveSummary || "",
        content: parsed.content || "",
        blogType: parsed.blogType || "Analysis",
        capitalType: parsed.capitalType || "PE",
        capitalStage: parsed.capitalStage || "All Stages",
        geography: parsed.geography || "Global",
        eventType: parsed.eventType || "Market Outlook",
        tags: parsed.tags || [],
        sources: [{
          title: docTitle,
          url: "",
          publisher: publisher,
          date: publicationDate,
          citation: citation,
        }],
        wordCount,
        tokensUsed: data.usage?.total_tokens || 0,
      };
    } catch (error) {
      console.error("[NewsroomAI] PDF analysis error:", error);
      return null;
    }
  }

  private extractPublisherFromFilename(filename: string): string {
    const cleanName = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/-/g, ' ');
    
    const knownPublishers = [
      "jpmorgan", "jp morgan", "goldman sachs", "morgan stanley", "blackrock",
      "mckinsey", "bcg", "bain", "deloitte", "kpmg", "pwc", "ey",
      "pitchbook", "preqin", "cambridge associates", "burgiss",
      "carta", "crunchbase", "cb insights", "dealroom",
      "a16z", "andreessen", "sequoia", "benchmark", "accel",
    ];
    
    const lowerName = cleanName.toLowerCase();
    for (const publisher of knownPublishers) {
      if (lowerName.includes(publisher)) {
        return publisher.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      }
    }
    
    const words = cleanName.split(' ');
    if (words.length >= 2) {
      const firstTwo = words.slice(0, 2).join(' ');
      if (/^[A-Z]/.test(firstTwo)) {
        return firstTwo;
      }
    }
    
    return "Industry Report";
  }
}

export const newsroomAIService = new NewsroomAIService();
