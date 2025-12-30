import { folkService } from '../server/services/folk';

async function testTrigger() {
  const groupId = 'grp_8eea3d2e-8419-4191-8324-13f0b6e7bd25';
  
  console.log('Testing Folk enrichment trigger with 5 records...');
  
  // Test with just 5 records
  const result = await folkService.bulkTriggerEnrichment(groupId, {
    first: 5,
  });
  
  console.log('Result:', result);
  process.exit(0);
}

testTrigger().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
