import { db } from "../db";
import { investors } from "@shared/schema";
import { eq } from "drizzle-orm";
import advisorsData from "./fundraising-advisors-data.json";

interface AdvisorRow {
  firstName: string;
  lastName: string | null;
  clientTypes: string;
  sectors: string[];
  feeRange: string;
  capitalRaised: number | null;
  email: string | null;
  linkedin: string | null;
  region: string;
  primaryLocation: string;
}

export async function seedFundraisingAdvisors() {
  const rows = advisorsData as AdvisorRow[];

  const existing = await db.select({ email: investors.email })
    .from(investors)
    .where(eq(investors.source, "advisor_seed"));
  const existingEmails = new Set(existing.map(r => r.email).filter(Boolean));

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.email && existingEmails.has(row.email)) { skipped++; continue; }

    await db.insert(investors).values({
      firstName: row.firstName,
      lastName: row.lastName || undefined,
      email: row.email || undefined,
      linkedinUrl: row.linkedin?.startsWith("http") ? row.linkedin : undefined,
      investorType: "Advisor",
      title: "Fundraising Advisor",
      typicalInvestment: row.feeRange ? `Success fee: ${row.feeRange}` : undefined,
      totalInvestments: row.capitalRaised || undefined,
      location: row.primaryLocation || undefined,
      investorCountry: row.primaryLocation || undefined,
      sectors: row.sectors,
      recentInvestments: row.clientTypes || undefined,
      source: "advisor_seed",
      enrichmentStatus: "not_enriched",
      isActive: true,
    });

    if (row.email) existingEmails.add(row.email);
    inserted++;
  }

  return { inserted, skipped };
}
