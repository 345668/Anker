import { db } from "../server/db";
import { investmentFirms, folkImportRuns } from "../shared/schema";
import { eq } from "drizzle-orm";

const FOLK_API_BASE = "https://api.folk.app";
const GROUP_ID = "grp_aa703c07-2212-4f88-b0ac-19d79adbbf2b";
const GROUP_NAME = "DeepTech VCs";
const USER_ID = "33133283";

const INDUSTRY_COLUMNS = ["AI/ML", "Biotech", "Cleantech", "Energy", "Food & Ag", "Healthtech", "Materials", "Mobility"];
const LOCATION_COLUMNS = ["Asia", "Canada", "Europe", "Israel", "Worldwide"];
const STAGE_COLUMNS = ["Pre-seed", "Seed", "Series A", "Series B+"];

interface FolkCompany {
  id: string;
  name?: string;
  description?: string;
  emails?: Array<{ value: string }>;
  phones?: Array<{ value: string }>;
  addresses?: Array<{ value: string }>;
  urls?: string[];
  groups?: Array<{ id: string; name: string }>;
  customFieldValues?: Record<string, Record<string, any>>;
  industry?: string;
  updatedAt?: string;
  createdAt?: string;
}

function isXMarked(value: any): boolean {
  if (!value) return false;
  const str = String(value).toLowerCase().trim();
  return str === "x";
}

function extractXBasedArray(fields: Record<string, any>, columns: string[]): string[] {
  return columns.filter(col => isXMarked(fields[col]));
}

function mapFirmType(folkType: string | null | undefined): string | null {
  if (!folkType) return null;
  const type = folkType.toLowerCase().trim();
  
  const typeMap: Record<string, string> = {
    "vc": "Venture Capital",
    "venture capital": "Venture Capital",
    "cvc": "Corporate VC",
    "corporate vc": "Corporate VC",
    "corporate venture capital": "Corporate VC",
    "startup studio": "Accelerator",
    "accelerator": "Accelerator",
    "incubator": "Accelerator",
    "angel": "Angel Investor",
    "angel investor": "Angel Investor",
    "family office": "Family Office",
    "pe": "Private Equity",
    "private equity": "Private Equity",
    "bank": "Bank",
    "institutional": "Institutional Investor",
    "sovereign wealth fund": "Sovereign Wealth Fund",
    "fund of funds": "Fund of Funds",
    "asset manager": "Asset & Wealth Manager",
  };
  
  return typeMap[type] || null;
}

async function fetchAllCompanies(): Promise<FolkCompany[]> {
  const companies: FolkCompany[] = [];
  let nextUrl: string | undefined = `${FOLK_API_BASE}/v1/companies?limit=100&filter%5Bgroups%5D%5Bin%5D%5Bid%5D=${GROUP_ID}`;
  
  console.log(`Fetching companies from "${GROUP_NAME}" group...`);
  
  while (nextUrl) {
    console.log(`  Fetched ${companies.length} so far...`);
    
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${process.env.FOLK_API_KEY}` },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const data = await response.json();
    const items = data.data?.items || [];
    companies.push(...items);
    
    nextUrl = data.data?.pagination?.nextLink;
    if (items.length === 0) break;
  }
  
  console.log(`Total companies fetched: ${companies.length}`);
  return companies;
}

function processCompany(company: FolkCompany): Record<string, any> {
  const customFields = company.customFieldValues?.[GROUP_ID] || {};
  
  const industries = extractXBasedArray(customFields, INDUSTRY_COLUMNS);
  const locations = extractXBasedArray(customFields, LOCATION_COLUMNS);
  const stages = extractXBasedArray(customFields, STAGE_COLUMNS);
  
  const countryHQ = customFields["Country HQ"] || null;
  const firmType = customFields["Type"] || null;
  const minTicket = customFields["Min ticket"] || null;
  const maxTicket = customFields["Max ticket"] || null;
  const fundSize = customFields["Size of current DT fund(s)"] || null;
  const dtDeals = customFields["# DT deals in portfolio"] || null;
  const dtOnly = customFields["DT Only?"] || null;
  const parentCompany = customFields["Parent Company"] || null;
  
  const website = company.urls?.[0] || null;
  
  const description = [
    company.description,
    parentCompany ? `Parent Company: ${parentCompany}` : null,
    dtOnly === "Yes" ? "DeepTech focused" : null,
    dtDeals && dtDeals !== "--" ? `DeepTech deals: ${dtDeals}` : null,
    fundSize && fundSize !== "--" ? `Fund size: ${fundSize}` : null,
  ].filter(Boolean).join(". ");
  
  return {
    name: company.name || "Unknown",
    description: description || null,
    website: website,
    linkedinUrl: null,
    emails: company.emails || [],
    phones: company.phones || [],
    addresses: company.addresses || [],
    urls: company.urls || [],
    industry: industries.join(", ") || null,
    sectors: industries,
    stages: stages,
    location: locations.length > 0 ? locations.join(", ") : countryHQ,
    hqLocation: countryHQ,
    checkSizeMin: null,
    checkSizeMax: null,
    firmClassification: mapFirmType(firmType),
    folkId: company.id,
    folkWorkspaceId: GROUP_ID,
    folkListIds: company.groups?.map(g => g.id) || [GROUP_ID],
    folkUpdatedAt: company.updatedAt ? new Date(company.updatedAt) : new Date(),
    folkCustomFields: {
      dtOnly: dtOnly,
      dtDeals: dtDeals,
      fundSize: fundSize,
      parentCompany: parentCompany,
      minTicket: minTicket,
      maxTicket: maxTicket,
      rawIndustries: industries,
      rawLocations: locations,
      rawStages: stages,
    },
  };
}

async function importCompanies() {
  console.log(`\n=== Importing from "${GROUP_NAME}" ===\n`);
  
  const companies = await fetchAllCompanies();
  
  if (companies.length === 0) {
    console.log("No companies found!");
    process.exit(0);
  }
  
  const [importRun] = await db.insert(folkImportRuns).values({
    sourceType: "companies",
    status: "in_progress",
    initiatedBy: USER_ID,
    totalRecords: companies.length,
    importStage: "processing",
  }).returning();
  
  console.log(`Import run: ${importRun.id}`);
  console.log(`Processing ${companies.length} companies...\n`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    
    try {
      const firmData = processCompany(company);
      
      const existing = await db.select().from(investmentFirms)
        .where(eq(investmentFirms.folkId, company.id))
        .limit(1);
      
      if (existing.length > 0) {
        await db.update(investmentFirms)
          .set({ ...firmData, updatedAt: new Date() })
          .where(eq(investmentFirms.folkId, company.id));
        updated++;
      } else {
        await db.insert(investmentFirms).values(firmData as any);
        created++;
      }
      
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${companies.length} (created: ${created}, updated: ${updated})`);
      }
    } catch (error: any) {
      console.error(`  Failed: ${company.name} - ${error.message}`);
      failed++;
    }
  }
  
  await db.update(folkImportRuns)
    .set({
      status: "completed",
      createdRecords: created,
      updatedRecords: updated,
      skippedRecords: skipped,
      failedRecords: failed,
      importStage: "completed",
      completedAt: new Date(),
    })
    .where(eq(folkImportRuns.id, importRun.id));
  
  console.log(`\n=== Import Complete ===`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${companies.length}`);
}

importCompanies().catch(console.error);
