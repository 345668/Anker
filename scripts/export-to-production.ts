import { db } from "../server/db";
import { investors, investmentFirms, contacts } from "../shared/schema";
import * as fs from "fs";

function escapeString(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${val.replace(/'/g, "''")}'`;
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return escapeString(val.toISOString());
  if (Array.isArray(val)) {
    const formatted = val.map(v => escapeString(String(v))).join(",");
    return `ARRAY[${formatted}]`;
  }
  if (typeof val === "object") return escapeString(JSON.stringify(val));
  return escapeString(String(val));
}

async function exportTable(tableName: string, data: any[], columns: string[]): Promise<string> {
  if (data.length === 0) return `-- No data in ${tableName}\n`;
  
  let sql = `-- ${tableName}: ${data.length} records\n`;
  sql += `-- Run this after ensuring the table exists\n\n`;
  
  // Add conflict handling to avoid duplicates
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    sql += `INSERT INTO ${tableName} (${columns.join(", ")})\nVALUES\n`;
    
    const values = batch.map(row => {
      const vals = columns.map(col => formatValue(row[col]));
      return `  (${vals.join(", ")})`;
    });
    
    sql += values.join(",\n");
    sql += `\nON CONFLICT (id) DO NOTHING;\n\n`;
  }
  
  return sql;
}

async function main() {
  console.log("Exporting data from development database...\n");
  
  // Export investors
  console.log("Fetching investors...");
  const allInvestors = await db.select().from(investors);
  console.log(`Found ${allInvestors.length} investors`);
  
  const investorColumns = [
    "id", "folk_id", "first_name", "last_name", "email", "phone", 
    "linkedin_url", "twitter_url", "bio", "investment_firm_id", 
    "job_title", "location", "investment_focus", "check_size_min", 
    "check_size_max", "notes", "tags", "stage_preferences", 
    "sector_preferences", "enrichment_status", "last_enrichment_date"
  ];
  
  const investorsSql = await exportTable("investors", allInvestors, investorColumns);
  fs.writeFileSync("scripts/export_investors.sql", investorsSql);
  console.log("Written to scripts/export_investors.sql");
  
  // Export investment firms
  console.log("\nFetching investment firms...");
  const allFirms = await db.select().from(investmentFirms);
  console.log(`Found ${allFirms.length} investment firms`);
  
  const firmColumns = [
    "id", "folk_id", "name", "website", "description", "location", 
    "linkedin_url", "twitter_url", "logo_url", "type", "aum", 
    "investment_focus", "stage_focus", "sector_focus", "check_size_min", 
    "check_size_max", "portfolio_count", "notable_investments", 
    "contact_email", "contact_phone", "notes", "tags",
    "enrichment_status", "last_enrichment_date"
  ];
  
  const firmsSql = await exportTable("investment_firms", allFirms, firmColumns);
  fs.writeFileSync("scripts/export_investment_firms.sql", firmsSql);
  console.log("Written to scripts/export_investment_firms.sql");
  
  // Export contacts
  console.log("\nFetching contacts...");
  const allContacts = await db.select().from(contacts);
  console.log(`Found ${allContacts.length} contacts`);
  
  if (allContacts.length > 0) {
    const contactColumns = [
      "id", "folk_id", "first_name", "last_name", "email", "phone",
      "company", "job_title", "linkedin_url", "twitter_url", "notes",
      "tags", "source", "status", "last_contacted_at", "user_id"
    ];
    
    const contactsSql = await exportTable("contacts", allContacts, contactColumns);
    fs.writeFileSync("scripts/export_contacts.sql", contactsSql);
    console.log("Written to scripts/export_contacts.sql");
  }
  
  console.log("\n✅ Export complete!");
  console.log("\nTo import into production:");
  console.log("1. Open the Database pane in Replit");
  console.log("2. Switch to your production database");
  console.log("3. Run the SQL files in this order:");
  console.log("   - export_investment_firms.sql (firms first, as investors reference them)");
  console.log("   - export_investors.sql");
  console.log("   - export_contacts.sql (if any)");
  
  process.exit(0);
}

main().catch(err => {
  console.error("Export failed:", err);
  process.exit(1);
});
