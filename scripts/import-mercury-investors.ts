import { db } from "../server/db";
import { investors, investmentFirms } from "../shared/schema";
import { eq } from "drizzle-orm";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

interface MercuryInvestor {
  "Investor Name": string;
  "Firm": string;
  "Email": string;
  "LinkedIn": string;
  "Twitter/X": string;
  "Profile URL": string;
  "Industries": string;
  "Stages": string;
  "Check Size": string;
  "Geography": string;
  "Leads Rounds": string;
  "Bio": string;
}

async function importMercuryInvestors() {
  console.log("Starting Mercury investor import...");
  
  const workbook = XLSX.readFile("attached_assets/Mercury_Full_Investor_Database_1767746712092.xlsx");
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: MercuryInvestor[] = XLSX.utils.sheet_to_json(sheet);
  
  console.log(`Found ${data.length} investors to import`);
  
  let created = 0;
  let updated = 0;
  let firmsCreated = 0;
  const firmCache = new Map<string, string>();
  
  for (const row of data) {
    try {
      const investorName = row["Investor Name"]?.trim();
      if (!investorName) continue;
      
      // Parse name into first/last
      const nameParts = investorName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      
      const email = row["Email"]?.trim() || null;
      const firmName = row["Firm"]?.trim() || null;
      const linkedinUrl = row["LinkedIn"]?.trim() || null;
      const twitterUrl = row["Twitter/X"]?.trim() || null;
      const bio = row["Bio"]?.trim() || null;
      
      // Parse industries into sectors array
      const industriesStr = row["Industries"]?.trim() || "";
      const sectors = industriesStr
        .split(",")
        .map(s => s.trim())
        .filter(s => s && !s.includes("+") && s.length > 1);
      
      // Parse stages
      const stagesStr = row["Stages"]?.trim() || "";
      const stages = stagesStr === "All stages" 
        ? ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"]
        : stagesStr.split(",").map(s => s.trim()).filter(Boolean);
      
      // Parse check size
      const checkSize = row["Check Size"]?.trim() || null;
      
      // Parse geography
      const geography = row["Geography"]?.trim() || null;
      
      // Find or create firm
      let firmId: string | null = null;
      if (firmName) {
        if (firmCache.has(firmName)) {
          firmId = firmCache.get(firmName)!;
        } else {
          // Check if firm exists
          const existingFirm = await db.select()
            .from(investmentFirms)
            .where(eq(investmentFirms.name, firmName))
            .limit(1);
          
          if (existingFirm.length > 0) {
            firmId = existingFirm[0].id;
          } else {
            // Create new firm
            const [newFirm] = await db.insert(investmentFirms).values({
              name: firmName,
              classification: "Venture Capital",
              isActive: true,
              source: "mercury",
            }).returning();
            firmId = newFirm.id;
            firmsCreated++;
          }
          firmCache.set(firmName, firmId);
        }
      }
      
      // Check if investor exists by email
      let existingInvestor = null;
      if (email) {
        const found = await db.select()
          .from(investors)
          .where(eq(investors.email, email))
          .limit(1);
        if (found.length > 0) {
          existingInvestor = found[0];
        }
      }
      
      if (existingInvestor) {
        // Update existing investor
        await db.update(investors)
          .set({
            firmId: firmId || existingInvestor.firmId,
            linkedinUrl: linkedinUrl || existingInvestor.linkedinUrl,
            twitterUrl: twitterUrl || existingInvestor.twitterUrl,
            bio: bio || existingInvestor.bio,
            sectors: sectors.length > 0 ? sectors : existingInvestor.sectors,
            stages: stages.length > 0 ? stages : existingInvestor.stages,
            typicalInvestment: checkSize || existingInvestor.typicalInvestment,
            location: geography || existingInvestor.location,
            source: "mercury",
            updatedAt: new Date(),
          })
          .where(eq(investors.id, existingInvestor.id));
        updated++;
      } else {
        // Create new investor
        await db.insert(investors).values({
          firstName,
          lastName,
          email,
          firmId,
          linkedinUrl,
          twitterUrl,
          bio,
          sectors,
          stages,
          typicalInvestment: checkSize,
          location: geography,
          isActive: true,
          source: "mercury",
        });
        created++;
      }
      
    } catch (error) {
      console.error(`Error processing investor ${row["Investor Name"]}:`, error);
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`- Investors created: ${created}`);
  console.log(`- Investors updated: ${updated}`);
  console.log(`- Firms created: ${firmsCreated}`);
  
  process.exit(0);
}

importMercuryInvestors().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
