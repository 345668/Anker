import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error("NEON_DATABASE_URL or DATABASE_URL environment variable is required")
}
const sql = neon(databaseUrl)

async function getSchema() {
  console.log("[v0] Connecting to Neon database...")
  
  // Get all tables
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  
  console.log("\n=== DATABASE TABLES ===\n")
  
  for (const table of tables) {
    console.log(`\n📋 Table: ${table.table_name}`)
    console.log("-".repeat(50))
    
    // Get columns for each table
    const columns = await sql`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${table.table_name}
      ORDER BY ordinal_position
    `
    
    for (const col of columns) {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : ''
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : ''
      console.log(`  - ${col.column_name}: ${col.data_type}${length} ${nullable}${defaultVal}`)
    }
    
    // Get row count
    const countResult = await sql`
      SELECT COUNT(*) as count FROM ${sql.unsafe(table.table_name)}
    `
    console.log(`  📊 Rows: ${countResult[0].count}`)
  }
  
  // Get foreign key relationships
  console.log("\n\n=== FOREIGN KEY RELATIONSHIPS ===\n")
  
  const fks = await sql`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  `
  
  if (fks.length === 0) {
    console.log("No foreign key relationships found.")
  } else {
    for (const fk of fks) {
      console.log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`)
    }
  }
  
  // Get indexes
  console.log("\n\n=== INDEXES ===\n")
  
  const indexes = await sql`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `
  
  for (const idx of indexes) {
    console.log(`  ${idx.tablename}: ${idx.indexname}`)
  }
  
  console.log("\n\n=== SCHEMA EXPORT COMPLETE ===")
}

getSchema().catch(console.error)
