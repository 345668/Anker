const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function exportToCsv() {
  const client = await pool.connect();
  
  try {
    console.log('Exporting Investment Firms...');
    
    const firmsResult = await client.query(`
      SELECT id, name, website, description, location, aum, stages, sectors, 
             check_size_min, check_size_max, logo, logo_url, firm_classification, 
             enrichment_status, last_enrichment_date, folk_id, type, 
             portfolio_count, linkedin_url, twitter_url, source, hq_location,
             industry, emails, phones, addresses, urls, funding_raised,
             last_funding_date, foundation_year, employee_range, status,
             typical_check_size, created_at
      FROM investment_firms
    `);
    
    const firmsRows = firmsResult.rows;
    console.log(`Found ${firmsRows.length} investment firms`);
    
    if (firmsRows.length > 0) {
      const firmsCsv = convertToCsv(firmsRows);
      fs.writeFileSync(path.join(__dirname, 'investment_firms_export.csv'), firmsCsv);
      console.log('Saved to scripts/investment_firms_export.csv');
    }
    
    console.log('\nExporting Investors...');
    
    const investorsResult = await client.query(`
      SELECT id, first_name, last_name, email, phone, title, linkedin_url,
             twitter_url, avatar, bio, stages, sectors, location, is_active,
             folk_id, source, investor_type, investor_state, investor_country,
             fund_hq, hq_location, funding_stage, typical_investment,
             num_lead_investments, total_investments, recent_investments,
             status, website, address, enrichment_status, last_enrichment_date,
             created_at
      FROM investors
    `);
    
    const investorsRows = investorsResult.rows;
    console.log(`Found ${investorsRows.length} investors`);
    
    if (investorsRows.length > 0) {
      const investorsCsv = convertToCsv(investorsRows);
      fs.writeFileSync(path.join(__dirname, 'investors_export.csv'), investorsCsv);
      console.log('Saved to scripts/investors_export.csv');
    }
    
    console.log('\n--- Export Complete ---');
    console.log(`Investment Firms: ${firmsRows.length} records`);
    console.log(`Investors: ${investorsRows.length} records`);
    console.log('\nNext steps:');
    console.log('1. Open the Database tool in Replit');
    console.log('2. Switch to "Production" database');
    console.log('3. Use Import to upload these CSV files');
    
  } finally {
    client.release();
    await pool.end();
  }
}

function convertToCsv(rows) {
  if (rows.length === 0) return '';
  
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  
  for (const row of rows) {
    const values = headers.map(header => {
      let val = row[header];
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) val = JSON.stringify(val);
      if (typeof val === 'object') val = JSON.stringify(val);
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csvLines.push(values.join(','));
  }
  
  return csvLines.join('\n');
}

exportToCsv().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
