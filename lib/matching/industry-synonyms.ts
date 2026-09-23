/**
 * Industry Synonym Mapping System
 * 
 * Fixes the core Jaccard similarity issue: "ai" ≠ "artificial intelligence"
 * Expands both arrays through synonym groups before computing overlap.
 * 
 * File: server/services/industry-synonyms.ts
 */

import { PhraseMap, normPhrase } from "./normalize/text";

// ─── Synonym Groups ──────────────────────────────────────────────────────────
// Each group contains all known variations of an industry/sector label.
// When matching, if ANY term from a group appears in Array A and ANY term
// from the SAME group appears in Array B, it counts as a match.

const SYNONYM_GROUPS: string[][] = [
  // AI & Machine Learning
  ["ai", "artificial intelligence", "ai/ml", "machine learning", "ml", "deep learning", "neural networks", "generative ai", "llm", "large language models", "nlp", "natural language processing", "computer vision"],
  
  // Healthcare & Health Tech
  ["healthcare", "healthtech", "health tech", "digital health", "health", "medtech", "medical devices", "medical technology", "clinical", "hospital", "telemedicine", "telehealth", "mental health", "wellness", "health & wellness", "biohealth"],
  
  // Financial Technology
  ["fintech", "financial technology", "financial services", "financial", "finance", "banking", "neobanking", "payments", "lending", "insurtech", "insurance technology", "wealthtech", "wealth management", "regtech"],
  
  // Education Technology
  ["edtech", "education technology", "education", "e-learning", "elearning", "learning", "k-12", "higher education", "online education", "courseware", "lms"],
  
  // Software & SaaS
  ["saas", "software", "enterprise software", "b2b saas", "software as a service", "cloud software", "platform", "api"],
  
  // Consumer Technology
  ["consumer", "consumer tech", "consumer technology", "b2c", "direct to consumer", "d2c", "dtc", "consumer products", "consumer apps", "consumer internet"],
  
  // E-commerce & Retail
  ["e-commerce", "ecommerce", "commerce", "retail", "retail technology", "retail tech", "online retail", "marketplace", "marketplaces", "shopping"],
  
  // Biotechnology & Life Sciences
  ["biotech", "biotechnology", "life sciences", "life science", "pharma", "pharmaceutical", "drug discovery", "genomics", "bioinformatics"],
  
  // Clean Technology & Energy
  ["cleantech", "clean technology", "greentech", "green technology", "climate tech", "climate", "energy", "renewable energy", "sustainability", "sustainable", "carbon", "solar", "ev", "electric vehicles"],
  
  // Real Estate
  ["proptech", "property technology", "real estate", "real estate technology", "realestate", "reit", "residential", "commercial real estate", "housing", "construction", "construction tech"],
  
  // Food & Agriculture
  ["foodtech", "food technology", "food", "agtech", "agriculture", "agritech", "food & beverage", "restaurant tech", "delivery"],
  
  // Mobility & Transportation
  ["mobility", "transportation", "logistics", "supply chain", "supply chain management", "shipping", "freight", "autonomous vehicles", "ev"],
  
  // Cybersecurity
  ["cybersecurity", "cyber security", "security", "infosec", "information security", "data security", "privacy", "identity"],
  
  // Data & Analytics
  ["data", "data analytics", "analytics", "big data", "data science", "business intelligence", "bi"],
  
  // Sports & Fitness
  ["sports", "sportstech", "sports tech", "athletics", "fitness", "esports", "gaming", "sports technology"],
  
  // Media & Entertainment
  ["media", "entertainment", "content", "streaming", "digital media", "creator economy", "film", "movies", "production", "studios", "animation", "gaming", "video"],
  
  // Social & Community
  ["social", "social media", "community", "messaging", "communication", "collaboration"],
  
  // HR & Workforce
  ["hr", "hr tech", "hrtech", "human resources", "recruiting", "talent", "workforce", "staffing", "people analytics"],
  
  // Deep Tech
  ["deep tech", "deeptech", "frontier tech", "hard tech", "quantum", "robotics", "advanced materials", "space tech", "aerospace"],
  
  // IoT & Hardware
  ["iot", "internet of things", "hardware", "devices", "wearables", "smart home", "smart devices", "connected devices", "sensors"],
  
  // AR/VR
  ["ar", "vr", "ar/vr", "augmented reality", "virtual reality", "mixed reality", "xr", "metaverse", "spatial computing"],
  
  // Blockchain & Web3
  ["blockchain", "crypto", "cryptocurrency", "web3", "defi", "decentralized finance", "nft", "token", "distributed ledger"],
  
  // Travel & Hospitality
  ["travel", "hospitality", "tourism", "hotel", "travel tech", "booking"],
  
  // Legal Tech
  ["legaltech", "legal tech", "legal technology", "legal", "compliance", "contract management"],
  
  // Government & Public Sector
  ["govtech", "government", "public sector", "civic tech", "defense", "military"],
  
  // Venture Studio / Fund Types (for LP matching specifically)
  ["venture studio", "startup studio", "company builder", "venture builder"],
  ["venture capital", "vc", "venture", "early-stage investing"],
  ["private equity", "pe", "buyout", "growth equity", "leveraged buyout"],
  ["family office", "family wealth", "multi-family office", "single family office"],
  ["fund of funds", "fof", "fund-of-funds", "multi-manager"],
  ["sovereign wealth fund", "swf", "sovereign wealth", "government fund"],
  ["institutional investor", "institutional", "endowment", "pension", "pension fund", "university endowment"],
  ["asset & wealth manager", "asset manager", "wealth manager", "asset management", "wealth management"],
  ["emerging manager", "first-time fund", "new fund", "emerging gp"],
];

// Build a reverse lookup: term → group index
const TERM_TO_GROUP = new Map<string, number>();
SYNONYM_GROUPS.forEach((group, idx) => {
  group.forEach(term => {
    TERM_TO_GROUP.set(term.toLowerCase(), idx);
  });
});

// Whole-word phrase lookup. The partial matching this replaces tested
// substrings in both directions, so "ai" matched "retail", "ar" (AR/VR)
// matched "software" and "healthcare", and 92% of firms "overlapped" a
// sports-tech startup (docs/architecture/11 §2). Longest phrase wins, so
// "digital health" still finds the health group.
const PHRASES = new PhraseMap<number>();
SYNONYM_GROUPS.forEach((group, idx) => group.forEach(term => {
  if (PHRASES.get(term) === undefined) PHRASES.set(term, idx);
}));

function groupsOf(term: unknown): number[] {
  return PHRASES.findAll(String(term ?? ""));
}

/**
 * Expand an array of industry terms through synonym groups.
 * "ai" → ["ai", "artificial intelligence", "ai/ml", "machine learning", ...]
 */
export function expandSynonyms(terms: string[]): string[] {
  const expanded = new Set<string>();
  for (const term of terms ?? []) {
    // Defensive: DB jsonb arrays (sectors/stages) can contain non-strings
    // (numbers, nulls, nested objects). Coerce so .toLowerCase() never throws.
    const lower = String(term ?? "").toLowerCase().trim();
    if (!lower) continue;
    expanded.add(lower);
    
    // Whole words: "digital health" finds the health group; "retail" no longer finds AI.
    for (const idx of groupsOf(lower)) {
      for (const synonym of SYNONYM_GROUPS[idx]) expanded.add(synonym);
    }
  }
  return [...expanded];
}

/**
 * Compute synonym-aware Jaccard similarity.
 * Expands both arrays through synonym groups, then computes standard Jaccard.
 */
export function synonymJaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  
  const expandedA = new Set(expandSynonyms(a));
  const expandedB = new Set(expandSynonyms(b));
  
  const intersection = [...expandedA].filter(x => expandedB.has(x)).length;
  const union = new Set([...expandedA, ...expandedB]).size;
  
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if two sector lists have ANY overlap (after synonym expansion).
 * More lenient than Jaccard — returns true/false + matched terms.
 */
export function hasSectorOverlap(a: string[], b: string[]): { overlap: boolean; matched: string[]; score: number } {
  if (!a.length || !b.length) return { overlap: false, matched: [], score: 0 };
  
  const groupsA = new Set<number>();
  const groupsB = new Set<number>();
  
  for (const term of a) for (const g of groupsOf(term)) groupsA.add(g);
  for (const term of b) for (const g of groupsOf(term)) groupsB.add(g);
  
  const sharedGroups = [...groupsA].filter(g => groupsB.has(g));
  const matched = sharedGroups.map(g => SYNONYM_GROUPS[g][0]); // canonical name
  
  const intersection = sharedGroups.length;
  const union = new Set([...groupsA, ...groupsB]).size;
  const score = union > 0 ? intersection / union : 0;
  
  return { overlap: intersection > 0, matched, score };
}

/**
 * Scan text for thesis-relevant keywords from a configurable list.
 * Returns matched keywords and a weighted score.
 */
export function scanThesisSignals(
  text: string,
  thesisKeywords: string[],
): { matched: string[]; score: number } {
  if (!text || !thesisKeywords?.length) return { matched: [], score: 0 };

  // Whole words: the keyword "ai" must not match "maintain".
  const hay = ` ${normPhrase(String(text ?? ""))} `;
  const matched: string[] = [];

  for (const keyword of thesisKeywords) {
    const kw = normPhrase(String(keyword ?? ""));
    if (kw && hay.includes(` ${kw} `)) {
      matched.push(String(keyword));
    }
  }
  
  // Score: each matched keyword contributes diminishing returns
  // First match: 10pts, second: 7pts, third: 5pts, subsequent: 3pts each
  const weights = [10, 7, 5, 3, 3, 3, 3, 3, 3, 3];
  let score = 0;
  for (let i = 0; i < matched.length && i < weights.length; i++) {
    score += weights[i];
  }
  
  return { matched, score: Math.min(score, 30) }; // cap at 30
}

export { SYNONYM_GROUPS };
