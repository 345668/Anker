# Production Database Migration Guide

This guide explains how to copy your development data (10,223 investment firms and 6,503 investors) to your production database.

## Overview

Replit uses **separate databases** for development and production:
- **Development Database**: Used when running your app in the editor (npm run dev)
- **Production Database**: Used when your app is published/deployed

## Files Already Generated

The CSV export has already been run. You have these files ready:
- `scripts/investment_firms_export.csv` (5.1 MB - 10,223 records)
- `scripts/investors_export.csv` (1.4 MB - 6,503 records)

## Step-by-Step Instructions

### Step 1: Open the Database Tool

1. In Replit, look for the **Database** icon in the left toolbar (looks like a cylinder/database)
2. Click it to open the database panel

### Step 2: Switch to Production Database

1. At the top of the database panel, you'll see a dropdown that says "Development"
2. Click on it and select **"Production"**
3. You are now connected to your production database

### Step 3: Verify Tables Exist

In the SQL tab, run this query to check if the tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('investment_firms', 'investors');
```

If the tables don't exist, the schema needs to be synced. Contact support or re-deploy the app.

### Step 4: Import the CSV Files

**Method 1: Using Replit's Import Feature**
1. In the Database panel, look for an "Import" button or tab
2. Select the `investment_firms_export.csv` file from the `scripts` folder
3. Map the columns to match the table structure
4. Repeat for `investors_export.csv`

**Method 2: Using SQL Copy Command**
If the import feature isn't available, you can use SQL:

For Investment Firms:
```sql
-- First, check current count
SELECT COUNT(*) FROM investment_firms;
```

### Step 5: Verify the Migration

After importing, run these queries to verify:

```sql
SELECT COUNT(*) FROM investment_firms;
-- Should show: 10223

SELECT COUNT(*) FROM investors;
-- Should show: 6503
```

## Alternative: Re-Import in Production App

If the Database panel method is too complex:

1. Go to your published app URL (the .replit.app domain)
2. Log in as admin (vc@philippemasindet.com or masindetphilippe@gmail.com)
3. Navigate to Admin > Database or Admin > Import
4. Re-upload your original Folk CRM data or CSV files

This will populate the production database directly using the same import features you used in development.

## Troubleshooting

### Tables don't exist in production
The production deployment might not have run database migrations. Try re-deploying the app.

### Import fails with "permission denied"
Make sure you're logged in as an admin user in the production app.

### Data not appearing after import
1. Make sure you selected "Production" in the database dropdown
2. Refresh your published app page
3. Clear browser cache and try again

### CSV import column mismatch
The CSV files have these columns that must match your production tables:

**investment_firms columns:**
id, name, website, description, location, aum, stages, sectors, check_size_min, check_size_max, logo, logo_url, firm_classification, enrichment_status, last_enrichment_date, folk_id, type, portfolio_count, linkedin_url, twitter_url, source, hq_location, industry, emails, phones, addresses, urls, funding_raised, last_funding_date, foundation_year, employee_range, status, typical_check_size, created_at

**investors columns:**
id, first_name, last_name, email, phone, title, linkedin_url, twitter_url, avatar, bio, stages, sectors, location, is_active, folk_id, source, investor_type, investor_state, investor_country, fund_hq, hq_location, funding_stage, typical_investment, num_lead_investments, total_investments, recent_investments, status, website, address, enrichment_status, last_enrichment_date, created_at
