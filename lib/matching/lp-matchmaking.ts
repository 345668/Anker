/**
 * LP Matchmaking Engine
 * 
 * Scores investment firms and individual investors against a fund's thesis
 * to produce ranked LP prospect pipelines for fundraising.
 * 
 * This is the Fund→LP scoring direction.
 * The existing matchmaking engines score Startup→Investor (a founder finds VCs).
 * This engine scores FundThesis→LP (a GP finds family offices, FoFs, endowments).
 */

import { sql } from "@/lib/db";
import { hasSectorOverlap, scanThesisSignals } from "./industry-synonyms";

// ─── Default scoring weights ─────────────────────────────────────────────────
const DEFAULT_LP_WEIGHTS = {
  lpType: 0.22,
  aumCapacity: 0.20,
  sectorAlignment: 0.20,
  geography: 0.18,
  thesisSignals: 0.15,
  contactQuality: 0.05,
};

// ─── Tier thresholds ─────────────────────────────────────────────────────────
const TIER_CHAMPION = 80;
const TIER_A = 60;
const TIER_B = 40;
const MIN_SCORE = 20;

function getTier(score: number): string {
  if (score >= TIER_CHAMPION) return "champion";
  if (score >= TIER_A) return "A";
  if (score >= TIER_B) return "B";
  return "C";
}

function getTierLabel(tier: string): string {
  switch (tier) {
    case "champion": return "Champion (80+)";
    case "A": return "Priority A (60-79)";
    case "B": return "Priority B (40-59)";
    case "C": return "Prospect C (20-39)";
    default: return "Unscored";
  }
}

// ─── LP Type Classification ──────────────────────────────────────────────────
const LP_TYPES = new Set([
  "family office", "fund of funds", "sovereign wealth fund",
  "institutional investor", "asset & wealth manager",
  "endowment", "pension", "pension fund",
  "multi-family office", "single family office",
  "wealth manager", "asset manager",
  "insurance company", "bank",
]);

const NON_LP_TYPES = new Set([
  "venture capital", "vc", "accelerator", "incubator",
  "corporate venture", "cvc", "angel group",
  "startup", "company", "operating company",
]);

function isLpType(firmType: string | null | undefined): boolean {
  if (!firmType) return false;
  const lower = firmType.toLowerCase().trim();
  
  if (LP_TYPES.has(lower)) return true;
  if (["family", "fund of funds", "sovereign", "endowment", "pension", "wealth"].some(k => lower.includes(k))) return true;
  if (NON_LP_TYPES.has(lower)) return false;
  if (["venture capital", "accelerator", "incubator", "corporate venture"].some(k => lower.includes(k))) return false;
  
  return false;
}

function isLpFromDescription(description: string | null | undefined): boolean {
  if (!description) return false;
  const lower = description.toLowerCase();
  const signals = [
    "limited partner", "fund of funds", "allocat", "endowment", "pension",
    "family wealth", "alternative investment", "venture fund investor",
    "emerging manager", "anchor investor", "institutional allocator",
    "family office", "sovereign wealth",
  ];
  return signals.some(s => lower.includes(s));
}

// ─── AUM Parsing ─────────────────────────────────────────────────────────────
function parseAumToUsd(aum: string | null | undefined): number | null {
  if (!aum) return null;
  const lower = aum.toLowerCase().replace(/,/g, "").trim();
  
  const patterns = [
    { regex: /\$?([\d.]+)\s*(?:trillion|t)/i, mult: 1_000_000_000_000 },
    { regex: /\$?([\d.]+)\s*(?:billion|bn|b)/i, mult: 1_000_000_000 },
    { regex: /\$?([\d.]+)\s*(?:million|mn|m)/i, mult: 1_000_000 },
    { regex: /\$?([\d.]+)\s*(?:thousand|k)/i, mult: 1_000 },
    { regex: /\$?([\d.]+)/i, mult: 1 },
  ];
  
  for (const { regex, mult } of patterns) {
    const match = lower.match(regex);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) return val * mult;
    }
  }
  return null;
}

// ─── Geography Matching ──────────────────────────────────────────────────────
interface GeoMatch {
  score: number;
  tags: string[];
  reason: string;
}

const GEO_REGIONS: Record<string, string[]> = {
  "utah": ["utah", "lehi", "salt lake", "provo", "park city", "sandy", "orem", "ogden", "farmington", "draper"],
  "mountain_west": ["colorado", "denver", "idaho", "boise", "wyoming", "montana", "arizona", "phoenix", "nevada", "las vegas", "new mexico"],
  "us_west": ["california", "san francisco", "los angeles", "seattle", "portland", "bay area", "silicon valley"],
  "us_east": ["new york", "boston", "washington", "philadelphia", "miami", "atlanta", "chicago"],
  "us": ["united states", "usa", "u.s.", "america"],
  "canada": ["canada", "toronto", "vancouver", "montreal", "calgary"],
  "india": ["india", "mumbai", "bangalore", "bengaluru", "delhi", "hyderabad", "pune", "chennai", "kolkata"],
  "dach": ["germany", "austria", "switzerland", "berlin", "munich", "zurich", "frankfurt", "vienna", "hamburg"],
  "gulf": ["uae", "dubai", "abu dhabi", "saudi", "saudi arabia", "qatar", "bahrain", "kuwait", "oman", "riyadh", "doha"],
  "uk": ["uk", "united kingdom", "london", "england", "scotland", "wales"],
  "italy": ["italy", "milan", "rome", "florence"],
  "france": ["france", "paris"],
  "singapore": ["singapore"],
  "japan": ["japan", "tokyo"],
  "china": ["china", "beijing", "shanghai", "hong kong"],
  "global": ["global", "worldwide", "international"],
};

function detectGeoRegion(location: string): string[] {
  const lower = location.toLowerCase();
  const regions: string[] = [];
  
  for (const [region, keywords] of Object.entries(GEO_REGIONS)) {
    if (keywords.some(k => lower.includes(k))) {
      regions.push(region);
    }
  }
  return regions;
}

function scoreGeography(
  entityLocation: string | null | undefined,
  fundGeoFocus: string[],
  fundHq: string | null | undefined,
): GeoMatch {
  if (!entityLocation) return { score: 0, tags: [], reason: "No location data" };
  
  const entityRegions = detectGeoRegion(entityLocation);
  if (entityRegions.length === 0) return { score: 5, tags: [], reason: `Unrecognized: ${entityLocation}` };
  
  if (fundHq) {
    const hqRegions = detectGeoRegion(fundHq);
    const hqSpecific = hqRegions.filter(r => !["us", "global"].includes(r));
    
    for (const hqRegion of hqSpecific) {
      if (entityRegions.includes(hqRegion)) {
        return {
          score: 100,
          tags: ["LOCAL"],
          reason: `LOCAL match: ${entityLocation} (fund HQ region)`,
        };
      }
    }
    
    if (hqRegions.includes("utah") && entityRegions.includes("mountain_west")) {
      return { score: 70, tags: ["REGIONAL"], reason: `Mountain West regional: ${entityLocation}` };
    }
  }
  
  const focusRegions = fundGeoFocus.flatMap(g => detectGeoRegion(g));
  
  for (const entityRegion of entityRegions) {
    if (focusRegions.includes(entityRegion)) {
      return {
        score: 80,
        tags: [entityRegion.toUpperCase()],
        reason: `Geographic focus match: ${entityLocation}`,
      };
    }
  }
  
  if (entityRegions.includes("us") && focusRegions.some(r => ["us", "us_west", "us_east", "utah", "mountain_west"].includes(r))) {
    return { score: 50, tags: [], reason: `US-based: ${entityLocation}` };
  }
  
  for (const region of entityRegions) {
    const regionTag = region.toUpperCase();
    if (["dach", "gulf", "india", "uk", "italy", "canada"].includes(region)) {
      return { score: 30, tags: [regionTag], reason: `International: ${entityLocation}` };
    }
  }
  
  return { score: 10, tags: [], reason: `Remote: ${entityLocation}` };
}

// ─── LP Type Scoring ─────────────────────────────────────────────────────────
function scoreLpType(firmType: string | null | undefined): { score: number; tag: string } {
  if (!firmType) return { score: 0, tag: "Unknown" };
  const lower = firmType.toLowerCase().trim();
  
  if (lower.includes("fund of funds")) return { score: 100, tag: "FoF" };
  if (lower.includes("family office") || lower.includes("family")) return { score: 90, tag: "FO" };
  if (lower.includes("sovereign")) return { score: 90, tag: "SWF" };
  if (lower.includes("endowment")) return { score: 85, tag: "ENDOW" };
  if (lower.includes("pension")) return { score: 85, tag: "PENSION" };
  if (lower.includes("institutional")) return { score: 80, tag: "INST" };
  if (lower.includes("asset") || lower.includes("wealth")) return { score: 55, tag: "AWM" };
  if (lower.includes("insurance")) return { score: 50, tag: "INS" };
  if (lower.includes("bank")) return { score: 45, tag: "BANK" };
  
  return { score: 20, tag: "Other-LP" };
}

// ─── AUM Scoring ─────────────────────────────────────────────────────────────
function scoreAum(aum: string | null | undefined, fundTarget: number | null): { score: number; isAnchor: boolean; reason: string } {
  const parsed = parseAumToUsd(aum);
  if (parsed === null) return { score: 20, isAnchor: false, reason: "AUM unknown" };
  
  if (parsed >= 5_000_000_000) return { score: 100, isAnchor: true, reason: `$${(parsed/1e9).toFixed(1)}B AUM — anchor potential` };
  if (parsed >= 1_000_000_000) return { score: 90, isAnchor: true, reason: `$${(parsed/1e9).toFixed(1)}B AUM — anchor potential` };
  if (parsed >= 500_000_000) return { score: 75, isAnchor: true, reason: `$${(parsed/1e6).toFixed(0)}M AUM — anchor potential` };
  if (parsed >= 200_000_000) return { score: 60, isAnchor: false, reason: `$${(parsed/1e6).toFixed(0)}M AUM` };
  if (parsed >= 100_000_000) return { score: 45, isAnchor: false, reason: `$${(parsed/1e6).toFixed(0)}M AUM` };
  if (parsed >= 50_000_000) return { score: 30, isAnchor: false, reason: `$${(parsed/1e6).toFixed(0)}M AUM` };
  
  return { score: 15, isAnchor: false, reason: `$${(parsed/1e6).toFixed(1)}M AUM` };
}

// ─── Notability / "lesser-known" filter (Decile methodology) ─────────────────
// For an emerging-manager fund-of-funds the brief is often to find LESSER-KNOWN
// offices ("not widely covered in mainstream VC media"). When
// fundProfile.preferLesserKnown is set we penalize household names; when
// excludeHouseholdNames is set we drop them entirely. This mirrors how the
// Decile Capital shortlist was built (mega-celebrity offices were scored out).
const HOUSEHOLD_NAMES = [
  "bezos", "jeff bezos", "dell", "michael dell", "gates", "bill gates", "cascade", "musk", "elon musk",
  "bloomberg", "willett", "ellison", "larry ellison", "soros", "thiel", "peter thiel", "iconiq", "zuckerberg",
  "walton", "walmart", "madrone", "builders vision", "dalio", "ray dalio", "griffin", "ken griffin", "citadel",
  "ballmer", "benioff", "time ventures", "arnault", "lvmh", "aglae", "slim", "carlos slim", "schmidt",
  "eric schmidt", "hillspire", "powell jobs", "emerson collective", "point72", "steve cohen", "druckenmiller",
  "duquesne", "simons", "euclidean", "paul allen", "vulcan", "cercano", "steve case", "revolution",
  "pritzker", "winklevoss", "kraft", "blavatnik", "access industries", "tull", "murthy", "catamaran", "premji",
  "tsai", "blue pool", "li ka-shing", "horizons ventures", "forrest", "tattarang", "wallenberg", "investor ab",
  "agnelli", "exor", "berlusconi", "dyson", "weybourne", "reuben", "rascoff", "zillow", "lauder", "wertheimer",
  "mousse", "sternlicht", "jaws", "koch", "draper", "bronfman", "olayan", "femsa", "santo domingo",
  "votorantim", "bertarelli", "kinnevik", "sofina", "verlinvest", "sergey brin", "bayshore global",
];

/** Penalty multiplier for "widely covered" offices: 1.0 for genuinely
 *  lesser-known, ~0.55 for household names. */
function notability(name: string, description?: string | null): { factor: number; household: boolean } {
  const blob = `${name} ${description ?? ""}`.toLowerCase();
  const hit = HOUSEHOLD_NAMES.some((h) => blob.includes(h));
  return { factor: hit ? 0.55 : 1.0, household: hit };
}

// ─── Fund-target-aware "right-sizing" AUM curve ───────────────────────────────
// The default scoreAum() rewards the biggest offices. But a small fund (e.g. a
// $20M emerging-manager FoF) is a poor fit for a $215B mega-office that writes
// nine-figure tickets. This curve rewards offices whose AUM is large enough to
// commit comfortably but not so large the fund is irrelevant to them.
function scoreAumRightSized(
  aum: string | null | undefined,
  fundTarget: number | null,
): { score: number; isAnchor: boolean; reason: string } {
  const parsed = parseAumToUsd(aum);
  if (parsed === null) return { score: 25, isAnchor: false, reason: "AUM unknown" };
  if (!fundTarget || fundTarget <= 0) return scoreAum(aum, fundTarget);

  const idealLow = fundTarget * 25;     // $20M raise → ~$500M
  const idealHigh = fundTarget * 400;   // $20M raise → ~$8B
  const fmt = parsed >= 1e9 ? `$${(parsed / 1e9).toFixed(1)}B` : `$${(parsed / 1e6).toFixed(0)}M`;

  if (parsed >= idealLow && parsed <= idealHigh) {
    return { score: 100, isAnchor: true, reason: `${fmt} AUM — right-sized for this raise` };
  }
  if (parsed > idealHigh && parsed <= idealHigh * 6) {
    return { score: 65, isAnchor: true, reason: `${fmt} AUM — large; may prefer bigger funds` };
  }
  if (parsed > idealHigh * 6) {
    return { score: 35, isAnchor: false, reason: `${fmt} AUM — likely too large for a small raise` };
  }
  if (parsed >= idealLow * 0.4) {
    return { score: 60, isAnchor: false, reason: `${fmt} AUM — slightly small but workable` };
  }
  return { score: 25, isAnchor: false, reason: `${fmt} AUM — likely too small to anchor` };
}

// ─── LP-vs-direct behavior ────────────────────────────────────────────────────
// Offices that actually commit to funds as LPs fit a FoF better than pure direct
// investors. Reads ✓LP / direct signals packed into the description by the
// importer, else infers from language.
function lpBehaviorBoost(description: string | null | undefined): { delta: number; tag?: string } {
  const d = (description ?? "").toLowerCase();
  if (/\blp[-\s]?active\b|commits? to funds|fund of funds|external managers|backs (emerging )?managers|anchor lp|fund investor|allocat/.test(d)) {
    return { delta: 8, tag: "LP-ACTIVE" };
  }
  if (/direct[-\s]?only|direct investments? only|does not invest in funds|no external lp/.test(d)) {
    return { delta: -10, tag: "DIRECT-ONLY" };
  }
  return { delta: 0 };
}

// ─── Scored Result Interfaces ────────────────────────────────────────────────
export interface ScoredFirm {
  firmId: string;
  name: string;
  type: string;
  location: string;
  aum: string;
  sectors: string;
  website: string;
  linkedin: string;
  score: number;
  tier: string;
  tierLabel: string;
  tags: string[];
  reasons: string[];
  factorLpType: number;
  factorAum: number;
  factorSector: number;
  factorGeo: number;
  factorThesisSignals: number;
}

export interface ScoredContact {
  investorId: string;
  name: string;
  title: string;
  type: string;
  location: string;
  email: string;
  linkedin: string;
  sectors: string;
  bio: string;
  score: number;
  tier: string;
  tierLabel: string;
  tags: string[];
  reasons: string[];
  factorLpType: number;
  factorSector: number;
  factorGeo: number;
  factorThesisSignals: number;
  factorContactQuality: number;
}

export interface FundProfile {
  id: string;
  name: string;
  targetRaise: number | null;
  sectors: string[];
  geographicFocus: string[];
  headquartersLocation: string | null;
  thesisKeywords: string[];
  scoringWeights?: typeof DEFAULT_LP_WEIGHTS;
  // ── Tuning (Decile methodology). All default off = legacy behavior. ──
  /** Penalize household / widely-covered offices (for "lesser-known" briefs). */
  preferLesserKnown?: boolean;
  /** Drop household-name offices entirely from results. */
  excludeHouseholdNames?: boolean;
  /** Size AUM relative to the target raise instead of "bigger = better"
   *  (a $20M FoF should not over-rank a $200B mega-office). */
  rightSizeToTarget?: boolean;
}

export interface LpMatchingResult {
  sessionId: string;
  fundName: string;
  totalFirmsScored: number;
  totalContactsScored: number;
  qualifiedFirms: number;
  qualifiedContacts: number;
  contactsWithEmail: number;
  anchorCandidates: number;
  durationMs: number;
  tierCounts: {
    firms: Record<string, number>;
    contacts: Record<string, number>;
  };
  firms: ScoredFirm[];
  contacts: ScoredContact[];
}

// ─── Main LP Matching Function ───────────────────────────────────────────────
export async function runLpMatching(
  fundProfile: FundProfile,
  options?: {
    minScore?: number;
    maxFirms?: number;
    maxContacts?: number;
  },
): Promise<LpMatchingResult> {
  const startTime = Date.now();
  const minScore = options?.minScore ?? MIN_SCORE;
  const maxFirms = options?.maxFirms ?? 5000;
  const maxContacts = options?.maxContacts ?? 5000;
  
  const weights = fundProfile.scoringWeights ?? DEFAULT_LP_WEIGHTS;
  
  // Load all firms and investors from the database
  const allFirms = await sql`SELECT * FROM investment_firms`;
  const allInvestors = await sql`SELECT * FROM investors`;
  
  console.log(`[LP Matching] Scoring ${allFirms.length} firms and ${allInvestors.length} investors for fund: ${fundProfile.name}`);
  
  // ─── Score Firms ─────────────────────────────────────────────────────────
  const scoredFirms: ScoredFirm[] = [];
  
  for (const firm of allFirms) {
    const firmType = (firm as any).firm_classification ?? (firm as any).type ?? "";
    const description = (firm as any).description ?? "";
    
    // Stage 1: LP type filter
    if (!isLpType(firmType) && !isLpFromDescription(description)) continue;
    
    const tags: string[] = [];
    const reasons: string[] = [];
    
    // Factor 1: LP Type
    const lpTypeResult = scoreLpType(firmType);
    tags.push(lpTypeResult.tag);
    
    // Factor 2: AUM (right-sized to the raise when requested)
    const aumResult = fundProfile.rightSizeToTarget
      ? scoreAumRightSized((firm as any).aum, fundProfile.targetRaise)
      : scoreAum((firm as any).aum, fundProfile.targetRaise);
    if (aumResult.isAnchor) { tags.push("ANCHOR"); reasons.push(aumResult.reason); }
    else if (fundProfile.rightSizeToTarget && aumResult.reason) { reasons.push(aumResult.reason); }
    
    // Factor 3: Sector alignment
    const firmSectors = Array.isArray((firm as any).sectors) ? (firm as any).sectors as string[] : [];
    const fundSectors = fundProfile.sectors ?? [];
    const sectorResult = hasSectorOverlap(firmSectors, fundSectors);
    let sectorScore = Math.round(sectorResult.score * 100);
    if (sectorResult.matched.length >= 3) { sectorScore = Math.min(100, sectorScore + 15); }
    if (sectorResult.overlap) reasons.push(`Sector fit: ${sectorResult.matched.slice(0, 3).join(", ")}`);
    
    // Factor 4: Geography
    const geoResult = scoreGeography(
      (firm as any).hq_location ?? (firm as any).location ?? "",
      fundProfile.geographicFocus ?? [],
      fundProfile.headquartersLocation,
    );
    if (geoResult.tags.length) tags.push(...geoResult.tags);
    if (geoResult.reason && geoResult.score >= 50) reasons.push(geoResult.reason);
    
    // Factor 5: Thesis signals
    const thesisKeywords = fundProfile.thesisKeywords ?? [];
    const signalText = [description, firmType, firmSectors.join(" ")].join(" ");
    const signalResult = scanThesisSignals(signalText, thesisKeywords);
    if (signalResult.matched.length) {
      reasons.push(`Thesis signals: ${signalResult.matched.slice(0, 3).join(", ")}`);
      signalResult.matched.forEach(m => {
        if (["university", "tech transfer", "research"].some(k => m.includes(k))) tags.push("UNI");
        if (["venture studio", "startup studio"].some(k => m.includes(k))) tags.push("STUDIO");
        if (["emerging manager", "first-time fund"].some(k => m.includes(k))) tags.push("EM");
      });
    }
    
    // Weighted composite score
    const rawScore =
      lpTypeResult.score * weights.lpType +
      aumResult.score * weights.aumCapacity +
      sectorScore * weights.sectorAlignment +
      geoResult.score * weights.geography +
      (signalResult.score / 30 * 100) * weights.thesisSignals;

    let score = Math.round(rawScore);

    // Decile tuning: notability penalty, household exclusion, LP-behavior nudge.
    const firmName = (firm as any).name ?? "";
    if (fundProfile.preferLesserKnown || fundProfile.excludeHouseholdNames) {
      const note = notability(firmName, description);
      if (note.household && fundProfile.excludeHouseholdNames) continue;
      if (note.household) { score = Math.round(score * note.factor); tags.push("WELL-KNOWN"); }
      else if (fundProfile.preferLesserKnown) { tags.push("LESSER-KNOWN"); }
    }
    {
      const lpb = lpBehaviorBoost(description);
      if (lpb.delta) { score += lpb.delta; if (lpb.tag) tags.push(lpb.tag); }
    }
    score = Math.max(0, Math.min(100, score));

    if (score >= minScore) {
      const tier = getTier(score);
      scoredFirms.push({
        firmId: firm.id,
        name: (firm as any).name ?? "",
        type: firmType,
        location: (firm as any).hq_location ?? (firm as any).location ?? "",
        aum: (firm as any).aum ?? "",
        sectors: firmSectors.join(", ").substring(0, 100),
        website: (firm as any).website ?? "",
        linkedin: (firm as any).linkedin_url ?? "",
        score,
        tier,
        tierLabel: getTierLabel(tier),
        tags: [...new Set(tags)],
        reasons: reasons.slice(0, 5),
        factorLpType: Math.round(lpTypeResult.score),
        factorAum: Math.round(aumResult.score),
        factorSector: sectorScore,
        factorGeo: Math.round(geoResult.score),
        factorThesisSignals: Math.round(signalResult.score / 30 * 100),
      });
    }
  }
  
  scoredFirms.sort((a, b) => b.score - a.score);
  const qualifiedFirms = scoredFirms.slice(0, maxFirms);
  
  // ─── Score Individual Investors ──────────────────────────────────────────
  const scoredContacts: ScoredContact[] = [];
  
  for (const inv of allInvestors) {
    const invType = (inv as any).investor_type ?? (inv as any).type ?? "";
    // Field mapping tolerant of BOTH the person-centric schema and the
    // org-centric public.investors schema (description / industries /
    // contact_email / name).
    const bio = (inv as any).bio ?? (inv as any).description ?? "";
    const firstName = (inv as any).first_name ?? "";
    const lastName = (inv as any).last_name ?? "";
    const displayName = `${firstName} ${lastName}`.trim() || ((inv as any).name ?? "");
    const email = (inv as any).email ?? (inv as any).contact_email ?? "";
    const linkedin = (inv as any).linkedin_url ?? (inv as any).person_linkedin_url ?? "";
    const title = (inv as any).title ?? "";
    const location = (inv as any).location ?? "";
    const invSectors = Array.isArray((inv as any).sectors)
      ? (inv as any).sectors as string[]
      : Array.isArray((inv as any).industries) ? (inv as any).industries as string[] : [];

    // Normalize hyphenated types ("family-office" → "family office").
    const itl = String(invType).toLowerCase().replace(/[-_]/g, " ");
    const tags: string[] = [];
    const reasons: string[] = [];
    let isLp = false;
    let lpScore = 0;
    
    // LP type classification for individuals
    if (itl.includes("family office")) { lpScore = 90; tags.push("FO"); isLp = true; }
    else if (itl.includes("sovereign")) { lpScore = 90; tags.push("SWF"); isLp = true; }
    else if (itl.includes("fund of funds")) { lpScore = 100; tags.push("FoF"); isLp = true; }
    else if (itl.includes("institutional") || itl.includes("endowment") || itl.includes("pension")) { lpScore = 80; tags.push("INST"); isLp = true; }
    else if (itl.includes("asset manager") || itl.includes("hedge fund")) { lpScore = 55; tags.push("AM"); isLp = true; }
    else if (itl.includes("angel")) {
      const hnwSignals = ["family office", "ceo", "founder", "chairman", "exit", "sold", "serial entrepreneur", "managing partner", "fortune"].filter(k => bio.toLowerCase().includes(k));
      if (hnwSignals.length >= 2) { lpScore = 45; tags.push("HNW-Angel"); isLp = true; }
    } else {
      if (isLpFromDescription(bio)) { lpScore = 35; tags.push("LP-Signal"); isLp = true; }
    }
    
    if (!isLp) continue;
    
    // Sector alignment
    const fundSectors = fundProfile.sectors ?? [];
    const sectorResult = hasSectorOverlap(invSectors, fundSectors);
    let sectorScore = Math.round(sectorResult.score * 100);
    if (sectorResult.overlap) reasons.push(`Sectors: ${sectorResult.matched.slice(0, 3).join(", ")}`);
    
    // Geography
    const geoResult = scoreGeography(location, fundProfile.geographicFocus ?? [], fundProfile.headquartersLocation);
    if (geoResult.tags.length) tags.push(...geoResult.tags);
    
    // Thesis signals from bio
    const thesisKeywords = fundProfile.thesisKeywords ?? [];
    const signalResult = scanThesisSignals(bio, thesisKeywords);
    if (signalResult.matched.length) {
      reasons.push(`Bio signals: ${signalResult.matched.slice(0, 3).join(", ")}`);
      if (signalResult.matched.some(m => m.includes("university") || m.includes("research"))) tags.push("UNI");
      if (signalResult.matched.some(m => m.includes("emerging manager"))) tags.push("EM");
    }
    
    // Contact quality
    let contactScore = 0;
    if (email) { contactScore += 70; tags.push("EMAIL"); }
    if (linkedin && linkedin.startsWith("http")) { contactScore += 30; }
    
    // Weighted composite
    const rawScore =
      lpScore * weights.lpType +
      0 * weights.aumCapacity +
      sectorScore * weights.sectorAlignment +
      geoResult.score * weights.geography +
      (signalResult.score / 30 * 100) * weights.thesisSignals +
      contactScore * weights.contactQuality;

    let score = Math.round(rawScore);

    // Decile tuning: notability penalty (name + firm + bio), LP-behavior nudge.
    if (fundProfile.preferLesserKnown || fundProfile.excludeHouseholdNames) {
      const note = notability(`${firstName} ${lastName} ${(inv as any).firm_name ?? ""}`, bio);
      if (note.household && fundProfile.excludeHouseholdNames) continue;
      if (note.household) { score = Math.round(score * note.factor); tags.push("WELL-KNOWN"); }
      else if (fundProfile.preferLesserKnown) { tags.push("LESSER-KNOWN"); }
    }
    {
      const lpb = lpBehaviorBoost(bio);
      if (lpb.delta) { score += lpb.delta; if (lpb.tag) tags.push(lpb.tag); }
    }
    score = Math.max(0, Math.min(100, score));

    if (score >= minScore) {
      const tier = getTier(score);
      scoredContacts.push({
        investorId: inv.id,
        name: displayName,
        title,
        type: invType,
        location,
        email,
        linkedin,
        sectors: invSectors.join(", ").substring(0, 80),
        bio: bio.substring(0, 300),
        score,
        tier,
        tierLabel: getTierLabel(tier),
        tags: [...new Set(tags)],
        reasons: reasons.slice(0, 5),
        factorLpType: Math.round(lpScore),
        factorSector: sectorScore,
        factorGeo: Math.round(geoResult.score),
        factorThesisSignals: Math.round(signalResult.score / 30 * 100),
        factorContactQuality: contactScore,
      });
    }
  }
  
  scoredContacts.sort((a, b) => b.score - a.score);
  const qualifiedContacts = scoredContacts.slice(0, maxContacts);
  
  // ─── Compute summary stats ───────────────────────────────────────────────
  const contactsWithEmail = qualifiedContacts.filter(c => c.email).length;
  const anchorCandidates = qualifiedFirms.filter(f => f.tags.includes("ANCHOR")).length;
  
  const firmTierCounts: Record<string, number> = { champion: 0, A: 0, B: 0, C: 0 };
  for (const f of qualifiedFirms) firmTierCounts[f.tier] = (firmTierCounts[f.tier] ?? 0) + 1;
  
  const contactTierCounts: Record<string, number> = { champion: 0, A: 0, B: 0, C: 0 };
  for (const c of qualifiedContacts) contactTierCounts[c.tier] = (contactTierCounts[c.tier] ?? 0) + 1;
  
  const durationMs = Date.now() - startTime;
  const sessionId = `lms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  
  console.log(`[LP Matching] Completed in ${durationMs}ms: ${qualifiedFirms.length} firms, ${qualifiedContacts.length} contacts`);
  
  return {
    sessionId,
    fundName: fundProfile.name,
    totalFirmsScored: allFirms.length,
    totalContactsScored: allInvestors.length,
    qualifiedFirms: qualifiedFirms.length,
    qualifiedContacts: qualifiedContacts.length,
    contactsWithEmail,
    anchorCandidates,
    durationMs,
    tierCounts: { firms: firmTierCounts, contacts: contactTierCounts },
    firms: qualifiedFirms,
    contacts: qualifiedContacts,
  };
}

// ─── Save LP Session to Database ─────────────────────────────────────────────
export async function saveLpSession(
  result: LpMatchingResult,
  fundProfileId: string,
  userId?: string,
): Promise<void> {
  // Insert session
  await sql`
    INSERT INTO lp_match_sessions (
      id, fund_profile_id, fund_name, total_firms_scored, total_contacts_scored,
      qualified_firms, qualified_contacts, contacts_with_email, anchor_candidates,
      tier_counts, duration_ms, user_id, created_at
    ) VALUES (
      ${result.sessionId}, ${fundProfileId}, ${result.fundName},
      ${result.totalFirmsScored}, ${result.totalContactsScored},
      ${result.qualifiedFirms}, ${result.qualifiedContacts},
      ${result.contactsWithEmail}, ${result.anchorCandidates},
      ${JSON.stringify(result.tierCounts)}, ${result.durationMs},
      ${userId || null}, NOW()
    )
  `;
  
  // Batch insert firm matches - using actual lp_firm_matches columns
  // Actual columns: id, session_id, firm_id, firm_name, score, tier, tier_label,
  // factor_sector, factor_stage, factor_geography, factor_fund_size, factor_track_record,
  // reasoning, status, notes, created_at
  for (const f of result.firms) {
    await sql`
      INSERT INTO lp_firm_matches (
        id, session_id, firm_id, firm_name, score, tier, tier_label,
        factor_sector, factor_geography, reasoning, status, created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${result.sessionId}, ${f.firmId || null}, ${f.name}, 
        ${f.score}, ${f.tier}, ${f.tierLabel || f.tier},
        ${f.factorSector || 0}, ${f.factorGeo || 0}, 
        ${JSON.stringify(f.reasons || [])}, 'identified', NOW()
      )
    `;
  }
  
  // Batch insert contact matches - using actual lp_contact_matches columns
  // Actual columns: id, session_id, firm_match_id, contact_id, contact_name, 
  // contact_email, contact_title, contact_linkedin, score, is_decision_maker, status, notes, created_at
  for (const c of result.contacts) {
    await sql`
      INSERT INTO lp_contact_matches (
        id, session_id, contact_id, contact_name, contact_email, 
        contact_title, contact_linkedin, score, status, created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${result.sessionId}, ${c.investorId || null}, ${c.name}, ${c.email || null},
        ${c.title || null}, ${c.linkedin || null}, ${c.score}, 'identified', NOW()
      )
    `;
  }
}

// ─── Load LP Session ─────────────────────────────────────────────────────────
export async function getLpSession(sessionId: string) {
  const sessions = await sql`
    SELECT * FROM lp_match_sessions WHERE id = ${sessionId} LIMIT 1
  `;
  
  if (!sessions.length) return null;
  
  const firms = await sql`
    SELECT * FROM lp_firm_matches 
    WHERE session_id = ${sessionId}
    ORDER BY score DESC
  `;
  
  const contacts = await sql`
    SELECT * FROM lp_contact_matches 
    WHERE session_id = ${sessionId}
    ORDER BY score DESC
  `;
  
  return { session: sessions[0], firms, contacts };
}

// ─── Get Sessions for Fund ───────────────────────────────────────────────────
export async function getLpSessionsForFund(fundProfileId: string) {
  return sql`
    SELECT * FROM lp_match_sessions 
    WHERE fund_profile_id = ${fundProfileId}
    ORDER BY created_at DESC
  `;
}

// ─── Update Pipeline Status ──────────────────────────────────────────────────
export async function updateLpFirmStatus(
  matchId: string,
  status: string,
  notes?: string,
  commitmentAmount?: number,
) {
  await sql`
    UPDATE lp_firm_matches 
    SET status = ${status}, notes = ${notes || null}, 
        commitment_amount = ${commitmentAmount || null}, updated_at = NOW()
    WHERE id = ${matchId}
  `;
}

export async function updateLpContactStatus(
  matchId: string,
  status: string,
  notes?: string,
) {
  await sql`
    UPDATE lp_contact_matches 
    SET status = ${status}, notes = ${notes || null}, updated_at = NOW()
    WHERE id = ${matchId}
  `;
}

// ─── Pipeline Summary ────────────────────────────────────────────────────────
export async function getLpPipelineSummary(fundProfileId: string) {
  const firms = await sql`
    SELECT * FROM lp_firm_matches WHERE fund_profile_id = ${fundProfileId}
  `;
  
  const statusCounts: Record<string, number> = {};
  let totalCommitted = 0;
  
  for (const f of firms) {
    const s = (f as any).status ?? "identified";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    if (s === "committed" && (f as any).commitment_amount) totalCommitted += (f as any).commitment_amount;
  }
  
  return {
    totalFirms: firms.length,
    statusCounts,
    totalCommitted,
    anchorFirms: firms.filter(f => (f as any).tags?.includes("ANCHOR")).length,
    localFirms: firms.filter(f => (f as any).tags?.includes("LOCAL")).length,
  };
}
