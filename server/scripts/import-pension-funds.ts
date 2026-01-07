import * as XLSX from 'xlsx';
import { db } from '../db';
import { investmentFirms, investors } from '@shared/schema';
import { ilike } from 'drizzle-orm';

interface PensionFundRow {
  'Pension Fund Name': string;
  'Pension Fund Description / Investing The': string;
  'Investor Type': string;
  'Pension Fund Linkedin Profile': string;
  'Preferred Country of Investment': string;
  'Preferred Continent of Investment': string;
  'Typical Ticket Size': string;
  'Preferred Asset Class': string;
  'AUM in USD (millions)': string;
  'AUM in USD': number;
  'Investor Address': string;
  'Investor City': string;
  'Investor State': string;
  'Investor Country': string;
  'First Name': string;
  'Last Name': string;
  'Full Name': string;
  'Job Title': string;
  'Location': string;
  'Pension Fund Domain': string;
  'LinkedIn Profile': string;
  'Primary Email': string;
  'Primary Phone Number': string;
}

export async function importPensionFunds(filePath: string = 'attached_assets/pension-fund-linkedin-v-2_1767744397941.xlsx') {
  console.log('Starting pension fund import from:', filePath);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  
  // Find the header row (row 2 contains headers based on structure)
  const headerRow = rawData[2] as string[];
  if (!headerRow || headerRow.length === 0) {
    throw new Error('Could not find header row in Excel file');
  }
  
  // Parse data rows starting from row 3
  const dataRows = rawData.slice(3);
  
  let firmsInserted = 0;
  let contactsInserted = 0;
  let skipped = 0;
  const processedFirms = new Set<string>();
  
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    
    const firmName = row[0] as string;
    if (!firmName || firmName.trim() === '') continue;
    
    const description = row[2] as string || '';
    const investorType = row[3] as string || 'Pension Fund';
    const linkedinProfile = row[4] as string || '';
    const preferredCountry = row[5] as string || '';
    const preferredContinent = row[6] as string || '';
    const ticketSize = row[7] as string || '';
    const assetClass = row[8] as string || '';
    const aumMillions = row[9] as string || '';
    const aumUsd = row[10] as number;
    const address = row[11] as string || '';
    const city = row[12] as string || '';
    const state = row[13] as string || '';
    const country = row[14] as string || '';
    const firstName = row[15] as string || '';
    const lastName = row[16] as string || '';
    const fullName = row[17] as string || '';
    const jobTitle = row[18] as string || '';
    const contactLocation = row[19] as string || '';
    const domain = row[20] as string || '';
    const contactLinkedin = row[21] as string || '';
    const email = row[22] as string || '';
    const phone = row[24] ? String(row[24]) : '';
    
    // Check if firm already processed in this import
    if (processedFirms.has(firmName)) {
      // Just add the contact
      if (firstName && lastName) {
        const existingContact = await db.select().from(investors)
          .where(ilike(investors.firstName, firstName))
          .limit(1);
        
        if (existingContact.length === 0) {
          // Get the firm ID
          const firms = await db.select().from(investmentFirms)
            .where(ilike(investmentFirms.name, firmName))
            .limit(1);
          
          if (firms.length > 0) {
            await db.insert(investors).values({
              firstName: firstName,
              lastName: lastName,
              title: jobTitle,
              firmId: firms[0].id,
              email: email && !email.includes('upon request') ? email : null,
              phone: phone && !String(phone).includes('upon request') ? String(phone) : null,
              linkedinUrl: contactLinkedin && contactLinkedin.startsWith('http') ? contactLinkedin : null,
              investorType: 'Pension Fund',
              location: contactLocation || `${city}, ${country}`.replace(', undefined', '').replace('undefined, ', '')
            });
            contactsInserted++;
            console.log(`  Added contact: ${firstName} ${lastName} to ${firmName}`);
          }
        }
      }
      continue;
    }
    
    // Check if firm exists in database
    const existing = await db.select().from(investmentFirms)
      .where(ilike(investmentFirms.name, firmName))
      .limit(1);
    
    let firmId: string;
    
    if (existing.length === 0) {
      // Parse sectors from asset class
      const sectors = assetClass ? assetClass.split(',').map(s => s.trim()).filter(s => s) : [];
      
      // Format location
      const location = [city, state, country].filter(Boolean).join(', ');
      
      // Format AUM
      let aum = '';
      if (aumMillions) {
        aum = `$${aumMillions}`;
      } else if (aumUsd) {
        const billions = aumUsd / 1000000000;
        if (billions >= 1) {
          aum = `$${billions.toFixed(1)}B`;
        } else {
          aum = `$${(aumUsd / 1000000).toFixed(0)}M`;
        }
      }
      
      const [inserted] = await db.insert(investmentFirms).values({
        name: firmName,
        type: 'Pension Fund',
        firmClassification: 'Pension Fund',
        description: description || null,
        location: location || null,
        hqLocation: location || null,
        linkedinUrl: linkedinProfile && linkedinProfile.startsWith('http') ? linkedinProfile : null,
        website: domain && !domain.includes('upon request') ? (domain.startsWith('http') ? domain : `https://${domain}`) : null,
        aum: aum || null,
        typicalCheckSize: ticketSize || null,
        sectors: sectors,
        industry: assetClass || null
      }).returning();
      
      firmId = inserted.id;
      firmsInserted++;
      processedFirms.add(firmName);
      console.log(`Inserted pension fund: ${firmName}`);
    } else {
      firmId = existing[0].id;
      processedFirms.add(firmName);
      skipped++;
    }
    
    // Add contact if available
    if (firstName && lastName) {
      const existingContact = await db.select().from(investors)
        .where(ilike(investors.firstName, firstName))
        .limit(1);
      
      if (existingContact.length === 0) {
        await db.insert(investors).values({
          firstName: firstName,
          lastName: lastName,
          title: jobTitle,
          firmId: firmId,
          email: email && !email.includes('upon request') ? email : null,
          phone: phone && !String(phone).includes('upon request') ? String(phone) : null,
          linkedinUrl: contactLinkedin && contactLinkedin.startsWith('http') ? contactLinkedin : null,
          investorType: 'Pension Fund',
          location: contactLocation || `${city}, ${country}`.replace(', undefined', '').replace('undefined, ', '')
        });
        contactsInserted++;
        console.log(`  Added contact: ${firstName} ${lastName}`);
      }
    }
  }
  
  console.log('\nPension fund import complete!');
  console.log(`Firms inserted: ${firmsInserted}`);
  console.log(`Contacts inserted: ${contactsInserted}`);
  console.log(`Skipped (already exists): ${skipped}`);
  
  return { firmsInserted, contactsInserted, skipped };
}
