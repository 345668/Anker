# Production Database Backup & Restoration Guide

This document provides detailed instructions for backing up and restoring your production PostgreSQL database on Replit.

---

## Table of Contents

1. [Understanding Database Environments](#understanding-database-environments)
2. [Built-in Backup Features](#built-in-backup-features)
3. [Manual Backup with pg_dump](#manual-backup-with-pg_dump)
4. [Restoring from Backup](#restoring-from-backup)
5. [Syncing Development to Production](#syncing-development-to-production)
6. [In-App Backup System](#in-app-backup-system)
7. [Emergency Recovery](#emergency-recovery)
8. [Best Practices](#best-practices)

---

## Understanding Database Environments

Replit automatically separates **Development** and **Production** databases:

| Environment | Purpose | Access |
|-------------|---------|--------|
| **Development** | Testing, AI agent operations | Full access in workspace |
| **Production** | Live user data | Protected, manual access only |

**Important Security Note**: The AI Agent only has access to the development database. This protects your production data from accidental changes.

### Accessing Database Credentials

1. Open the **Database** tool in your Replit workspace
2. Select either **Development** or **Production** database
3. Click the **Settings** tab (gear icon)
4. Find your connection credentials:
   - `DATABASE_URL` (full connection string)
   - `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`

---

## Built-in Backup Features

### Point-in-Time Restore (Recommended)

Replit includes automatic point-in-time restore capability:

1. Navigate to **Checkpoints** in your Replit workspace
2. Find the checkpoint from the date/time you want to restore to
3. Click **Restore**
4. Under "Additional rollback options", select **Database**
5. This restores your database to its state at that checkpoint time

**Key Points:**
- Every checkpoint includes both code AND database state
- Retention periods can be configured for change history
- Checkpoint operations are fast (manifest-based)

### Soft Delete Protection

When you remove a production database:
- 7-day soft delete period allows for restoration
- Contact Replit support if you need to restore during this period
- After 7 days, the database is permanently deleted

---

## Manual Backup with pg_dump

For manual backups, migrations, or transferring data between environments.

### Prerequisites

1. **Install PostgreSQL locally:**
   ```bash
   # macOS
   brew install postgresql@16
   
   # Ubuntu/Debian
   sudo apt install postgresql-client
   
   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Verify installation:**
   ```bash
   pg_dump --version
   psql --version
   ```

### Creating a Production Backup

```bash
#!/bin/bash
# backup-production.sh

# Get your production DATABASE_URL from Replit Database Settings
PROD_DB_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"

# Create timestamped backup file
BACKUP_FILE="backup_prod_$(date +%Y%m%d_%H%M%S).sql"

echo "Creating production database backup..."
pg_dump --no-owner --no-acl --format=plain "$PROD_DB_URL" > "$BACKUP_FILE"

echo "Backup saved as: $BACKUP_FILE"
echo "File size: $(du -h $BACKUP_FILE | cut -f1)"
```

### Backup Options Explained

| Option | Purpose |
|--------|---------|
| `--no-owner` | Exclude ownership commands (useful for cross-environment restores) |
| `--no-acl` | Exclude access control (permission) commands |
| `--format=plain` | Create readable SQL file |
| `--format=custom` | Create compressed binary format (faster for large DBs) |
| `--data-only` | Export only data, not schema |
| `--schema-only` | Export only schema, not data |

### Creating a Compressed Backup (Large Databases)

```bash
pg_dump --no-owner --no-acl --format=custom "$PROD_DB_URL" > backup_prod.dump
```

---

## Restoring from Backup

### Restore to Development Database

```bash
#!/bin/bash
# restore-to-dev.sh

DEV_DB_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
BACKUP_FILE="backup_prod_20240115_143022.sql"

echo "Restoring backup to development database..."

# Optional: Clear existing data first
psql "$DEV_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore from backup
psql "$DEV_DB_URL" < "$BACKUP_FILE"

echo "Restore complete!"
```

### Restore Compressed Backup

```bash
pg_restore --no-owner --no-acl -d "$DEV_DB_URL" backup_prod.dump
```

### Selective Restore (Single Table)

```bash
# Export single table
pg_dump --no-owner --no-acl --table=investors "$PROD_DB_URL" > investors_backup.sql

# Restore single table
psql "$DEV_DB_URL" < investors_backup.sql
```

---

## Syncing Development to Production

**Warning:** This overwrites production data. Always backup production first!

### Full Sync Script

```bash
#!/bin/bash
# sync-dev-to-prod.sh
set -e

DEV_DB_URL="postgresql://<dev-user>:<dev-pass>@<dev-host>/<dev-db>?sslmode=require"
PROD_DB_URL="postgresql://<prod-user>:<prod-pass>@<prod-host>/<prod-db>?sslmode=require"

# Create backup of production first
echo "Step 1: Backing up production..."
PROD_BACKUP="prod_backup_before_sync_$(date +%Y%m%d_%H%M%S).sql"
pg_dump --no-owner --no-acl "$PROD_DB_URL" > "$PROD_BACKUP"
echo "Production backup saved: $PROD_BACKUP"

# Export development data
echo "Step 2: Exporting development data..."
DEV_EXPORT="dev_export_$(date +%Y%m%d_%H%M%S).sql"
pg_dump --no-owner --no-acl "$DEV_DB_URL" > "$DEV_EXPORT"

# Import to production
echo "Step 3: Importing to production..."
psql "$PROD_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$PROD_DB_URL" < "$DEV_EXPORT"

echo "Sync complete! Dev data is now in production."
echo "If something went wrong, restore from: $PROD_BACKUP"
```

### Selective Table Sync

```bash
# Sync specific tables only
TABLES="investors investment_firms contacts"

for table in $TABLES; do
  echo "Syncing table: $table"
  pg_dump --no-owner --no-acl --table=$table "$DEV_DB_URL" | psql "$PROD_DB_URL"
done
```

---

## In-App Backup System

The Anker platform includes a built-in backup system accessible at `/admin/backups`:

### Features

1. **Create Backup**: Captures snapshot of all key tables:
   - Users, Investors, Investment Firms
   - Contacts, Deals, Startups
   - Subscribers, Messages
   - News Articles, Sources, Regions

2. **View Backup History**: Lists all backups with:
   - Status (completed, failed, in progress)
   - Record counts per table
   - File size and checksum
   - Timestamps

3. **Download Backup**: Export backup as JSON file for:
   - External storage
   - Cross-platform migration
   - Audit compliance

4. **Database Stats**: Current record counts across all tracked tables

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/backups` | List all backups |
| POST | `/api/admin/backups` | Create new backup |
| GET | `/api/admin/backups/:id` | Get backup details |
| GET | `/api/admin/backups/:id/download` | Download backup JSON |
| GET | `/api/admin/backups/:id/data` | Preview backup data |
| DELETE | `/api/admin/backups/:id` | Delete backup |

### Limitations

- The in-app system operates on the **development database** only
- For production backups, use the manual pg_dump methods above
- Large databases may require external storage solutions

---

## Emergency Recovery

### If Production Database is Deleted

1. **Within 7 days**: Contact Replit support immediately for soft-delete recovery
2. **After 7 days**: Restore from your manual backup files

### If Data is Corrupted

1. Use Replit's Point-in-Time Restore to a checkpoint before corruption
2. Or restore from your latest manual backup

### Support Contact

For database emergencies, contact Replit support through:
- Replit Community Forum: https://replit.discourse.group
- Support ticket (for paid plans)

---

## Best Practices

### Backup Schedule

| Frequency | Backup Type | Retention |
|-----------|-------------|-----------|
| Daily | Automated checkpoint | 30 days |
| Weekly | Manual pg_dump | 3 months |
| Monthly | Full export with schema | 1 year |
| Before major changes | Pre-migration backup | Until verified |

### Security Guidelines

1. **Never commit credentials** to version control
2. **Store backups securely** with encryption
3. **Test restores regularly** to verify backup integrity
4. **Use separate credentials** for backup scripts
5. **Log all backup/restore operations** for audit trail

### Storage Locations

Store backups in multiple locations:
- Local machine (immediate access)
- Cloud storage (AWS S3, Google Cloud, etc.)
- External hard drive (offline backup)

### Verification Checklist

After any restore operation:

- [ ] Verify row counts match expected values
- [ ] Test application functionality
- [ ] Check for referential integrity errors
- [ ] Verify user authentication works
- [ ] Test critical business flows

---

## Quick Reference Commands

```bash
# Create production backup
pg_dump --no-owner --no-acl "$PROD_DB_URL" > backup.sql

# Restore to development
psql "$DEV_DB_URL" < backup.sql

# Check table row counts
psql "$DB_URL" -c "SELECT schemaname, tablename, n_tup_ins FROM pg_stat_user_tables ORDER BY n_tup_ins DESC;"

# List all tables
psql "$DB_URL" -c "\dt"

# Export single table as CSV
psql "$DB_URL" -c "\copy investors TO 'investors.csv' WITH CSV HEADER"

# Import CSV data
psql "$DB_URL" -c "\copy investors FROM 'investors.csv' WITH CSV HEADER"
```

---

## Related Resources

- [Replit Database Documentation](https://docs.replit.com/cloud-services/storage-and-databases/postgresql-on-replit)
- [PostgreSQL pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)

---

*Last Updated: January 2026*
*Platform: Anker Consulting - 1000vc*
