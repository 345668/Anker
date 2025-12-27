const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val) || typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function generateInserts() {
  const client = await pool.connect();
  
  try {
    console.log('Generating SQL INSERT statements...\n');
    
    // Investment Firms
    console.log('Fetching investment firms...');
    const firmsResult = await client.query('SELECT * FROM investment_firms');
    const firms = firmsResult.rows;
    console.log(`Found ${firms.length} investment firms`);
    
    // Split into batches of 500
    const batchSize = 500;
    let batchNum = 1;
    
    for (let i = 0; i < firms.length; i += batchSize) {
      const batch = firms.slice(i, i + batchSize);
      let sql = '-- Investment Firms Batch ' + batchNum + ' (' + batch.length + ' records)\n';
      sql += '-- Run this in your Production database SQL console\n\n';
      
      for (const row of batch) {
        const columns = Object.keys(row).filter(k => row[k] !== null && row[k] !== undefined);
        const values = columns.map(k => escapeValue(row[k]));
        
        sql += `INSERT INTO investment_firms (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET `;
        sql += columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
        sql += ';\n';
      }
      
      const filename = `production_investment_firms_batch_${batchNum}.sql`;
      fs.writeFileSync(path.join(__dirname, filename), sql);
      console.log(`  Saved: scripts/${filename}`);
      batchNum++;
    }
    
    // Investors
    console.log('\nFetching investors...');
    const investorsResult = await client.query('SELECT * FROM investors');
    const investors = investorsResult.rows;
    console.log(`Found ${investors.length} investors`);
    
    batchNum = 1;
    for (let i = 0; i < investors.length; i += batchSize) {
      const batch = investors.slice(i, i + batchSize);
      let sql = '-- Investors Batch ' + batchNum + ' (' + batch.length + ' records)\n';
      sql += '-- Run this in your Production database SQL console\n\n';
      
      for (const row of batch) {
        const columns = Object.keys(row).filter(k => row[k] !== null && row[k] !== undefined);
        const values = columns.map(k => escapeValue(row[k]));
        
        sql += `INSERT INTO investors (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET `;
        sql += columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
        sql += ';\n';
      }
      
      const filename = `production_investors_batch_${batchNum}.sql`;
      fs.writeFileSync(path.join(__dirname, filename), sql);
      console.log(`  Saved: scripts/${filename}`);
      batchNum++;
    }
    
    console.log('\n--- Generation Complete ---');
    console.log('\nInstructions:');
    console.log('1. Open Database tool in Replit');
    console.log('2. Switch to Production database');
    console.log('3. Go to SQL tab');
    console.log('4. Copy and paste each batch file, then click Run');
    console.log('5. Start with investment_firms batches, then investors batches');
    
  } finally {
    client.release();
    await pool.end();
  }
}

generateInserts().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
