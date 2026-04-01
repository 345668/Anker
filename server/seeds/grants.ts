import { db } from "../db";
import { investmentFirms } from "@shared/schema";
import { eq } from "drizzle-orm";
import grantsData from "./grants-data.json";

interface GrantRow {
  region: string;
  name: string;
  country: string;
  focusAreas: string;
  sectors: string[];
  fundingAmount: string;
  type: string;
  eligibility: string;
  applicationInfo: string;
  website: string;
}

export async function seedGrants() {
  const rows = grantsData as GrantRow[];

  const existing = await db.select({ name: investmentFirms.name })
    .from(investmentFirms)
    .where(eq(investmentFirms.source, "grant_seed"));
  const existingNames = new Set(existing.map(r => r.name));

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (existingNames.has(row.name)) { skipped++; continue; }

    const isForFunds = row.region.includes("Fund") || row.region.includes("Funds");
    const isEU = row.region.startsWith("EU");

    const description = [
      row.eligibility ? `Eligibility: ${row.eligibility}` : "",
      row.applicationInfo ? `Application: ${row.applicationInfo}` : "",
    ].filter(Boolean).join(" | ");

    await db.insert(investmentFirms).values({
      name: row.name,
      type: isForFunds ? "Grant Program (Fund)" : "Grant Program (Startup)",
      firmClassification: isEU ? "EU Grant" : "US Grant",
      location: row.country || undefined,
      hqLocation: isEU ? "Europe" : "United States",
      sectors: row.sectors,
      typicalCheckSize: row.fundingAmount || undefined,
      website: row.website?.startsWith("http") ? row.website : undefined,
      description: description || undefined,
      industry: row.focusAreas || undefined,
      source: "grant_seed",
      enrichmentStatus: "not_enriched",
    });

    existingNames.add(row.name);
    inserted++;
  }

  return { inserted, skipped };
}
