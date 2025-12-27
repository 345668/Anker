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
    return escapeString(JSON.stringify(val));
  }
  if (typeof val === "object") return escapeString(JSON.stringify(val));
  return escapeString(String(val));
}

async function exportTableWithUpsert(tableName: string, data: any[], columns: string[]): Promise<string> {
  if (data.length === 0) return `-- No data in ${tableName}\n`;
  
  let sql = `-- ${tableName}: ${data.length} records (UPSERT mode)\n`;
  sql += `-- This will INSERT new records and UPDATE existing ones\n\n`;
  
  const updateColumns = columns.filter(c => c !== 'id');
  
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    sql += `INSERT INTO ${tableName} (${columns.join(", ")})\nVALUES\n`;
    
    const values = batch.map(row => {
      const vals = columns.map(col => {
        const camelCol = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return formatValue(row[camelCol] ?? row[col]);
      });
      return `  (${vals.join(", ")})`;
    });
    
    sql += values.join(",\n");
    
    // Use ON CONFLICT DO UPDATE to upsert
    sql += `\nON CONFLICT (id) DO UPDATE SET\n`;
    sql += updateColumns.map(col => `  ${col} = EXCLUDED.${col}`).join(",\n");
    sql += `;\n\n`;
  }
  
  return sql;
}

async function main() {
  console.log("Exporting data from development database (UPSERT mode)...\n");
  
  // Export investment firms
  console.log("Fetching investment firms...");
  const allFirms = await db.select().from(investmentFirms);
  console.log(`Found ${allFirms.length} investment firms`);
  
  const firmColumns = [
    "id", "name", "description", "website", "logo", "type", "aum", "location",
    "stages", "sectors", "check_size_min", "check_size_max", "portfolio_count",
    "linkedin_url", "twitter_url", "created_at", "folk_id", "folk_workspace_id",
    "folk_list_ids", "folk_updated_at", "source", "updated_at", "hq_location",
    "industry", "emails", "phones", "addresses", "urls", "funding_raised",
    "last_funding_date", "foundation_year", "employee_range", "status",
    "folk_custom_fields", "url_1", "url_2", "firm_classification",
    "typical_check_size", "enrichment_status", "last_enrichment_date", "enrichment_error"
  ];
  
  const firmsSql = await exportTableWithUpsert("investment_firms", allFirms, firmColumns);
  fs.writeFileSync("scripts/export_investment_firms.sql", firmsSql);
  console.log("Written to scripts/export_investment_firms.sql");
  
  // Export investors
  console.log("\nFetching investors...");
  const allInvestors = await db.select().from(investors);
  console.log(`Found ${allInvestors.length} investors`);
  
  const investorColumns = [
    "id", "user_id", "firm_id", "first_name", "last_name", "email", "phone",
    "title", "linkedin_url", "twitter_url", "avatar", "bio", "stages", "sectors",
    "location", "is_active", "created_at", "updated_at", "folk_id", "source",
    "folk_workspace_id", "folk_list_ids", "folk_updated_at", "person_linkedin_url",
    "investor_type", "investor_state", "investor_country", "fund_hq", "hq_location",
    "funding_stage", "typical_investment", "num_lead_investments", "total_investments",
    "recent_investments", "status", "website", "folk_custom_fields", "address",
    "enrichment_status", "last_enrichment_date"
  ];
  
  const investorsSql = await exportTableWithUpsert("investors", allInvestors, investorColumns);
  fs.writeFileSync("scripts/export_investors.sql", investorsSql);
  console.log("Written to scripts/export_investors.sql");
  
  console.log("\n✅ Export complete (UPSERT mode)!");
  console.log("\nTo import into production:");
  console.log("1. psql $DATABASE_URL_PROD -f scripts/export_investment_firms.sql");
  console.log("2. psql $DATABASE_URL_PROD -f scripts/export_investors.sql");
  
  process.exit(0);
}

main().catch(err => {
  console.error("Export failed:", err);
  process.exit(1);
});
