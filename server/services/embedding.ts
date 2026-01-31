import { db } from "../db";
import { vectorEmbeddings, type VectorEmbedding } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_EMBED_URL = "https://api.mistral.ai/v1/embeddings";
const EMBEDDING_MODEL = "mistral-embed";
const EMBEDDING_DIMENSIONS = 1024;

interface EmbeddingResponse {
  id: string;
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!MISTRAL_API_KEY) {
    console.warn("[Embedding] No MISTRAL_API_KEY configured, skipping embedding generation");
    return null;
  }

  if (!text || text.trim().length === 0) {
    return null;
  }

  const cleanedText = text.trim().slice(0, 8000);

  try {
    const response = await fetch(MISTRAL_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [cleanedText],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Embedding] API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data: EmbeddingResponse = await response.json();
    
    if (data.data && data.data.length > 0 && data.data[0].embedding) {
      return data.data[0].embedding;
    }

    return null;
  } catch (error) {
    console.error("[Embedding] Error generating embedding:", error);
    return null;
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function getCachedEmbedding(
  entityType: string,
  entityId: string,
  embeddingType: string,
  sourceText: string
): Promise<number[] | null> {
  const textHash = hashText(sourceText);

  const [cached] = await db
    .select()
    .from(vectorEmbeddings)
    .where(
      and(
        eq(vectorEmbeddings.entityType, entityType),
        eq(vectorEmbeddings.entityId, entityId),
        eq(vectorEmbeddings.embeddingType, embeddingType),
        eq(vectorEmbeddings.textHash, textHash)
      )
    )
    .limit(1);

  if (cached) {
    return cached.embedding;
  }

  const embedding = await generateEmbedding(sourceText);
  
  if (embedding) {
    await db.delete(vectorEmbeddings).where(
      and(
        eq(vectorEmbeddings.entityType, entityType),
        eq(vectorEmbeddings.entityId, entityId),
        eq(vectorEmbeddings.embeddingType, embeddingType)
      )
    );

    await db.insert(vectorEmbeddings).values({
      entityType,
      entityId,
      embeddingType,
      embedding,
      textHash,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    });
  }

  return embedding;
}

export function buildStartupProfileText(startup: {
  name?: string | null;
  description?: string | null;
  tagline?: string | null;
  industries?: string[] | null;
  stage?: string | null;
  location?: string | null;
}): string {
  const parts: string[] = [];

  if (startup.name) parts.push(`Company: ${startup.name}`);
  if (startup.tagline) parts.push(`Tagline: ${startup.tagline}`);
  if (startup.description) parts.push(`Description: ${startup.description}`);
  if (startup.industries && startup.industries.length > 0) {
    parts.push(`Industries: ${startup.industries.join(", ")}`);
  }
  if (startup.stage) parts.push(`Stage: ${startup.stage}`);
  if (startup.location) parts.push(`Location: ${startup.location}`);

  return parts.join(". ");
}

export function buildInvestorProfileText(investor: {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  bio?: string | null;
  sectors?: string[] | null;
  stages?: string[] | null;
  investorType?: string | null;
  investorCountry?: string | null;
  investorState?: string | null;
  fundHQ?: string | null;
  typicalInvestment?: string | null;
}): string {
  const parts: string[] = [];

  const name = [investor.firstName, investor.lastName].filter(Boolean).join(" ");
  if (name) parts.push(`Investor: ${name}`);
  if (investor.title) parts.push(`Title: ${investor.title}`);
  if (investor.bio) parts.push(`Bio: ${investor.bio}`);
  if (investor.sectors && investor.sectors.length > 0) {
    parts.push(`Focus sectors: ${investor.sectors.join(", ")}`);
  }
  if (investor.stages && investor.stages.length > 0) {
    parts.push(`Investment stages: ${investor.stages.join(", ")}`);
  }
  if (investor.investorType) parts.push(`Investor type: ${investor.investorType}`);
  
  const location = [investor.investorState, investor.investorCountry, investor.fundHQ]
    .filter(Boolean)
    .join(", ");
  if (location) parts.push(`Location: ${location}`);
  
  if (investor.typicalInvestment) parts.push(`Typical investment: ${investor.typicalInvestment}`);

  return parts.join(". ");
}

export function buildFirmProfileText(firm: {
  name?: string | null;
  description?: string | null;
  investmentThesis?: string | null;
  sectors?: string[] | null;
  stages?: string[] | null;
  geographies?: string[] | null;
  type?: string | null;
  checkSizeMin?: number | null;
  checkSizeMax?: number | null;
}): string {
  const parts: string[] = [];

  if (firm.name) parts.push(`Firm: ${firm.name}`);
  if (firm.description) parts.push(`Description: ${firm.description}`);
  if (firm.investmentThesis) parts.push(`Investment thesis: ${firm.investmentThesis}`);
  if (firm.sectors && firm.sectors.length > 0) {
    parts.push(`Focus sectors: ${firm.sectors.join(", ")}`);
  }
  if (firm.stages && firm.stages.length > 0) {
    parts.push(`Investment stages: ${firm.stages.join(", ")}`);
  }
  if (firm.geographies && firm.geographies.length > 0) {
    parts.push(`Geographies: ${firm.geographies.join(", ")}`);
  }
  if (firm.type) parts.push(`Firm type: ${firm.type}`);
  if (firm.checkSizeMin || firm.checkSizeMax) {
    const min = firm.checkSizeMin ? `$${(firm.checkSizeMin / 1000000).toFixed(1)}M` : "";
    const max = firm.checkSizeMax ? `$${(firm.checkSizeMax / 1000000).toFixed(1)}M` : "";
    parts.push(`Check size: ${min} - ${max}`);
  }

  return parts.join(". ");
}

export async function getSemanticSimilarity(
  startupProfile: {
    id: string;
    name?: string | null;
    description?: string | null;
    tagline?: string | null;
    industries?: string[] | null;
    stage?: string | null;
    location?: string | null;
  },
  investorProfile: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    bio?: string | null;
    sectors?: string[] | null;
    stages?: string[] | null;
    investorType?: string | null;
    investorCountry?: string | null;
    investorState?: string | null;
    fundHQ?: string | null;
    typicalInvestment?: string | null;
  }
): Promise<{ score: number; usedEmbeddings: boolean }> {
  const startupText = buildStartupProfileText(startupProfile);
  const investorText = buildInvestorProfileText(investorProfile);

  if (!startupText || !investorText) {
    return { score: 0.5, usedEmbeddings: false };
  }

  const [startupEmbedding, investorEmbedding] = await Promise.all([
    getCachedEmbedding("startup", startupProfile.id, "profile", startupText),
    getCachedEmbedding("investor", investorProfile.id, "profile", investorText),
  ]);

  if (!startupEmbedding || !investorEmbedding) {
    return { score: 0.5, usedEmbeddings: false };
  }

  const similarity = cosineSimilarity(startupEmbedding, investorEmbedding);
  const normalizedScore = Math.max(0, Math.min(1, (similarity + 1) / 2));

  return { score: normalizedScore, usedEmbeddings: true };
}

let embeddingCallCount = 0;
const MAX_EMBEDDING_CALLS_PER_RUN = 50;
let lastResetTime = Date.now();

function resetEmbeddingBudget() {
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    embeddingCallCount = 0;
    lastResetTime = now;
  }
}

function canMakeEmbeddingCall(): boolean {
  resetEmbeddingBudget();
  return embeddingCallCount < MAX_EMBEDDING_CALLS_PER_RUN;
}

function incrementEmbeddingCount() {
  embeddingCallCount++;
}

export async function getIndustrySemanticScore(
  startupIndustries: string[] | null | undefined,
  investorSectors: string[] | null | undefined,
  startupDescription?: string | null,
  investorBio?: string | null,
  startupId?: string,
  investorId?: string
): Promise<{ score: number; usedEmbeddings: boolean }> {
  if (!canMakeEmbeddingCall()) {
    return { score: 0.5, usedEmbeddings: false };
  }

  const startupText = [
    startupIndustries?.join(", ") || "",
    startupDescription || "",
  ].filter(Boolean).join(". ");

  const investorText = [
    investorSectors?.join(", ") || "",
    investorBio || "",
  ].filter(Boolean).join(". ");

  if (!startupText || !investorText) {
    return { score: 0.5, usedEmbeddings: false };
  }

  try {
    let startupEmbedding: number[] | null = null;
    let investorEmbedding: number[] | null = null;

    if (startupId) {
      startupEmbedding = await getCachedEmbedding("startup", startupId, "industry", startupText);
    } else {
      incrementEmbeddingCount();
      startupEmbedding = await generateEmbedding(startupText);
    }

    if (investorId) {
      investorEmbedding = await getCachedEmbedding("investor", investorId, "industry", investorText);
    } else {
      incrementEmbeddingCount();
      investorEmbedding = await generateEmbedding(investorText);
    }

    if (!startupEmbedding || !investorEmbedding) {
      return { score: 0.5, usedEmbeddings: false };
    }

    const similarity = cosineSimilarity(startupEmbedding, investorEmbedding);
    const normalizedScore = Math.max(0, Math.min(1, (similarity + 0.5) * 0.8));

    return { score: normalizedScore, usedEmbeddings: true };
  } catch (error) {
    console.warn("[Embedding] Industry semantic scoring failed:", error);
    return { score: 0.5, usedEmbeddings: false };
  }
}
