import { db } from "../db";
import { 
  databaseBackups, 
  users, 
  investors, 
  investmentFirms, 
  contacts, 
  deals, 
  startups,
  subscribers,
  messages,
  newsArticles,
  newsSources,
  newsRegions
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createHash } from "crypto";

const BACKUP_TABLES = [
  { name: "users", table: users },
  { name: "investors", table: investors },
  { name: "investmentFirms", table: investmentFirms },
  { name: "contacts", table: contacts },
  { name: "deals", table: deals },
  { name: "startups", table: startups },
  { name: "subscribers", table: subscribers },
  { name: "messages", table: messages },
  { name: "newsArticles", table: newsArticles },
  { name: "newsSources", table: newsSources },
  { name: "newsRegions", table: newsRegions },
];

export interface BackupData {
  metadata: {
    backupId: string;
    createdAt: string;
    environment: string;
    tables: string[];
    recordCounts: Record<string, number>;
  };
  data: Record<string, any[]>;
}

export async function createBackup(
  userId: string,
  name: string,
  description?: string,
  backupType: string = "manual"
): Promise<{ backupId: string; success: boolean; message: string }> {
  const startTime = Date.now();
  
  const [backup] = await db.insert(databaseBackups).values({
    name,
    description,
    environment: "development",
    status: "in_progress",
    backupType,
    createdBy: userId,
    startedAt: new Date(),
  }).returning();

  try {
    const tables: string[] = [];
    const recordCounts: Record<string, number> = {};
    const backupData: Record<string, any[]> = {};

    for (const { name: tableName, table } of BACKUP_TABLES) {
      try {
        const records = await db.select().from(table);
        backupData[tableName] = records;
        tables.push(tableName);
        recordCounts[tableName] = records.length;
      } catch (err) {
        console.warn(`[Backup] Skipping table ${tableName}:`, err);
      }
    }

    const dataString = JSON.stringify(backupData);
    const checksum = createHash("sha256").update(dataString).digest("hex");
    const fileSize = Buffer.byteLength(dataString, "utf8");

    await db.update(databaseBackups)
      .set({
        status: "completed",
        tables,
        recordCounts,
        backupData,
        fileSize,
        checksum,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(databaseBackups.id, backup.id));

    const duration = Date.now() - startTime;
    const totalRecords = Object.values(recordCounts).reduce((a, b) => a + b, 0);
    console.log(`[Backup] Completed in ${duration}ms - ${tables.length} tables, ${totalRecords} records`);

    return {
      backupId: backup.id,
      success: true,
      message: `Backup completed successfully. ${totalRecords} records backed up from ${tables.length} tables.`,
    };
  } catch (error: any) {
    await db.update(databaseBackups)
      .set({
        status: "failed",
        errorMessage: error.message,
        updatedAt: new Date(),
      })
      .where(eq(databaseBackups.id, backup.id));

    return {
      backupId: backup.id,
      success: false,
      message: `Backup failed: ${error.message}`,
    };
  }
}

export async function listBackups(limit: number = 20) {
  const backups = await db.select({
    id: databaseBackups.id,
    name: databaseBackups.name,
    description: databaseBackups.description,
    environment: databaseBackups.environment,
    status: databaseBackups.status,
    backupType: databaseBackups.backupType,
    tables: databaseBackups.tables,
    recordCounts: databaseBackups.recordCounts,
    fileSize: databaseBackups.fileSize,
    checksum: databaseBackups.checksum,
    startedAt: databaseBackups.startedAt,
    completedAt: databaseBackups.completedAt,
    restoredAt: databaseBackups.restoredAt,
    createdBy: databaseBackups.createdBy,
    restoredBy: databaseBackups.restoredBy,
    errorMessage: databaseBackups.errorMessage,
    createdAt: databaseBackups.createdAt,
    updatedAt: databaseBackups.updatedAt,
  })
    .from(databaseBackups)
    .orderBy(desc(databaseBackups.createdAt))
    .limit(limit);
  
  return backups;
}

export async function getBackupById(backupId: string) {
  const [backup] = await db.select({
    id: databaseBackups.id,
    name: databaseBackups.name,
    description: databaseBackups.description,
    environment: databaseBackups.environment,
    status: databaseBackups.status,
    backupType: databaseBackups.backupType,
    tables: databaseBackups.tables,
    recordCounts: databaseBackups.recordCounts,
    fileSize: databaseBackups.fileSize,
    checksum: databaseBackups.checksum,
    startedAt: databaseBackups.startedAt,
    completedAt: databaseBackups.completedAt,
    restoredAt: databaseBackups.restoredAt,
    createdBy: databaseBackups.createdBy,
    restoredBy: databaseBackups.restoredBy,
    errorMessage: databaseBackups.errorMessage,
    createdAt: databaseBackups.createdAt,
    updatedAt: databaseBackups.updatedAt,
  })
    .from(databaseBackups)
    .where(eq(databaseBackups.id, backupId))
    .limit(1);
  
  return backup;
}

export async function getBackupData(backupId: string): Promise<BackupData | null> {
  const [backup] = await db.select()
    .from(databaseBackups)
    .where(eq(databaseBackups.id, backupId))
    .limit(1);
  
  if (!backup || backup.status !== "completed" || !backup.backupData) {
    return null;
  }

  return {
    metadata: {
      backupId: backup.id,
      createdAt: backup.createdAt?.toISOString() || "",
      environment: backup.environment,
      tables: backup.tables as string[] || [],
      recordCounts: backup.recordCounts as Record<string, number> || {},
    },
    data: backup.backupData as Record<string, any[]>,
  };
}

export async function getDatabaseStats(): Promise<{
  tables: Array<{ name: string; count: number }>;
  totalRecords: number;
  lastBackup: any | null;
}> {
  const stats: Array<{ name: string; count: number }> = [];
  
  for (const { name: tableName, table } of BACKUP_TABLES) {
    try {
      const result = await db.select({ count: sql<number>`count(*)` }).from(table);
      stats.push({ name: tableName, count: Number(result[0]?.count || 0) });
    } catch (err) {
      stats.push({ name: tableName, count: 0 });
    }
  }

  const [lastBackup] = await db.select({
    id: databaseBackups.id,
    name: databaseBackups.name,
    status: databaseBackups.status,
    completedAt: databaseBackups.completedAt,
    recordCounts: databaseBackups.recordCounts,
  })
    .from(databaseBackups)
    .where(eq(databaseBackups.status, "completed"))
    .orderBy(desc(databaseBackups.createdAt))
    .limit(1);

  return {
    tables: stats,
    totalRecords: stats.reduce((sum, t) => sum + t.count, 0),
    lastBackup: lastBackup || null,
  };
}

export async function deleteBackup(backupId: string): Promise<{ success: boolean; message: string }> {
  const backup = await getBackupById(backupId);
  if (!backup) {
    return { success: false, message: "Backup not found" };
  }
  
  await db.delete(databaseBackups).where(eq(databaseBackups.id, backupId));
  
  return { success: true, message: "Backup deleted successfully" };
}

export async function downloadBackup(backupId: string): Promise<{ data: string; filename: string } | null> {
  const backupData = await getBackupData(backupId);
  if (!backupData) {
    return null;
  }
  
  const backup = await getBackupById(backupId);
  const filename = `backup_${backup?.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
  
  return {
    data: JSON.stringify(backupData, null, 2),
    filename,
  };
}
