import { seedBusinessmenFromCSV } from "../server/seeds/businessmen-csv";

async function run() {
  try {
    console.log('Starting businessmen CSV import...');
    const result = await seedBusinessmenFromCSV();
    console.log('Import result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
  process.exit(0);
}

run();
