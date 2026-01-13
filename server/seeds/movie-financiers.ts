import { db } from "../db";
import { investmentFirms } from "@shared/schema";
import { eq } from "drizzle-orm";

interface MovieFinancier {
  name: string;
  type: string;
  focus: string;
  region: string;
  notes: string;
  website?: string;
}

const movieFinanciers: MovieFinancier[] = [
  // User provided priority list
  { name: "Peachtree Group", type: "Slate Financing / Strategic Capital", focus: "Film/TV ($5M-$50M)", region: "Atlanta, GA", notes: "Institutional slate support", website: "peachtreegroup.com" },
  { name: "BondIt Media Capital", type: "Media Finance / Loans", focus: "Independent Film/TV", region: "Santa Monica, CA", notes: "Gap financing and structured loans", website: "bondit.com" },
  { name: "Film Finances Inc.", type: "Completion Bond / Finance", focus: "All Film Scales", region: "Los Angeles, CA", notes: "Industry leader with 70+ years experience", website: "filmfinances.com" },
  { name: "AGC Studios", type: "Production", focus: "Commercial Films", region: "Los Angeles, CA", notes: "Major studio for commercial films", website: "agcstudios.com" },
  { name: "FilmNation Entertainment", type: "Production", focus: "Prestige/Commercial Films", region: "New York, NY", notes: "Premier production and financing company", website: "filmnation.com" },
  { name: "30West", type: "Investors / Strategic Capital", focus: "Independent Films", region: "Los Angeles, CA", notes: "Backed I, Tonya, Killers of the Flower Moon", website: "30west.com" },
  { name: "Voltage Pictures", type: "Production", focus: "Commercial Genre Films", region: "Los Angeles, CA", notes: "Leading independent production company", website: "voltagepictures.com" },
  { name: "Black Bear Pictures", type: "Independent Film Studio", focus: "Filmmaker-driven ($1M-$20M)", region: "Los Angeles, CA", notes: "Financed Sicario, The Imitation Game", website: "blackbearfilms.com" },
  { name: "Spyglass Media Group", type: "Production", focus: "Horror, Thriller, Commercial", region: "Los Angeles, CA", notes: "Genre-focused production studio", website: "spyglassmedia.com" },
  { name: "Focus Features", type: "Specialty Studio / Financing", focus: "Arthouse/Prestige", region: "Universal City, CA", notes: "International art-house titles", website: "focusfeatures.com" },
  
  // From CSV - Global Film Financiers
  { name: "Yash Raj Films", type: "Studio / Production House", focus: "Mainstream Bollywood production & financing", region: "India", notes: "Leading studio financier" },
  { name: "Dharma Productions", type: "Studio / Production House", focus: "Bollywood blockbusters", region: "India", notes: "Home to many financed hits" },
  { name: "Red Chillies Entertainment", type: "Studio / Financier", focus: "Owned by Shah Rukh Khan; film investment & production", region: "India", notes: "Company invests in films" },
  { name: "Eros International / Eros Studios", type: "Studio / Distributor", focus: "Film financing & distribution", region: "India", notes: "Major investor in Indian cinema" },
  { name: "Zee Studios", type: "Studio / Production House", focus: "Finance and distribute Bollywood titles", region: "India", notes: "Large content and finance vehicle" },
  { name: "Vistaar Religare Film Fund (VRFF)", type: "Film Fund", focus: "Structured film investment fund (~$50M)", region: "India", notes: "Among first regulated film funds" },
  { name: "Cinema Capital India", type: "Fund / Advisory", focus: "Manages CCVF; invests in mid-large budget films", region: "India", notes: "Fund size INR15–80 Cr" },
  { name: "Amazon Studios", type: "Studio / Funding Arm", focus: "Film & series financing", region: "USA", notes: "Studio-backed projects like Roma" },
  { name: "Participant Media", type: "Impact Studio", focus: "Socially-focused films (e.g. Spotlight)", region: "USA", notes: "Known for socially conscious cinema" },
  { name: "Bron Studios", type: "Indie Financier / Co-Producer", focus: "Co-financed Joker, Bombshell", region: "USA/Canada", notes: "Independent films & blockbusters" },
  { name: "Motion Media Group Inc.", type: "Equity & Debt Finance", focus: "Funding through all production stages", region: "USA", notes: "Financing film & animation projects" },
  { name: "FilmHedge", type: "Fintech - Film Loans", focus: "$ up to $10M short-term loans", region: "USA", notes: "Collateral via pre-sales, tax credits" },
  { name: "Aperture Media Partners", type: "Advisory / Equity Finance", focus: "Feature & episodic media finance", region: "USA", notes: "Alternative to traditional banks" },
  { name: "QED International", type: "Production Studio / Financier", focus: "District 9, Fury, Elysium", region: "USA", notes: "Distributor/financier and producer" },
  { name: "Cinetic Media", type: "Independent Financier / Distributor", focus: "Indie films, VOD financing", region: "USA", notes: "Little Miss Sunshine, Boyhood" },
  { name: "Skydance Media", type: "Production & Financing Company", focus: "Finance/produce blockbusters, animation", region: "USA", notes: "Major partnership with Paramount" },
  { name: "CJ E&M / CJ Entertainment", type: "Studio & Financier", focus: "Produces & finances major Korean films", region: "South Korea", notes: "Funded Parasite and global releases" },
  { name: "Lotte Entertainment", type: "Studio / Distributor / Financier", focus: "Local and international film investment", region: "South Korea", notes: "Leads in Korean film production" },
  { name: "Korea Creative Content Agency (KOCCA)", type: "Gov't Production Rebate", focus: "Loans & location rebates for foreign productions", region: "South Korea", notes: "Up to 30% rebate for foreign shoots" },
  { name: "Lumina", type: "Studio + VC-backed Film Fund", focus: "Talent-owned IP financing and production", region: "Europe / Hollywood", notes: "Co-owns Carrousel Studios" },
  { name: "Annapurna Pictures", type: "Independent Producer / Financier", focus: "Auteurs, prestige indie films", region: "USA", notes: "Larry Ellison's daughter-backed studio" },
  { name: "Sidney Kimmel Entertainment", type: "Production Finance & Equity", focus: "Feature & TV financing & production", region: "USA", notes: "Co-produces US & international titles" },
  { name: "Silver Reel", type: "Production Financier / Co-Producer", focus: "UK–US film projects", region: "UK", notes: "Shattered, Paradise Highway" },
  { name: "Ashland Hill Media Finance", type: "Senior Debt Fund / Gap Finance", focus: "Film lending, tax-credit backed loans", region: "UK / USA", notes: "In top film financing platform" },
  { name: "Blue Fox Financing", type: "Completion & Tax Credit Loans", focus: "Financing & bonds for film production", region: "USA / London", notes: "Gap loans & bond finance" },
  { name: "Rainmaker Holdings Group", type: "Film & TV Finance", focus: "Risk management & finishing finance", region: "UK / global", notes: "Films like Dusty and Me, Awaiting" },
  { name: "First Republic Bank", type: "Specialized Bank Lending", focus: "Production loans, tax credit collateral lending", region: "USA", notes: "Over 1,000 films supported" },
  { name: "Comerica Bank", type: "Entertainment Banking", focus: "Recoupment, working capital, cross-territory financing", region: "USA", notes: ">50 years experience in film lending" },
  { name: "Telefilm Canada", type: "Govt Film Funding Agency", focus: "Grants for production, marketing, development", region: "Canada", notes: "$100M+ annually in support programmes" },
  { name: "British Film Institute (BFI)", type: "UK Film Council Grants", focus: "Funding for dev, production, distribution", region: "UK", notes: "Major film funder in UK" },
  { name: "Natixis Coficiné", type: "Film & TV Financing", focus: "Gap loans, cash-flow, co-production finance", region: "France", notes: "European film financing specialist" },
  { name: "Royal Bank of Canada (RBC)", type: "Specialized Film Banking", focus: "Tax-credit financing, escrow, production banking", region: "Canada", notes: "Support for international co-productions" },
  { name: "Endgame Entertainment", type: "Independent Financier / Distributor", focus: "Finances independent auteur-driven films", region: "USA", notes: "Cold War, Toni Erdmann" },
  { name: "IFC Films", type: "Indie Studio / Distributor", focus: "Financing & distribution of independent cinema", region: "USA", notes: "Boyhood, Little Miss Sunshine" },
  { name: "Killer Films", type: "Production Company / Investor", focus: "Genre-bending indie cinema", region: "USA", notes: "Manchester by the Sea, Hereditary" },
  { name: "Anonymous Content", type: "Production / Finance Studio", focus: "High-caliber film & TV projects", region: "USA", notes: "True Detective, 1917" },
  { name: "Grosvenor Park Productions", type: "International Film Finance", focus: "Produces & finances cross-border films", region: "UK / USA", notes: "The Hurt Locker, Penelope" },
  { name: "Shanghai Film Group Corporation", type: "Chinese Production & Investment", focus: "Co-finances major studio releases", region: "China", notes: "Invested in Top 25% of Paramount output" },
  { name: "IPR.VC", type: "Content Fund", focus: "Invests €150 M in film & TV projects", region: "Finland / EU", notes: "Fund slate includes Bordertown, Causeway" },
  { name: "NALA Films", type: "Production & Finance Company", focus: "Finances 3–5 feature films/year ($6–30 M budgets)", region: "USA / LatinAm", notes: "Founder backed by NALA Investments" },
  { name: "Los Angeles Media Fund (LAMF)", type: "Entertainment Finance & Production", focus: "Films, docs, TV, sports and live events financing", region: "USA", notes: "Produces Magazine Dreams, Cora Bora" },
  { name: "Goldfinch Entertainment", type: "UK/International Fund", focus: "Invested $200 M across 300+ productions", region: "UK / Global", notes: "Includes Bird Box Finance platform" },
  { name: "Productivity Media", type: "Global Film Investment Platform", focus: "Co-investing with data-driven underwriting", region: "UK / Global", notes: "Structured lending and equity finance" },
  { name: "Media Guarantors", type: "Completion Bonds & Cash Flow Loans", focus: "Guarantees and liquidity support", region: "USA", notes: "Specializes in completion finance" },
  { name: "Omeira Studio Partners", type: "UK Film Investment Studio", focus: "Tax-efficient film investing", region: "UK", notes: "Offers structured investment vehicles" },
  { name: "Red Rock Entertainment", type: "UK Film Finance Studio", focus: "Finances high-commerciality movies", region: "UK", notes: "Targets mid-to-high budget films" },
  { name: "SOHO Film Finance", type: "UK Film Finance & Music Rights", focus: "Film funding along with soundtrack revenue streams", region: "UK", notes: "Established over 25 years" },
  { name: "AMP International / Alliance Media Partners", type: "Sales & Finance Company", focus: "Full-spectrum film packaging, financing, and distribution", region: "UK / Dubai", notes: "Equity and gap finance from Dubai-linked AMP group" },
  { name: "MediaInvest (EU fund)", type: "Fund of Funds / Investment", focus: "Invests in content funds across EU audiovisual media", region: "Europe", notes: "€200M fund backing IPR.VC Fund III" },
  { name: "Logical Content Ventures", type: "Content fund", focus: "Slate financing for EU/US films", region: "Europe", notes: "Slate partner with Pathé and MK2 Films" },
  { name: "Entertainment Farm", type: "Film investment fund", focus: "Underwriting US & Asian-featured films", region: "Singapore", notes: "$30–50M fund" },
  { name: "Hyde Park Entertainment (Singapore)", type: "Debt + Equity fund", focus: "Co-financed Hollywood/global films", region: "Singapore", notes: "$55–72M fund" },
  { name: "RGM Entertainment Fund", type: "Structured film financing", focus: "Gap & slate financing for global English-language projects", region: "Singapore", notes: "$400M facility for global content" },
  { name: "Bigfoot Partners Film Fund", type: "Film fund", focus: "$1M–3M project support (Asia-themed/English language)", region: "Philippines / Asia", notes: "Fully finances $1–3M features" },
  { name: "Canada Media Fund", type: "Media grant fund", focus: "Supports TV, digital media & film content production", region: "Canada", notes: "~CA$371M annual budget" },
  { name: "Spcine / São Paulo Film Comm.", type: "Public enterprise", focus: "Rebate & public cinema support program", region: "Brazil", notes: "Municipal film attraction & grant initiatives" },
  { name: "Patagonik Film Group", type: "Production + Financing firm", focus: "Argentine studio financing global and local features", region: "Argentina", notes: "Films include Evita, Nueve Reinas" },
  { name: "Scythia Films", type: "Independent studio + fund", focus: "Finance & produce films (The Witch, Falling, etc.)", region: "Canada", notes: "Co-produces 5–7 titles via development fund" },
  { name: "Volos Films", type: "International co-production", focus: "Facilitates European–Asia feature production", region: "Italy / Taiwan", notes: "Cannes-recognized films like A Holy Family" },
  { name: "UniFi Completion Guarantors", type: "Completion Bond Agency", focus: "Boutique guarantee provider (A+ rating)", region: "Global", notes: "Known for flexible, high-end completion bonding" },
  { name: "Allen Financial Insurance", type: "Surety & Bond Cover Provider", focus: "Completion bonds, cast & production insurance", region: "USA / Europe / Asia", notes: "Bonds for Avengers, Iron Man, Titanic" },
  { name: "ProSure Group", type: "Film Bonding & Insurance", focus: "Bonding, credit facilities, completion support", region: "USA / UK / Canada", notes: "Bonds for Lego Movie, Angry Birds" },
  { name: "The Fyzz", type: "Film Bond & Finance Agency", focus: "Gap and completion finance for feature films", region: "UK / USA", notes: "Past coverage: The King's Speech, The Artist" },
  { name: "Medienboard Berlin-Brandenburg", type: "Public Film Funding Body", focus: "Grants & repayable loans for film & media projects", region: "Germany", notes: "Annual film budget ~€32M" },
  { name: "101 Films International", type: "Sales & Financing Agent", focus: "Global sales agent & financier for feature films", region: "UK", notes: "Covers all production stages" },
  { name: "Bankside Films", type: "International Sales & Finance", focus: "Sales and executive producer financing", region: "UK", notes: "Bespoke financing plus sales participation" },
  { name: "Blue Finch Films", type: "Sales & Film Finance Agent", focus: "Bold indie films support and gap finance", region: "UK", notes: "Focuses on high-risk, high-quality projects" },
  { name: "Carnaby Int'l Sales & Dist.", type: "Sales + Production Financing", focus: "Co-productions, international distribution", region: "UK", notes: "Active at major markets (Cannes, Berlinale, AFM)" },
  { name: "Media Finance Capital", type: "Senior Debt & Bridge Lending", focus: "Financing shortfalls or bridging cash gaps", region: "UK / US", notes: "Founded by Marlon Vogelgesang" },
];

function mapTypeToClassification(type: string): { firmType: string; classification: string } {
  const typeLower = type.toLowerCase();
  
  if (typeLower.includes("fund") || typeLower.includes("vc") || typeLower.includes("venture")) {
    return { firmType: "Film Fund", classification: "Film Finance" };
  }
  if (typeLower.includes("studio") || typeLower.includes("production")) {
    return { firmType: "Studio", classification: "Film Production" };
  }
  if (typeLower.includes("bank")) {
    return { firmType: "Bank", classification: "Entertainment Lender" };
  }
  if (typeLower.includes("bond") || typeLower.includes("guarantee")) {
    return { firmType: "Completion Bond", classification: "Film Finance" };
  }
  if (typeLower.includes("gov") || typeLower.includes("public") || typeLower.includes("grant")) {
    return { firmType: "Government Agency", classification: "Film Incentive" };
  }
  if (typeLower.includes("investor") || typeLower.includes("capital") || typeLower.includes("equity")) {
    return { firmType: "Film Fund", classification: "Film Finance" };
  }
  if (typeLower.includes("debt") || typeLower.includes("loan") || typeLower.includes("finance")) {
    return { firmType: "Debt Provider", classification: "Film Finance" };
  }
  if (typeLower.includes("sales") || typeLower.includes("distributor")) {
    return { firmType: "Sales Agent", classification: "Film Distribution" };
  }
  
  return { firmType: "Film Fund", classification: "Film Finance" };
}

function parseCheckSize(focus: string, notes: string): { min?: number; max?: number; typical?: string } {
  const combined = `${focus} ${notes}`;
  
  // Look for patterns like "$5M-$50M", "$1M–3M", etc.
  const rangeMatch = combined.match(/\$(\d+(?:\.\d+)?)\s*[Mm]?\s*[-–]\s*\$?(\d+(?:\.\d+)?)\s*[Mm]/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]) * 1000000;
    const max = parseFloat(rangeMatch[2]) * 1000000;
    return { min, max, typical: `$${rangeMatch[1]}M - $${rangeMatch[2]}M` };
  }
  
  // Look for single values like "$10M", "$50M", etc.
  const singleMatch = combined.match(/\$(\d+(?:\.\d+)?)\s*[Mm]/);
  if (singleMatch) {
    const amount = parseFloat(singleMatch[1]) * 1000000;
    return { max: amount, typical: `Up to $${singleMatch[1]}M` };
  }
  
  return {};
}

export async function seedMovieFinanciers(): Promise<{ inserted: number; skipped: number }> {
  console.log("[Seed] Starting movie financiers seed...");
  
  let inserted = 0;
  let skipped = 0;
  
  for (const financier of movieFinanciers) {
    // Check if already exists
    const existing = await db.select()
      .from(investmentFirms)
      .where(eq(investmentFirms.name, financier.name))
      .limit(1);
    
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    
    const { firmType, classification } = mapTypeToClassification(financier.type);
    const checkSize = parseCheckSize(financier.focus, financier.notes);
    
    const website = financier.website 
      ? (financier.website.startsWith("http") ? financier.website : `https://${financier.website}`)
      : undefined;
    
    await db.insert(investmentFirms).values({
      name: financier.name,
      type: firmType,
      firmClassification: classification,
      description: `${financier.focus}. ${financier.notes}`,
      location: financier.region,
      hqLocation: financier.region,
      website: website,
      sectors: ["Entertainment", "Film", "Media", "Content"],
      stages: ["Growth", "Late Stage"],
      checkSizeMin: checkSize.min,
      checkSizeMax: checkSize.max,
      typicalCheckSize: checkSize.typical,
    });
    
    inserted++;
  }
  
  console.log(`[Seed] Movie financiers seed complete: ${inserted} inserted, ${skipped} skipped (already exist)`);
  return { inserted, skipped };
}
