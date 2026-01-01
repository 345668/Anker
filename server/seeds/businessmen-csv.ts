import { db } from "../db";
import { businessmen } from "../../shared/schema";
import * as fs from "fs";
import * as path from "path";
import { eq, and } from "drizzle-orm";

interface BusinessmanCSVRow {
  city: string;
  nameFamily: string;
  businessSectors: string;
  flagshipCompany: string;
  netWorth: string;
  coreAssets: string;
  influence: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

function parseNameFamily(nameFamily: string): { firstName: string; lastName: string | null; familyName: string } {
  const cleaned = nameFamily.trim();
  
  if (cleaned.toLowerCase().includes('family')) {
    const parts = cleaned.split(/\s+/);
    const familyIndex = parts.findIndex(p => p.toLowerCase() === 'family');
    const familyParts = parts.slice(0, familyIndex + 1);
    return {
      firstName: familyParts[0] || cleaned,
      lastName: familyParts.length > 2 ? familyParts.slice(1, -1).join(' ') : null,
      familyName: cleaned,
    };
  }
  
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null, familyName: cleaned };
  } else if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1], familyName: cleaned };
  } else {
    return { 
      firstName: parts[0], 
      lastName: parts.slice(1).join(' '), 
      familyName: cleaned 
    };
  }
}

function determineCountry(city: string): string {
  const indiaPattern = /guwahati|dibrugarh|jorhat|tinsukia|silchar|shillong|itanagar|dimapur|tezpur|kolkata|patna|ranchi|bhubaneswar|mumbai|ahmedabad|pune|noida|delhi|bengaluru|gurugram|hyderabad|chennai|lucknow|new delhi/i;
  
  if (indiaPattern.test(city)) {
    return "India";
  }
  
  return "India";
}

export async function seedBusinessmenFromCSV(): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const csvPath = path.join(process.cwd(), 'attached_assets', 'Investor_Funds_Globally_PV_-_Top_Businessman_CIty_by_City_1767310592535.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.log("Businessmen CSV file not found at:", csvPath);
    return { imported: 0, skipped: 0, errors: ["CSV file not found"] };
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const headers = parseCSVLine(lines[0]);
  console.log("CSV Headers:", headers);
  
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i]);
      
      if (values.length < 7) {
        errors.push(`Line ${i + 1}: Not enough columns`);
        continue;
      }
      
      const [city, nameFamily, businessSectorsVal, flagshipCompanyVal, netWorthVal, coreAssetsVal, influenceVal] = values;
      
      if (!nameFamily || nameFamily.trim() === '') {
        skipped++;
        continue;
      }
      
      const { firstName, lastName, familyName } = parseNameFamily(nameFamily);
      const country = determineCountry(city);
      
      const existingCheck = await db.select()
        .from(businessmen)
        .where(
          and(
            eq(businessmen.firstName, firstName),
            eq(businessmen.city, city || '')
          )
        )
        .limit(1);
      
      if (existingCheck.length > 0 && 
          (existingCheck[0].flagshipCompany === flagshipCompanyVal || 
           existingCheck[0].company === flagshipCompanyVal)) {
        skipped++;
        continue;
      }
      
      await db.insert(businessmen).values({
        firstName,
        lastName,
        familyName,
        city: city || null,
        country,
        company: flagshipCompanyVal || null,
        flagshipCompany: flagshipCompanyVal || null,
        industry: businessSectorsVal?.split(',')[0]?.trim() || null,
        businessSectors: businessSectorsVal || null,
        netWorth: netWorthVal || null,
        coreAssets: coreAssetsVal || null,
        influence: influenceVal || null,
        source: 'csv-import',
        isActive: true,
      });
      
      imported++;
      
      if (imported % 50 === 0) {
        console.log(`Imported ${imported} businessmen...`);
      }
    } catch (error: any) {
      errors.push(`Line ${i + 1}: ${error.message}`);
    }
  }
  
  console.log(`Businessmen CSV import complete: ${imported} imported, ${skipped} skipped`);
  
  return { imported, skipped, errors: errors.slice(0, 10) };
}
