import { folkService } from '../server/services/folk';
import { storage } from '../server/storage';

async function testEnrichment() {
  const groupId = 'grp_8eea3d2e-8419-4191-8324-13f0b6e7bd25';
  
  console.log('Fetching records 501-1000 from Folk CRM (Investors group)...');
  const { people, total } = await folkService.getPeopleByGroupWithRange(groupId, {
    start: 501,
    end: 1000,
  });
  
  console.log(`Total in group: ${total}`);
  console.log(`Fetched ${people.length} people (records 501-1000)`);
  
  if (people.length === 0) {
    console.log('No records to process in this range.');
    return;
  }
  
  const enrichmentResults = { success: 0, failed: 0, errors: [] as string[] };
  
  for (const person of people) {
    try {
      const email = Array.isArray(person.emails) && person.emails.length > 0
        ? (typeof person.emails[0] === 'string' ? person.emails[0] : (person.emails[0] as any)?.value)
        : null;
      const phone = Array.isArray(person.phones) && person.phones.length > 0
        ? (typeof person.phones[0] === 'string' ? person.phones[0] : (person.phones[0] as any)?.value)
        : null;
      
      const customFields = folkService.extractCustomFields(person);
      
      const existingInvestor = person.id ? await storage.getInvestorByFolkId(person.id) : null;
      
      const investorData: any = {
        firstName: person.firstName || person.fullName?.split(' ')[0] || 'Unknown',
        lastName: person.lastName || person.fullName?.split(' ').slice(1).join(' '),
        email,
        phone,
        title: person.jobTitle,
        linkedinUrl: person.linkedinUrl,
        folkId: person.id,
        folkWorkspaceId: groupId,
        folkCustomFields: customFields,
        source: 'folk',
      };
      
      Object.keys(investorData).forEach(key => {
        if (investorData[key] === undefined) delete investorData[key];
      });
      
      if (existingInvestor) {
        await storage.updateInvestor(existingInvestor.id, investorData);
      } else {
        await storage.createInvestor(investorData);
      }
      enrichmentResults.success++;
      
      if (enrichmentResults.success % 50 === 0) {
        console.log(`Progress: ${enrichmentResults.success} enriched...`);
      }
    } catch (error: any) {
      enrichmentResults.failed++;
      enrichmentResults.errors.push(`${person.id}: ${error.message}`);
    }
  }
  
  console.log('\n=== Enrichment Complete ===');
  console.log(`Total processed: ${people.length}`);
  console.log(`Success: ${enrichmentResults.success}`);
  console.log(`Failed: ${enrichmentResults.failed}`);
  if (enrichmentResults.errors.length > 0) {
    console.log(`Sample errors: ${enrichmentResults.errors.slice(0, 5).join(', ')}`);
  }
  
  process.exit(0);
}

testEnrichment().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
