import { folkService } from '../server/services/folk';

async function triggerEnrichment() {
  const groupId = 'grp_8eea3d2e-8419-4191-8324-13f0b6e7bd25'; // Investors group
  
  console.log('Triggering Folk native enrichment for records 501-1000...');
  console.log('This will update contacts with an "Enrichment Requested" timestamp,');
  console.log('which prompts Folk/Dropcontact to re-enrich the contacts.\n');
  
  const result = await folkService.bulkTriggerEnrichment(groupId, {
    start: 501,
    end: 1000,
  });
  
  console.log('=== Folk Enrichment Trigger Complete ===');
  console.log(`Total in range: ${result.total}`);
  console.log(`Triggered: ${result.triggered}`);
  console.log(`Failed: ${result.failed}`);
  
  if (result.errors.length > 0) {
    console.log(`\nSample errors (first 5):`);
    result.errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
  }
  
  console.log('\nFolk will now enrich these contacts using Dropcontact.');
  console.log('Check your Folk CRM in a few minutes to see the enriched data.');
  
  process.exit(0);
}

triggerEnrichment().catch(err => {
  console.error('Failed to trigger enrichment:', err);
  process.exit(1);
});
