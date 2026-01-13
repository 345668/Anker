import { db } from "../db";
import { investmentFirms } from "@shared/schema";
import { eq } from "drizzle-orm";

interface SportsInvestor {
  name: string;
  type: string;
  focus: string;
  region: string;
  notes: string;
  website?: string;
}

const sportsInvestors: SportsInvestor[] = [
  // Private Equity - Major Sports Franchises
  { name: "Arctos Sports Partners", type: "Private Equity", focus: "Minority equity stakes in major sports franchises", region: "USA", notes: "NBA, MLB, NHL team stakes", website: "arctospartners.com" },
  { name: "RedBird Capital Partners", type: "Investment Management / PE", focus: "Sports, media, entertainment holdings", region: "USA / Europe", notes: "AC Milan, Liverpool", website: "redbirdcap.com" },
  { name: "Dyal HomeCourt Partners", type: "Private Equity", focus: "NBA team minority stakes", region: "USA", notes: "Exclusive NBA-focused platform", website: "blueowl.com" },
  { name: "Sixth Street Partners", type: "Private Credit / Infrastructure", focus: "Infrastructure, stadium, media rights & team investments", region: "USA / Global", notes: "Spurs stake, FC Barcelona rights, Legends Hospitality" },
  { name: "CVC Capital Partners", type: "Global PE", focus: "Motorsport, cricket leagues, football media rights", region: "Europe / Global", notes: "MotoGP, IPL team Gujarat Titans, Six Nations, La Liga", website: "cvc.com" },
  { name: "Ares Management", type: "Private Equity", focus: "Club ownership stakes, media & venue finance", region: "Global", notes: "Chelsea FC, Inter Miami stake", website: "aresmgmt.com" },
  { name: "Apollo Global Management", type: "Private Equity / Credit", focus: "Stadium finance, club equity, sports infrastructure lending", region: "Global", notes: "In talks for Atlético Madrid stake; loan to Nottingham Forest", website: "apollo.com" },
  { name: "Raine Group", type: "Growth Equity / Advisory", focus: "Sports-tech, media, sports finance advisory", region: "USA / Global", notes: "Invested in media and sports platforms", website: "raine.com" },
  
  // Sports-Tech VCs
  { name: "KB Partners", type: "Sports-Tech VC", focus: "Early-stage bets on fan-engagement, esports, youth sports", region: "USA", notes: "Checks $1–3M; backed Stadium Live, GridRival, SIQ", website: "kbpartners.com" },
  { name: "Courtside Ventures", type: "Sports-Gaming-Tech VC", focus: "Sports-tech, wellness, gaming, media startups", region: "USA / Global", notes: "Backed Fnatic, StockX, The Athletic", website: "courtsidevc.com" },
  { name: "Sapphire Sport", type: "Corporate-backed Sports-Tech VC", focus: "Fan-tech, media, entertainment innovation", region: "USA / Global", notes: "$181M fund; backed Buzzer, Tonal, Overtime, Mixhalo", website: "sapphireventures.com" },
  { name: "Mastry Ventures", type: "Sports-Tech VC", focus: "Athlete-driven investments in tech & sports platforms", region: "USA", notes: "Led by ex-NBA star Iguodala; invests in Players Health, Athletes First", website: "mastry.vc" },
  { name: "Stadia Ventures", type: "Accelerator & VC", focus: "Sports tech and analytics startups", region: "USA", notes: "Platform bridging startups with league investors", website: "stadiaventures.com" },
  { name: "Bruin Capital", type: "VC / PE focused on Sports/Media", focus: "Fan engagement, marketing tech, sports media platforms", region: "USA", notes: "Focus on sports media, analytics & audience tech", website: "bruincptl.com" },
  { name: "Alumni Ventures – Sports Fund", type: "Venture Capital", focus: "Sports, media & entertainment innovation", region: "USA", notes: "$1.3B+ raised, dedicated sports fund", website: "av.vc" },
  
  // Athlete-backed VCs
  { name: "Seven Seven Six (776)", type: "Athlete-founded VC", focus: "Sports-Web3, fan-engagement, entertainment", region: "USA / Global", notes: "Led Sorare's $680M round", website: "sevensevensix.com" },
  { name: "Sequel", type: "Athlete-backed VC", focus: "Early stage tech, health, wellness with athlete LP base", region: "USA / UK", notes: "Open invitation-only fund for elite athlete investors", website: "sequel.co" },
  { name: "Will Ventures", type: "Sports performance VC", focus: "Human performance, fitness, athlete-tech", region: "USA", notes: "Focused on science-driven startups", website: "willventures.com" },
  { name: "Players Fund", type: "Athlete SPV investment platform", focus: "Seed/A-stage startups across tech & media", region: "USA", notes: "Athletes participate deal-by-deal", website: "playersfund.vc" },
  { name: "Muse Capital", type: "Early-stage VC", focus: "Media-tech and sports platforms with celebrity backing", region: "USA", notes: "Invests in gamified media and entertainment", website: "musecapital.vc" },
  { name: "Athletico Ventures", type: "Athlete VC network", focus: "Impact or sports-tech investing with athlete LPs", region: "USA", notes: "Helps athletes invest alongside VC funds", website: "athletico.vc" },
  { name: "SeventySix Capital", type: "Athlete-driven sports VC", focus: "Sports-tech via athlete community", region: "USA", notes: "Athlete LP structure, strong sector focus", website: "seventysixcapital.com" },
  { name: "TitletownTech", type: "Sports-tech VC", focus: "Fan engagement, performance, venue & data", region: "USA", notes: "~$95M fund based in Green Bay", website: "titletowntech.com" },
  { name: "LOUD Capital", type: "Growth VC / Sports-tech focus", focus: "Sports-related startups from seed to growth stage", region: "USA / Global", notes: "Multi-stage sports & media investments", website: "loud.vc" },
  
  // Angel Networks & Early Stage
  { name: "Boston Harbor Angels", type: "Angel network", focus: "Pre-seed investments in sports & wellness tech", region: "USA", notes: "Supports early-stage sports and health ventures", website: "bostonharborangels.com" },
  { name: "VisionTech Partners", type: "Early-stage VC", focus: "Sports tech alongside other sectors", region: "USA", notes: "Pre-seed investments across sports & entertainment", website: "visiontech-partners.com" },
  
  // Large Sports-Tech Funds
  { name: "IO Capital's Halo Experience (HXCO)", type: "Dedicated Sports-Tech Fund", focus: "$1B+ fund backing fan-tech, esports, wellness startups", region: "USA / Global", notes: "Announced in 2025; invests in emerging sports-tech platforms" },
  { name: "AO Ventures", type: "Sports-Tech VC", focus: "Fan engagement, AR/VR, athlete wellness, performance platforms", region: "USA", notes: "Featured in SportsTechX's Q1 2025 fund roundup" },
  { name: "Scrum Ventures", type: "Sports-Tech & Gaming VC", focus: "Digital sports, e-sports, fan platforms", region: "USA", notes: "Listed among the latest sports-tech funds of 2025", website: "scrum.vc" },
  { name: "Cartan Capital", type: "Athlete-backed VC", focus: "Sports, media, entertainment startups", region: "USA", notes: "Athlete LP-focused sports and startup fund", website: "cartancapital.com" },
  { name: "Champion Venture Partners", type: "Athlete-founded Sports VC", focus: "Seed to Series A investments in sports-tech", region: "USA", notes: "Targets early-stage sports-related founders", website: "championventurepartners.com" },
  { name: "Tru Skye Ventures", type: "Athlete-backed VC", focus: "Sports-tech startups, wellness, fan data", region: "USA", notes: "Athlete LPs leading seed-stage sports investments", website: "truskyeventures.com" },
  { name: "Yashaa Global Capital", type: "Athlete & Gender-diverse Fund", focus: "Early-stage sports, health, wellness startups", region: "USA / Global", notes: "Founder-led fund supporting underrepresented founders", website: "daoneglobal.vc" },
  
  // International Sports-Tech VCs
  { name: "Langleven Capital", type: "Fitness & Sports-Tech VC", focus: "Wellness, wearables, active lifestyle platforms", region: "Canada", notes: "Sports and wellness investment focus", website: "langleven.com" },
  { name: "leAD Sports", type: "Sports & Health-Tech Seed VC", focus: "Early-stage sports/wellness startup launchpad", region: "Global", notes: "Actively funding early-stage sports-tech innovators", website: "lead.vc" },
  { name: "Ludis Capital", type: "Media & Sports-Tech Venture", focus: "Intersection of sports, media, and entertainment platforms", region: "Global", notes: "Sports, tech, and consumer lifestyle focus", website: "ludis.capital" },
  { name: "Mindspring Capital", type: "Sports-Industry Venture Firm", focus: "Tech ventures powering sports performance and data analytics", region: "Global", notes: "Supports innovation in performance-driven platforms", website: "mindspring.capital" },
  { name: "Build Your Legacy Ventures", type: "Athlete-founded VC", focus: "Sports, media, entertainment startups", region: "USA / Global", notes: "Giannis Antetokounmpo; Invested in women's 3-on-3 league Unrivaled", website: "bylventures.com" },
  
  // European Sports VCs
  { name: "Dutch Sport Tech Fund", type: "Late-stage VC / PE", focus: "Sports-tech platforms (e.g. WSC Sports)", region: "Israel / Global", notes: "Backs broadcasting and sports-tech platforms", website: "dutchsporttechfund.com" },
  { name: "APEX CP", type: "VC Fund", focus: "Pre-seed to Seed for sports-tech projects", region: "Norway", notes: "Leading European sports-tech fund", website: "apex-cp.com" },
  { name: "Felix Capital", type: "Seed/Series VC", focus: "Sports & health tech startups", region: "Germany / Global", notes: "Operates early-stage sports-tech fund", website: "felixcap.com" },
  { name: "Aser Ventures", type: "Sports-tech VC", focus: "Seed to Series A, sports innovation", region: "Israel", notes: "Focused on digital and fan engagement platforms", website: "aser.com" },
  { name: "Liberty City Ventures", type: "VC Fund", focus: "Sports-tech European startups", region: "Netherlands", notes: "Seed to Series A ticket sizes €100k–1.5M", website: "libertycityventures.com" },
  { name: "Venturerock", type: "VC Fund", focus: "Sports-tech innovation across Portugal & EMEA", region: "Portugal", notes: "Invests in early-stage sports platforms €100k–4M", website: "venturerock.com" },
  { name: "Inbox Capital", type: "VC fund", focus: "Consumer, digital lifestyle, health & wellness, sports tech", region: "UK / Europe", notes: "£1.2B AUM; invests across health, sports, digital lifestyle sectors", website: "inboxcap.com" },
  { name: "Raptor Group", type: "VC & Late-stage fund", focus: "Sports data, media platforms", region: "UK / Global", notes: "Holds stake in Whistle, Eleven Sports, Sports Data Labs", website: "raptorgroup.com" },
  { name: "Athletic Ventures", type: "Early-stage VC", focus: "Sports tech, media & entertainment, underrepresented founders", region: "NYC / Global", notes: "Invests in platforms like mmERCH, Fuze, TinyTap", website: "athletic.vc" },
  { name: "Next Ventures", type: "Early-stage VC", focus: "Sports & media technology, IoT, health & entertainment", region: "Europe / Global", notes: "Lance Armstrong; Broad-stage sports, blockchain & health-tech players", website: "nextventures.com" },
  { name: "Wylab", type: "Growth-stage VC", focus: "Sports, e-sports, social networks", region: "Sweden / Europe / US", notes: "Backed e-sports and sports-focused growth startups", website: "wylab.net" },
  
  // Major VC Firms with Sports Focus
  { name: "Intel Capital", type: "Global VC / Accelerator", focus: "Sports, fitness, esports, media-tech (Seed to Series A)", region: "Global", notes: "~2600 investments; portfolio includes Canva, Sportwey, TeamUp", website: "intelcapital.com" },
  { name: "Elysian Park Ventures", type: "Accelerator program", focus: "Physical performance and wearables-focused sports-tech", region: "Spain / Europe", notes: "Early-stage accelerator run with ASICS brand and IESE Business School", website: "elysianpark.ventures" },
  { name: "Techstars Sports", type: "VC firm", focus: "Performance analytics, sports data, enterprise sports startups", region: "USA", notes: "Invested in FanDuel, Hudl, BoomTV", website: "techstars.com" },
  { name: "Sequoia Capital", type: "Seed-stage VC", focus: "Wearables, athlete performance & sustainability tech", region: "USA", notes: "~70 investments; portfolio includes Second Spectrum, Beyond Pulse" },
  { name: "Kleiner Perkins", type: "Corporate VC", focus: "Sports analytics, broadcast tech, AI-motion capture", region: "USA / Global", notes: "Long-term investor; backed WSC Sports, Sportvision" },
  { name: "General Catalyst", type: "Diversity VC / Angel syndicate", focus: "Inclusive leadership, sports analytics & wellness startups", region: "USA", notes: "Investments in Uplift Labs, Sports Innovation Lab", website: "generalcatalyst.com" },
  { name: "Lightspeed Venture Partners", type: "Accelerator / Seed VC", focus: "Sports-tech and wellness-focused startups", region: "Global", notes: "Programs worldwide with specialized sports cohorts", website: "lsvp.com" },
  { name: "Serena Ventures", type: "Global VC", focus: "Wearables, fitness, AR/VR, performance tech", region: "Global", notes: "Frequent investor in sports and fitness startups", website: "serenaventures.com" },
  { name: "Causeway Media Partners", type: "VC Firm", focus: "Sports-tech, fitness, fan engagement innovation", region: "USA / Global", notes: "Portfolio includes emerging sports-tech unicorns", website: "causeway.vc" },
  { name: "Alberts Impact Capital", type: "VC Fund", focus: "Diverse founders, including sports, wellness, media-tech", region: "USA", notes: "Founded by Serena Williams; backed Tonal, Noom", website: "alberts.co" },
  
  // Corporate & Specialty Sports VCs
  { name: "Decathlon Pulse (CVC)", type: "VC Fund", focus: "Sports-tech & fan community platforms", region: "Belgium", notes: "Invested in Raw Stadia, CityLegends", website: "decathlonpulse.com" },
  { name: "ASICS TENKAN-TEN", type: "Athlete-led VC", focus: "Nutrition, fitness, wellness startups", region: "USA / Global", notes: "Operated by athletes including Armstrong and Conacher", website: "tenkan-ten.com" },
  { name: "500 Global", type: "Sports-tech incubator", focus: "Early-stage sports innovation", region: "Italy", notes: "Focused on sports tech incubation in Europe", website: "500.co" },
  { name: "GV (Google Ventures)", type: "Accelerator & Mentor Program", focus: "Sports-tech startups across Japan & US", region: "Japan / Global", notes: "Run by Dentsu and Scrum Ventures", website: "gv.com" },
  { name: "RRE Ventures", type: "Accelerator / Incubator", focus: "Health, fitness, public-sector sports-tech innovation", region: "UK", notes: "Works with National Governing Bodies & city councils", website: "rre.com" },
  
  // Esports & Gaming VCs
  { name: "BITKRAFT Ventures", type: "Athlete-backed VC", focus: "Health/wellness, sports, inclusion-startups", region: "UK", notes: "Invitation-only fund, elite athlete LPs" },
  { name: "Galaxy Interactive", type: "Athlete-driven VC", focus: "Seed/Series A sports-tech and wellness startups", region: "USA", notes: "Athlete LP-led, high involvement in sports-tech deals" },
  
  // Family Offices & PE with Sports Focus
  { name: "Johnson Venture Partners", type: "Family Office / PE", focus: "Sports media, entertainment, tech-powered ventures", region: "USA (Cleveland)", notes: "Linked to Cleveland Cavaliers ownership", website: "jvpfund.com" },
  { name: "The Chernin Group (TCG)", type: "Athlete syndicate platform", focus: "Sector-agnostic syndicates, including sports-tech", region: "USA", notes: "500+ athlete members investing across platforms" },
  { name: "Acton Capital", type: "Growth PE", focus: "Fitness equipment, wellness platforms", region: "Norway / Europe", notes: "Acquired LifeFit, Urban Sports Club, Silva" },
  { name: "FountainVest Partners", type: "Athlete-led VC", focus: "Fitness, wellness, and sports-tech startups", region: "USA", notes: "Operated by elite athletes with personal brand leverage" },
];

function mapTypeToClassification(type: string): { firmType: string; classification: string } {
  const typeLower = type.toLowerCase();
  
  if (typeLower.includes("pe") || typeLower.includes("private equity")) {
    return { firmType: "PE", classification: "Sports Private Equity" };
  }
  if (typeLower.includes("angel")) {
    return { firmType: "Angel", classification: "Sports Angel Network" };
  }
  if (typeLower.includes("accelerator") || typeLower.includes("incubator")) {
    return { firmType: "Accelerator", classification: "Sports Accelerator" };
  }
  if (typeLower.includes("family office")) {
    return { firmType: "Family Office", classification: "Sports Family Office" };
  }
  if (typeLower.includes("corporate") || typeLower.includes("cvc")) {
    return { firmType: "CVC", classification: "Corporate Venture" };
  }
  if (typeLower.includes("growth")) {
    return { firmType: "VC", classification: "Sports Growth VC" };
  }
  if (typeLower.includes("athlete")) {
    return { firmType: "VC", classification: "Athlete-backed VC" };
  }
  
  return { firmType: "VC", classification: "Sports-Tech VC" };
}

function parseCheckSize(notes: string): { min?: number; max?: number; typical?: string } {
  // Look for patterns like "$1–3M", "$1B+", "$181M", etc.
  const rangeMatch = notes.match(/\$(\d+(?:\.\d+)?)\s*[–-]\s*\$?(\d+(?:\.\d+)?)\s*([MBK])/i);
  if (rangeMatch) {
    const multiplier = rangeMatch[3].toUpperCase() === 'B' ? 1000000000 : 
                       rangeMatch[3].toUpperCase() === 'M' ? 1000000 : 1000;
    const min = parseFloat(rangeMatch[1]) * multiplier;
    const max = parseFloat(rangeMatch[2]) * multiplier;
    return { min, max, typical: `$${rangeMatch[1]}${rangeMatch[3]} - $${rangeMatch[2]}${rangeMatch[3]}` };
  }
  
  // Look for single values like "$181M fund", "$1B+"
  const singleMatch = notes.match(/\$(\d+(?:\.\d+)?)\s*([MBK])(?:\+?\s*fund)?/i);
  if (singleMatch) {
    const multiplier = singleMatch[2].toUpperCase() === 'B' ? 1000000000 : 
                       singleMatch[2].toUpperCase() === 'M' ? 1000000 : 1000;
    const amount = parseFloat(singleMatch[1]) * multiplier;
    return { max: amount, typical: `$${singleMatch[1]}${singleMatch[2]} fund` };
  }
  
  return {};
}

export async function seedSportsInvestors(): Promise<{ inserted: number; skipped: number }> {
  console.log("[Seed] Starting sports industry investors seed...");
  
  let inserted = 0;
  let skipped = 0;
  
  for (const investor of sportsInvestors) {
    // Check if already exists
    const existing = await db.select()
      .from(investmentFirms)
      .where(eq(investmentFirms.name, investor.name))
      .limit(1);
    
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    
    const { firmType, classification } = mapTypeToClassification(investor.type);
    const checkSize = parseCheckSize(investor.notes);
    
    const website = investor.website 
      ? (investor.website.startsWith("http") ? investor.website : `https://${investor.website}`)
      : undefined;
    
    // Determine stages based on type
    let stages: string[] = [];
    const typeLower = investor.type.toLowerCase();
    if (typeLower.includes("seed") || typeLower.includes("early")) {
      stages = ["Pre-seed", "Seed", "Series A"];
    } else if (typeLower.includes("growth") || typeLower.includes("late")) {
      stages = ["Series B", "Series C", "Growth"];
    } else if (typeLower.includes("pe") || typeLower.includes("private equity")) {
      stages = ["Growth", "Late Stage", "Buyout"];
    } else {
      stages = ["Seed", "Series A", "Series B"];
    }
    
    await db.insert(investmentFirms).values({
      name: investor.name,
      type: firmType,
      firmClassification: classification,
      description: `${investor.focus}. ${investor.notes}`,
      location: investor.region,
      hqLocation: investor.region,
      website: website,
      sectors: ["Sports", "Sports-Tech", "Media", "Entertainment", "Fitness", "Wellness"],
      stages: stages,
      checkSizeMin: checkSize.min,
      checkSizeMax: checkSize.max,
      typicalCheckSize: checkSize.typical,
    });
    
    inserted++;
  }
  
  console.log(`[Seed] Sports industry investors seed complete: ${inserted} inserted, ${skipped} skipped (already exist)`);
  return { inserted, skipped };
}
