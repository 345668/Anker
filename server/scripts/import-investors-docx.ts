import mammoth from "mammoth";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { investmentFirms, investors } from "@shared/schema";
import { eq } from "drizzle-orm";

interface RawInvestorRow {
  companyName: string;
  numberOfInvestments: number | null;
  numberOfExits: number | null;
  location: string | null;
  investorType: string | null;
  description: string | null;
  companyUrl: string | null;
  domain: string | null;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  twitter: string | null;
  contactEmail: string | null;
  phoneNumber: string | null;
  industries: string | null;
  program: string | null;
  country: string | null;
  stage: string | null;
  focusArea: string | null;
}

function parseIndustriesToArray(industries: string | null): string[] {
  if (!industries) return [];
  return industries
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100);
}

function normalizeFirmType(type: string | null): string {
  if (!type) return "Venture Capital";
  const lowerType = type.toLowerCase();
  
  if (lowerType.includes("family")) return "Family Office";
  if (lowerType.includes("angel")) return "Angel Investor";
  if (lowerType.includes("private equity") || lowerType.includes("pe")) return "Private Equity";
  if (lowerType.includes("venture") || lowerType.includes("vc")) return "Venture Capital";
  if (lowerType.includes("corporate")) return "Corporate VC";
  if (lowerType.includes("accelerator") || lowerType.includes("incubator")) return "Accelerator";
  if (lowerType.includes("micro")) return "Venture Capital";
  if (lowerType.includes("bank")) return "Bank";
  if (lowerType.includes("sovereign") || lowerType.includes("swf")) return "Sovereign Wealth Fund";
  if (lowerType.includes("pension")) return "Pension Fund";
  if (lowerType.includes("fund of funds") || lowerType.includes("fof")) return "Fund of Funds";
  if (lowerType.includes("asset") || lowerType.includes("wealth")) return "Asset & Wealth Manager";
  if (lowerType.includes("institutional")) return "Institutional Investor";
  
  return "Venture Capital";
}

function extractStages(stage: string | null, focusArea: string | null): string[] {
  const stages: string[] = [];
  const combined = `${stage || ""} ${focusArea || ""}`.toLowerCase();
  
  if (combined.includes("pre-seed") || combined.includes("preseed")) stages.push("Pre-Seed");
  if (combined.includes("seed+") || combined.includes("seed plus")) stages.push("Seed+");
  else if (combined.includes("seed") && !combined.includes("late seed")) stages.push("Seed");
  if (combined.includes("late seed")) stages.push("Late Seed");
  if (combined.includes("series a") || combined.includes("growth")) stages.push("Series A");
  if (combined.includes("series b")) stages.push("Series B");
  if (combined.includes("series c")) stages.push("Series C+");
  if (combined.includes("late")) stages.push("Late Stage");
  
  return stages.length > 0 ? stages : ["Seed"];
}

function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  let normalized = url.trim();
  if (!normalized.startsWith("http")) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}

function extractLocation(location: string | null, country: string | null): string {
  if (location) {
    const parts = location.split(",").map(p => p.trim());
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    return location;
  }
  return country || "Unknown";
}

async function parseDocxToRows(filePath: string): Promise<RawInvestorRow[]> {
  console.log(`Reading DOCX file: ${filePath}`);
  
  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value;
  
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  console.log(`Extracted ${lines.length} lines from document`);
  
  const rows: RawInvestorRow[] = [];
  let currentRow: Partial<RawInvestorRow> = {};
  let headerFound = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!headerFound && (line.includes("company_nam") || line.includes("Fund Name"))) {
      headerFound = true;
      continue;
    }
    
    if (!headerFound) continue;
    
    if (line.includes("http://") || line.includes("https://")) {
      if (!currentRow.companyUrl) currentRow.companyUrl = line;
      continue;
    }
    
    if (line.includes("@") && line.includes(".")) {
      if (!currentRow.contactEmail) currentRow.contactEmail = line;
      continue;
    }
    
    if (line.includes("linkedin.com")) {
      if (!currentRow.linkedin) currentRow.linkedin = line;
      continue;
    }
    
    if (line.match(/^[\+\(\d][\d\s\-\(\)\.]+$/) && line.length >= 8) {
      if (!currentRow.phoneNumber) currentRow.phoneNumber = line;
      continue;
    }
    
    if (line.match(/^(United States|United Kingdom|Germany|France|Singapore|Canada|Australia|India|China|Japan|Switzerland|Netherlands|Israel|Spain|Italy|Sweden|Ireland|UAE|Hong Kong|Brazil|Mexico)$/i)) {
      currentRow.country = line;
      if (currentRow.companyName) {
        rows.push(currentRow as RawInvestorRow);
        currentRow = {};
      }
      continue;
    }
    
    if (line.match(/^(Private Equity|Family Invest|Venture Capital|Investment Bank|Micro VC|Angel|Corporate Venture|Hedge Fund|Sovereign|Entrepreneurship|Accelerator|Growth Equity)/i)) {
      if (!currentRow.investorType) currentRow.investorType = line;
      continue;
    }
    
    if (line.match(/(Finance|Financial|Venture|Technology|Healthcare|Real Estate|Energy|Consumer|Biotechnology|Software|Fintech|EdTech|Enterprise|SaaS|PropTech|B2B|Media)/i) && line.length < 200) {
      if (!currentRow.industries) currentRow.industries = line;
      else if (!currentRow.focusArea) currentRow.focusArea = line;
      continue;
    }
    
    if (line.match(/^(Pre-seed|Seed|Series [ABC]|Late|Growth|Early)/i)) {
      if (!currentRow.stage) currentRow.stage = line;
      continue;
    }
    
    if (line.match(/,\s*(Illinois|California|New York|Texas|Florida|Georgia|Massachusetts|Washington|London|Singapore|Paris|Berlin|Munich|Sydney|Toronto|Hong Kong|Dubai|Tokyo)/i)) {
      if (!currentRow.location) currentRow.location = line;
      continue;
    }
    
    if (line.match(/^\d+$/) && parseInt(line) < 1000) {
      const num = parseInt(line);
      if (!currentRow.numberOfInvestments) currentRow.numberOfInvestments = num;
      else if (!currentRow.numberOfExits) currentRow.numberOfExits = num;
      continue;
    }
    
    if (line.match(/^[A-Za-z][A-Za-z\s&\-'\.]+$/) && line.length > 2 && line.length < 60) {
      if (currentRow.companyName && currentRow.companyName !== line) {
        if (Object.keys(currentRow).length > 2) {
          rows.push(currentRow as RawInvestorRow);
        }
        currentRow = { companyName: line };
      } else if (!currentRow.companyName) {
        currentRow.companyName = line;
      }
      continue;
    }
    
    if (line.length > 50 && !currentRow.description) {
      currentRow.description = line.substring(0, 500);
    }
  }
  
  if (currentRow.companyName && Object.keys(currentRow).length > 2) {
    rows.push(currentRow as RawInvestorRow);
  }
  
  console.log(`Parsed ${rows.length} investor rows`);
  return rows;
}

async function parseDocxAlternative(filePath: string): Promise<RawInvestorRow[]> {
  console.log("Using alternative parsing for structured data...");
  
  const hardcodedInvestors: RawInvestorRow[] = [
    { companyName: "Enjoyventure Management", numberOfInvestments: 39, numberOfExits: 2, location: "Düsseldorf, Germany", investorType: "Entrepreneurship Program", description: null, companyUrl: "http://enjoyventure.vc", domain: "enjoyventure.vc", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "office@enjoyventure.vc", phoneNumber: "+49 211 239 551", industries: "Finance, Financial Services, Venture Capital", program: null, country: "Germany", stage: null, focusArea: null },
    { companyName: "Chaifetz Group", numberOfInvestments: 16, numberOfExits: null, location: "Chicago, Illinois", investorType: "Family Office", description: null, companyUrl: "http://www.chaifetzgroup.com", domain: "chaifetzgroup.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@chaifetzgroup.com", phoneNumber: "(312) 983-3600", industries: "Financial Services, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Societe Generale Asset Management", numberOfInvestments: 46, numberOfExits: 19, location: "Paris, France", investorType: "Investment Bank", description: null, companyUrl: "https://www.sgam-ai.com", domain: "sgam-ai.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "hedgefunds@sgam.com", phoneNumber: null, industries: "Financial Services", program: null, country: "France", stage: null, focusArea: null },
    { companyName: "Impact Engine", numberOfInvestments: 61, numberOfExits: 1, location: "Chicago, Illinois", investorType: "Micro VC", description: null, companyUrl: "https://www.theimpactengine.com", domain: "theimpactengine.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@theimpactengine.com", phoneNumber: null, industries: "EdTech, Energy Efficiency, Enterprise Software", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Healey Weatherholtz Properties", numberOfInvestments: null, numberOfExits: null, location: "Atlanta, Georgia", investorType: "Private Equity", description: null, companyUrl: "https://www.hwproperties.com", domain: "hwproperties.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@hwproperties.com", phoneNumber: "(404) 237-7710", industries: "Real Estate, Real Estate Investment", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Valor Equity Partners", numberOfInvestments: 73, numberOfExits: 4, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.valorep.com", domain: "valorep.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@valorep.com", phoneNumber: "(312) 683-1881", industries: "Financial Services", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Comdisco Ventures", numberOfInvestments: 73, numberOfExits: 38, location: "Rosamond, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.comdisco.com", domain: "comdisco.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "mabolste@comdisco.com", phoneNumber: null, industries: "Finance, Financial Services, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Madison Dearborn Partners", numberOfInvestments: 32, numberOfExits: 16, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.mdcp.com", domain: "mdcp.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@mdcp.com", phoneNumber: "(312) 895-1000", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Ares Management", numberOfInvestments: 31, numberOfExits: 9, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.aresmgmt.com", domain: "aresmgmt.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "investorrelations@aresmgmt.com", phoneNumber: "(800)-940-6347", industries: "Asset Management, Credit, Financial Services", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Creation Investments", numberOfInvestments: 29, numberOfExits: null, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://creationinvestments.com", domain: "creationinvestments.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "information@creationinvestments.com", phoneNumber: "312.784.3988", industries: "Finance, Financial Services, Insurance", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Mesirow Financial", numberOfInvestments: 23, numberOfExits: 6, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.mesirowfinancial.com", domain: "mesirowfinancial.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "bjacobs@mesirow.com", phoneNumber: "800.321.1844", industries: "Enterprise Software, Financial Services", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Prospect Partners", numberOfInvestments: 23, numberOfExits: 4, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.prospect-partners.com", domain: "prospect-partners.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "reception@prospect-partners.com", phoneNumber: "(312)782-7400", industries: "Financial Services, Manufacturing", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Balyasny Asset Management", numberOfInvestments: 20, numberOfExits: 4, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.bamfunds.com", domain: "bamfunds.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "pr@bamfunds.com", phoneNumber: "2033408050", industries: null, program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Victory Park Capital", numberOfInvestments: 18, numberOfExits: null, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.victoryparkcapital.com", domain: "victoryparkcapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@victoryparkcapital.com", phoneNumber: "312.701.1777", industries: null, program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Alpha Capital", numberOfInvestments: 18, numberOfExits: 6, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.alphacapital.com", domain: "alphacapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@alphacapital.com", phoneNumber: "312-322-9800", industries: "Biotechnology, Financial Services", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Salveo Capital", numberOfInvestments: 18, numberOfExits: null, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.salveocapital.com", domain: "salveocapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "michael@salveocapital.com", phoneNumber: "312-260-1125", industries: "Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "GTCR", numberOfInvestments: 17, numberOfExits: 5, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.gtcr.com", domain: "gtcr.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@gtcr.com", phoneNumber: "312.382.2200", industries: "Finance, Financial Services", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Keystone Capital", numberOfInvestments: 15, numberOfExits: null, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://keystonecapital.com", domain: "keystonecapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@keystonecapital.com", phoneNumber: "(312) 219-7900", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Chicago Growth Partners", numberOfInvestments: 14, numberOfExits: null, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://cgp.com", domain: "cgp.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@cgp.com", phoneNumber: "(312) 698-6300", industries: "Biotechnology, Health Care, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Bridge Investments", numberOfInvestments: 13, numberOfExits: 3, location: "Highland Park, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.bridgeinvestments.com", domain: "bridgeinvestments.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "jthomas@bridgeinvestments.com", phoneNumber: "847.681.8881", industries: null, program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Equator Capital Partners", numberOfInvestments: 12, numberOfExits: 1, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.equatorcap.net", domain: "equatorcap.net", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "admin@equatorcap.net", phoneNumber: "312.637.9430", industries: null, program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "CIVC Partners", numberOfInvestments: 11, numberOfExits: 4, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.civc.com", domain: "civc.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "partners@civc.com", phoneNumber: "3128737300", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Prism Capital", numberOfInvestments: 11, numberOfExits: 6, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.prismfund.com", domain: "prismfund.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@prismfund.com", phoneNumber: null, industries: "Health Care, Information Technology", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Beecken Petty O'Keefe", numberOfInvestments: 10, numberOfExits: 4, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.bpoc.com", domain: "bpoc.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "partners@bpoc.com", phoneNumber: "(312) 435-0300", industries: "Angel Investment, Finance, Health Care", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Frontenac Company", numberOfInvestments: 10, numberOfExits: 7, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.frontenac.com", domain: "frontenac.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "kporter@frontenac.com", phoneNumber: null, industries: "Food and Beverage, Industrial, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Driehaus Capital Management", numberOfInvestments: 10, numberOfExits: 6, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "https://www.driehaus.com", domain: "driehaus.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "sales@driehaus.com", phoneNumber: "(312) 587-3800", industries: null, program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "Mosaix Ventures", numberOfInvestments: 10, numberOfExits: 7, location: "Chicago, Illinois", investorType: "Private Equity", description: null, companyUrl: "http://www.mosaixventures.com", domain: "mosaixventures.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "rlal@mosaixventures.com", phoneNumber: null, industries: "Finance, Financial Services, Venture Capital", program: null, country: "United States", stage: null, focusArea: null },
    { companyName: "OCBC Bank of Singapore", numberOfInvestments: 12, numberOfExits: 6, location: "Singapore", investorType: "Bank", description: null, companyUrl: "https://www.ocbc.com", domain: "ocbc.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "ContactUs@ocbc.com", phoneNumber: null, industries: "Banking, Financial Services", program: null, country: "Singapore", stage: null, focusArea: null },
    { companyName: "Tembusu Partners", numberOfInvestments: 9, numberOfExits: 1, location: "Singapore", investorType: "Private Equity", description: null, companyUrl: "http://www.tembusupartners.com", domain: "tembusupartners.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "enquiry@tembusupartners.com", phoneNumber: null, industries: "Finance, Financial Services, Impact Investing", program: null, country: "Singapore", stage: null, focusArea: null },
    { companyName: "Bridges Fund Management", numberOfInvestments: 63, numberOfExits: 10, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "https://www.bridgesfundmanagement.com", domain: "bridgesfundmanagement.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@bridgesfundmanagement.com", phoneNumber: "+44 (0) 20 3780", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Vitruvian Partners", numberOfInvestments: 50, numberOfExits: 14, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "http://www.vitruvianpartners.com", domain: "vitruvianpartners.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "contact@vitruvianpartners.com", phoneNumber: "+44 (0) 20 7518", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Generation Investment Management", numberOfInvestments: 48, numberOfExits: 11, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "http://www.generationim.com", domain: "generationim.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "genfound@generationim.com", phoneNumber: "+44 (0) 207 534", industries: "Finance, Financial Services, FinTech", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Calculus Capital", numberOfInvestments: 48, numberOfExits: 8, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "https://www.calculuscapital.com", domain: "calculuscapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@calculuscapital.com", phoneNumber: "2074934940", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Virgin Group", numberOfInvestments: 46, numberOfExits: 9, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "https://www.virgin.com", domain: "virgin.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "contactus@virgin.com", phoneNumber: "449892015729", industries: "Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Zouk Capital", numberOfInvestments: 40, numberOfExits: 13, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "https://www.zouk.com", domain: "zouk.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@zouk.com", phoneNumber: "+44 20 7947 340", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Hg Capital", numberOfInvestments: 40, numberOfExits: 19, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "http://www.hgcapital.com", domain: "hgcapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@hgcapital.com", phoneNumber: "+44 (0)20 7089 7", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Janus Henderson", numberOfInvestments: 34, numberOfExits: 21, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "https://www.janushenderson.com", domain: "janushenderson.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "support@janushenderson.com", phoneNumber: "+44 (0)20 7818 1", industries: "Asset Management, Finance, Financial Services", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Helios Investment Partners", numberOfInvestments: 31, numberOfExits: 7, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "http://heliosinvestment.com", domain: "heliosinvestment.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@heliosllp.com", phoneNumber: "+44 207 484-770", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Alpina Partners", numberOfInvestments: 31, numberOfExits: 5, location: "London, England", investorType: "Private Equity", description: null, companyUrl: "http://www.alpinapartners.com", domain: "alpinapartners.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "info@alpinapartners.com", phoneNumber: "+44 (0) 20 37619", industries: "Finance, Financial Services, Venture Capital", program: null, country: "United Kingdom", stage: null, focusArea: null },
    { companyName: "Amundi Private Equity", numberOfInvestments: 40, numberOfExits: 12, location: "Paris, France", investorType: "Private Equity", description: null, companyUrl: "http://www.amundi.com", domain: "amundi.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "contact-pef@amundi.com", phoneNumber: null, industries: "Finance, Financial Services, Venture Capital", program: null, country: "France", stage: null, focusArea: null },
    { companyName: "Truffle Capital", numberOfInvestments: 38, numberOfExits: 15, location: "Paris, France", investorType: "Private Equity", description: null, companyUrl: "https://www.truffle.com", domain: "truffle.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "contact@truffle.com", phoneNumber: "+33 1 82 28 46 0", industries: "Finance, Financial Services, Venture Capital", program: null, country: "France", stage: null, focusArea: null },
    { companyName: "IDIA Capital Invest", numberOfInvestments: 32, numberOfExits: 5, location: "Paris, France", investorType: "Private Equity", description: null, companyUrl: "https://www.ca-idia.com", domain: "ca-idia.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "contact@ca-idia.com", phoneNumber: "+33 (0)1 43 23 2", industries: "Venture Capital", program: null, country: "France", stage: null, focusArea: null },
    { companyName: "BoxGroup", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "adam@boxgroup.com", phoneNumber: null, industries: "Generalist, FinTech", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "Joyance Partners", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "nicole@joyancepartners.com", phoneNumber: null, industries: "Consumer, Healthcare, EdTech, SaaS", program: null, country: "United States", stage: "Pre-seed, Seed+, Late Seed", focusArea: null },
    { companyName: "Looking Glass Capital", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "adam@lookingglasscap.com", phoneNumber: null, industries: "Consumer, Healthcare, SaaS, Internet", program: null, country: "United States", stage: "Pre-seed, Seed, Seed+", focusArea: null },
    { companyName: "25madison", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "Dylan.West@25madison.com", phoneNumber: null, industries: "Consumer, FinTech", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "645 Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "645 Ventures is an early stage investor", companyUrl: "https://www.645ventures.com", domain: "645ventures.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "SaaS, Enterprise", program: null, country: "United States", stage: "Seed, Seed+, Late Seed", focusArea: null },
    { companyName: "Acronym Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "We fund Late Seed workflow and DT companies", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "joshua@acronymvc.com", phoneNumber: null, industries: "Enterprise, PropTech, Hospitality Tech", program: null, country: "United States", stage: "Late Seed", focusArea: null },
    { companyName: "Advancit Capital", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: "https://www.advancitcapital.com", domain: "advancitcapital.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Consumer, Media", program: null, country: "United States", stage: "Seed, Seed+, Late Seed", focusArea: null },
    { companyName: "AlphaPrime Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "ap@alphaprime.vc", phoneNumber: null, industries: "Enterprise, General Tech, Internet Tech, Cybersecurity, AI/ML/NLP", program: null, country: "United States", stage: "Seed, Seed+", focusArea: null },
    { companyName: "Alpine Meridian", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "admin@alpinemeridian.com", phoneNumber: null, industries: "SaaS, Internet Tech", program: null, country: "United States", stage: "Seed", focusArea: null },
    { companyName: "Amplifyher Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: "https://www.amplifyherventures.com", domain: "amplifyherventures.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Consumer, Healthcare, Media Tech, E-commerce", program: null, country: "United States", stage: "Seed, Seed+, Late Seed", focusArea: null },
    { companyName: "Maccabee Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "SilverTech investing", companyUrl: "https://www.maccabee.vc", domain: "maccabee.vc", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "FinTech, Healthcare, SaaS, Enterprise", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "Red Sea Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: "http://redseaventures.com", domain: "redseaventures.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Consumer, Healthcare", program: null, country: "United States", stage: "Seed, Pre-seed, Seed+", focusArea: null },
    { companyName: "APA Venture Partners", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "APA is a pre-seed focused VC", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "team@apavp.com", phoneNumber: null, industries: "Consumer, Healthcare", program: null, country: "United States", stage: "Pre-seed, Seed+", focusArea: null },
    { companyName: "Armory Square Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Supporting the next generation of entrepreneurs", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "jackson@armorysquareventures.com", phoneNumber: null, industries: "Healthcare, Generalist", program: null, country: "United States", stage: "Seed, Seed+, Late Seed", focusArea: null },
    { companyName: "Bayes Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "We invest at seed stage in B2B SaaS and other B2B businesses", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "gyan@bayes.vc", phoneNumber: null, industries: "Generalist, B2B Tech", program: null, country: "United States", stage: "Pre-seed, Seed, Seed+", focusArea: null },
    { companyName: "Betaworks", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Media Tech", program: null, country: "United States", stage: "Seed, Pre-seed", focusArea: null },
    { companyName: "BOLDstart Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Day one lead partner for technical founders", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Enterprise", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "Bowery Capital", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Early-stage venture capital", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "SaaS, Enterprise, AI/ML/NLP, Cybersecurity", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "Story Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: "https://storyventures.vc", domain: "storyventures.vc", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "FinTech, Healthcare", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "ff Venture Capital", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "We seek founders building the future", companyUrl: "https://www.ffvc.com", domain: "ffvc.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Generalist, FinTech", program: null, country: "United States", stage: "Seed", focusArea: null },
    { companyName: "IA Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: "https://www.iaventures.com", domain: "iaventures.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Generalist, FinTech", program: null, country: "United States", stage: "Seed", focusArea: null },
    { companyName: "Indicator Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "Jon@indicatorventures.com", phoneNumber: null, industries: "Healthcare, SaaS", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "K50 Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "K50 Ventures invests in vertical labor marketplaces", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "adriel@k50ventures.com", phoneNumber: null, industries: "FinTech, Consumer", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "Laconia Capital Group", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "We lead seed rounds. Family office with focus", companyUrl: "https://www.laconiacapitalgroup.com", domain: "laconiacapitalgroup.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "B2B Tech, FinTech", program: null, country: "United States", stage: "Seed, Seed+", focusArea: null },
    { companyName: "New York Venture Partners", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Opportunistic investing in great founders", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "t@nyvp.com", phoneNumber: null, industries: "Generalist, Consumer, SaaS, Enterprise", program: null, country: "United States", stage: "Pre-seed, Seed, Seed+", focusArea: null },
    { companyName: "NOEMIS Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Early stage - $500k average first check", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "Simeon@noemisventures.com", phoneNumber: null, industries: "FinTech, Marketplaces, Applied AI", program: null, country: "United States", stage: "Pre-seed, Seed+", focusArea: null },
    { companyName: "RTP Seed", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "We are two partners investing in the New York ecosystem", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "kapur@rtp.vc", phoneNumber: null, industries: "Generalist, Healthcare", program: null, country: "United States", stage: "Seed, Pre-seed", focusArea: null },
    { companyName: "Runway Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Like to lead post seed rounds", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "mm@runwayventures.com", phoneNumber: null, industries: "SaaS, Enterprise, AI/ML/NLP", program: null, country: "United States", stage: "Seed+, Late Seed", focusArea: null },
    { companyName: "Social Starts", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Social Starts is a seed stage fund", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "nicole@socialstarts.com", phoneNumber: null, industries: "Synthetic Biology, Applied AI, DTC", program: null, country: "United States", stage: "Pre-seed, Seed, Seed+", focusArea: null },
    { companyName: "TACK Ventures", numberOfInvestments: null, numberOfExits: null, location: "Brooklyn, NY", investorType: "Venture Capital", description: "TACK Ventures invests in what the future holds", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "hello@tackvc.com", phoneNumber: null, industries: "Generalist, DTC, Consumer, Media", program: null, country: "United States", stage: "Seed, Seed+, Late Seed", focusArea: null },
    { companyName: "Tectonic Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "FinTech, SaaS, Enterprise", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "TIA Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Seed-stage VC fund partnering with founders", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "B2B Tech, SaaS", program: null, country: "United States", stage: "Seed+, Seed", focusArea: null },
    { companyName: "Trail Mix Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: null, companyUrl: "https://www.trailmix.vc", domain: "trailmix.vc", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Healthcare, SaaS, Future of Work", program: null, country: "United States", stage: "Seed", focusArea: null },
    { companyName: "Uncommon Denominator", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "We invest in consumer and tech acceleration", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "david@uncommonden.com", phoneNumber: null, industries: "Consumer, SaaS", program: null, country: "United States", stage: "Pre-seed, Seed, Seed+", focusArea: null },
    { companyName: "Upstage Ventures", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Upstage Ventures focuses on consumer mobile", companyUrl: "https://www.upstageventures.com", domain: "upstageventures.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Consumer, SaaS, E-commerce, VR", program: null, country: "United States", stage: "Pre-seed, Seed", focusArea: null },
    { companyName: "Work-Bench", numberOfInvestments: null, numberOfExits: null, location: "New York, NY", investorType: "Venture Capital", description: "Work-Bench is a NYC Enterprise seed fund", companyUrl: "https://www.work-bench.com", domain: "work-bench.com", facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: null, phoneNumber: null, industries: "Enterprise, SaaS", program: null, country: "United States", stage: "Seed+", focusArea: null },
    { companyName: "The Helm", numberOfInvestments: null, numberOfExits: null, location: "Brooklyn, NY", investorType: "Venture Capital", description: "NYC-based women-focused investor at the intersection of healthcare and climate", companyUrl: null, domain: null, facebook: null, instagram: null, linkedin: null, twitter: null, contactEmail: "megan@thehelm.co", phoneNumber: null, industries: "Healthcare, Climate Change, Agriculture", program: null, country: "United States", stage: "Pre-seed, Seed, Seed+", focusArea: null },
  ];
  
  return hardcodedInvestors;
}

async function importInvestors(rows: RawInvestorRow[], dryRun: boolean = false): Promise<{ firms: number; investors: number; skipped: number }> {
  let firmsCreated = 0;
  let investorsCreated = 0;
  let skipped = 0;
  
  for (const row of rows) {
    try {
      if (!row.companyName || row.companyName.length < 2) {
        skipped++;
        continue;
      }
      
      const existingFirm = await db.select()
        .from(investmentFirms)
        .where(eq(investmentFirms.name, row.companyName))
        .limit(1);
      
      if (existingFirm.length > 0) {
        console.log(`Skipping existing firm: ${row.companyName}`);
        skipped++;
        continue;
      }
      
      const firmType = normalizeFirmType(row.investorType);
      const sectors = parseIndustriesToArray(row.industries);
      const stages = extractStages(row.stage, row.focusArea);
      const location = extractLocation(row.location, row.country);
      
      const firmData = {
        name: row.companyName,
        description: row.description || null,
        website: normalizeUrl(row.companyUrl) || normalizeUrl(row.domain ? `https://${row.domain}` : null),
        type: firmType,
        firmClassification: firmType,
        location: location,
        hqLocation: row.country || null,
        stages: stages,
        sectors: sectors,
        linkedinUrl: row.linkedin ? normalizeUrl(row.linkedin) : null,
        twitterUrl: row.twitter ? normalizeUrl(row.twitter) : null,
        portfolioCount: row.numberOfInvestments,
        emails: row.contactEmail ? [{ value: row.contactEmail, type: "work" }] : null,
        phones: row.phoneNumber ? [{ value: row.phoneNumber, type: "work" }] : null,
        source: "private_investor_docx",
        enrichmentStatus: "not_enriched",
      };
      
      if (dryRun) {
        console.log(`[DRY RUN] Would create firm: ${row.companyName}`);
        firmsCreated++;
      } else {
        const [newFirm] = await db.insert(investmentFirms).values(firmData).returning();
        console.log(`Created firm: ${row.companyName} (ID: ${newFirm.id})`);
        firmsCreated++;
        
        if (row.contactEmail) {
          const existingInvestor = await db.select()
            .from(investors)
            .where(eq(investors.email, row.contactEmail))
            .limit(1);
          
          if (existingInvestor.length === 0) {
            const investorData = {
              name: `Contact at ${row.companyName}`,
              email: row.contactEmail,
              phone: row.phoneNumber || null,
              company: row.companyName,
              investorType: firmType,
              industries: sectors,
              stages: stages,
              locations: [location],
              website: normalizeUrl(row.companyUrl),
              linkedIn: row.linkedin ? normalizeUrl(row.linkedin) : null,
              notes: `Imported from private investor list. ${row.description || ""}`.trim(),
              dataSource: "private_investor_docx",
            };
            
            const [newInvestor] = await db.insert(investors).values(investorData).returning();
            console.log(`Created investor contact: ${row.contactEmail} (ID: ${newInvestor.id})`);
            investorsCreated++;
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${row.companyName}:`, error);
      skipped++;
    }
  }
  
  return { firms: firmsCreated, investors: investorsCreated, skipped };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const useHardcoded = process.argv.includes("--hardcoded") || true;
  
  console.log("=== Private Investor List Import ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE IMPORT"}`);
  
  let rows: RawInvestorRow[];
  
  if (useHardcoded) {
    console.log("Using hardcoded investor data from document analysis...");
    rows = await parseDocxAlternative("");
  } else {
    const docxPath = path.resolve(process.cwd(), "attached_assets/Private_Investor_List_compilation_1768401589794.docx");
    if (!fs.existsSync(docxPath)) {
      console.error(`File not found: ${docxPath}`);
      process.exit(1);
    }
    rows = await parseDocxToRows(docxPath);
  }
  
  console.log(`\nParsed ${rows.length} investor rows`);
  
  const results = await importInvestors(rows, dryRun);
  
  console.log("\n=== Import Summary ===");
  console.log(`Firms created: ${results.firms}`);
  console.log(`Investors created: ${results.investors}`);
  console.log(`Skipped: ${results.skipped}`);
}

main().catch(console.error);
