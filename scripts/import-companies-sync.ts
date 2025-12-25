import { db } from "../server/db";
import { investmentFirms, folkImportRuns } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const FOLK_API_KEY = process.env.FOLK_API_KEY!;
const FOLK_API_BASE = "https://api.folk.app";

interface FolkCompany {
  id: string;
  name?: string;
  description?: string;
  emails?: Array<{ value: string }>;
  phones?: Array<{ value: string }>;
  addresses?: Array<{ value: string }>;
  urls?: Array<{ value: string }>;
  groups?: Array<{ id: string }>;
  customFieldValues?: Record<string, Record<string, any>>;
  industry?: string;
  updatedAt?: string;
}

async function fetchAllCompanies(groupId: string): Promise<FolkCompany[]> {
  const companies: FolkCompany[] = [];
  let nextUrl: string | undefined = `${FOLK_API_BASE}/v1/companies?limit=100&filter%5Bgroups%5D%5Bin%5D%5Bid%5D=${groupId}`;
  
  console.log(`Fetching companies from group ${groupId}...`);
  
  while (nextUrl) {
    console.log(`Fetching: ${companies.length} fetched so far...`);
    
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${FOLK_API_KEY}` },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const data = await response.json();
    const items = data.data?.items || [];
    companies.push(...items);
    
    // Use nextLink for pagination
    nextUrl = data.data?.pagination?.nextLink;
    
    if (items.length === 0) break;
  }
  
  console.log(`Total companies fetched: ${companies.length}`);
  return companies;
}

function extractCustomFields(company: FolkCompany, groupId: string): Record<string, any> {
  const customFields: Record<string, any> = {};
  
  if (company.customFieldValues) {
    for (const [gId, fields] of Object.entries(company.customFieldValues)) {
      if (typeof fields === 'object') {
        Object.assign(customFields, fields);
      }
    }
  }
  
  return customFields;
}

async function importCompanies() {
  const groupId = "grp_dbc35f0d-7ac7-4315-9d45-ec8a415ceaba";
  const userId = "33133283";
  
  console.log("Starting companies import from '10K Early Stage Investors' group...");
  
  // Fetch all companies
  const companies = await fetchAllCompanies(groupId);
  
  if (companies.length === 0) {
    console.log("No companies found in this group!");
    process.exit(0);
  }
  
  // Create import run
  const [importRun] = await db.insert(folkImportRuns).values({
    sourceType: "companies",
    status: "in_progress",
    initiatedBy: userId,
    totalRecords: companies.length,
    importStage: "processing",
  }).returning();
  
  console.log(`Import run created: ${importRun.id}`);
  console.log(`Processing ${companies.length} companies...`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    
    try {
      const customFields = extractCustomFields(company, groupId);
      const linkedinUrl = customFields["Linkedin"] || customFields["LinkedIn Link"] || customFields["Company Linkedin Url"];
      const website = customFields["Website"] || (company.urls && company.urls[0]?.value);
      
      // Check if exists by folkId
      const existing = await db.select().from(investmentFirms)
        .where(eq(investmentFirms.folkId, company.id))
        .limit(1);
      
      const firmData = {
        name: company.name || "Unknown",
        description: company.description || "",
        website: website || null,
        linkedinUrl: linkedinUrl || null,
        emails: company.emails || [],
        phones: company.phones || [],
        addresses: company.addresses || [],
        urls: company.urls?.map(u => u.value) || [],
        industry: company.industry || customFields["Industry"] || customFields["Sectors"] || null,
        hqLocation: customFields["HQ Location"] || customFields["Location"] || null,
        folkId: company.id,
        folkWorkspaceId: groupId,
        folkListIds: company.groups?.map(g => g.id) || [groupId],
        folkUpdatedAt: company.updatedAt ? new Date(company.updatedAt) : new Date(),
        folkCustomFields: customFields,
        source: "folk" as const,
      };
      
      if (existing.length > 0) {
        await db.update(investmentFirms)
          .set({ ...firmData, updatedAt: new Date() })
          .where(eq(investmentFirms.folkId, company.id));
        updated++;
      } else {
        await db.insert(investmentFirms).values(firmData);
        created++;
      }
      
      if ((i + 1) % 100 === 0) {
        console.log(`Progress: ${i + 1}/${companies.length} (created: ${created}, updated: ${updated})`);
        
        // Update import run progress
        await db.update(folkImportRuns)
          .set({ 
            processedRecords: i + 1,
            createdRecords: created,
            updatedRecords: updated,
            progressPercent: Math.floor((i + 1) / companies.length * 100)
          })
          .where(eq(folkImportRuns.id, importRun.id));
      }
    } catch (error: any) {
      console.error(`Failed to import company ${company.id}: ${error.message}`);
      failed++;
    }
  }
  
  // Mark import as complete
  await db.update(folkImportRuns)
    .set({ 
      status: "completed",
      processedRecords: companies.length,
      createdRecords: created,
      updatedRecords: updated,
      skippedRecords: skipped,
      failedRecords: failed,
      progressPercent: 100,
      importStage: "completed",
      completedAt: new Date(),
    })
    .where(eq(folkImportRuns.id, importRun.id));
  
  console.log("\n=== Import Complete ===");
  console.log(`Total: ${companies.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  
  // Get total firms count
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(investmentFirms);
  console.log(`\nTotal investment firms in database: ${countResult.count}`);
  
  process.exit(0);
}

importCompanies().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
