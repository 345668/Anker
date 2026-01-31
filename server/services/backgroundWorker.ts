import { db } from "../db";
import { backgroundJobs, type BackgroundJob } from "@shared/schema";
import { eq, and, or, lt, asc } from "drizzle-orm";
import { generateMatchesForStartup, saveMatchResults, adjustWeightsFromFeedback } from "./matchmaking";

const WORKER_INTERVAL_MS = 2000;
const MAX_CONCURRENT_JOBS = 2;
let isRunning = false;
let activeJobs = 0;

type JobHandler = (job: BackgroundJob) => Promise<{ result?: Record<string, any>; error?: string }>;

const jobHandlers: Record<string, JobHandler> = {
  matchmaking: async (job) => {
    const { startupId, limit = 50, userId } = job.payload as { startupId: string; limit?: number; userId?: string };
    
    await updateJobProgress(job.id, 10, "Starting matchmaking analysis...");
    
    const personalizedWeights = userId 
      ? await adjustWeightsFromFeedback(userId)
      : undefined;
    
    await updateJobProgress(job.id, 20, "Analyzing investor database...");
    
    const matchResults = await generateMatchesForStartup(startupId, personalizedWeights, limit);
    
    await updateJobProgress(job.id, 80, "Saving match results...");
    
    const savedMatches = await saveMatchResults(startupId, matchResults);
    
    await updateJobProgress(job.id, 100, "Matchmaking complete");
    
    return {
      result: {
        matchCount: savedMatches.length,
        topMatches: savedMatches.slice(0, 5).map(m => ({
          id: m.id,
          score: m.matchScore,
          investorId: m.investorId,
          firmId: m.firmId,
        })),
      },
    };
  },
};

async function updateJobProgress(jobId: string, progress: number, message: string) {
  await db
    .update(backgroundJobs)
    .set({
      progress,
      progressMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(backgroundJobs.id, jobId));
}

async function getNextJob(): Promise<BackgroundJob | null> {
  const [job] = await db
    .select()
    .from(backgroundJobs)
    .where(
      or(
        eq(backgroundJobs.status, "pending"),
        and(
          eq(backgroundJobs.status, "failed"),
          lt(backgroundJobs.attempts, backgroundJobs.maxAttempts)
        )
      )
    )
    .orderBy(asc(backgroundJobs.priority), asc(backgroundJobs.createdAt))
    .limit(1);

  return job || null;
}

async function processJob(job: BackgroundJob) {
  activeJobs++;
  
  try {
    await db
      .update(backgroundJobs)
      .set({
        status: "processing",
        startedAt: new Date(),
        attempts: (job.attempts || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id));

    const handler = jobHandlers[job.type];
    if (!handler) {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    const { result, error } = await handler(job);

    if (error) {
      throw new Error(error);
    }

    await db
      .update(backgroundJobs)
      .set({
        status: "completed",
        result,
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id));

    console.log(`[Worker] Job ${job.id} (${job.type}) completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const shouldRetry = (job.attempts || 0) + 1 < (job.maxAttempts || 3);
    
    await db
      .update(backgroundJobs)
      .set({
        status: shouldRetry ? "pending" : "failed",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id));

    console.error(`[Worker] Job ${job.id} (${job.type}) failed:`, errorMessage);
  } finally {
    activeJobs--;
  }
}

async function workerLoop() {
  if (!isRunning) return;

  try {
    while (activeJobs < MAX_CONCURRENT_JOBS) {
      const job = await getNextJob();
      if (!job) break;
      
      processJob(job).catch(console.error);
    }
  } catch (error) {
    console.error("[Worker] Error in worker loop:", error);
  }

  setTimeout(workerLoop, WORKER_INTERVAL_MS);
}

export function startWorker() {
  if (isRunning) {
    console.log("[Worker] Already running");
    return;
  }
  
  isRunning = true;
  console.log("[Worker] Background worker started");
  workerLoop();
}

export function stopWorker() {
  isRunning = false;
  console.log("[Worker] Background worker stopped");
}

export async function createJob(
  type: string,
  payload: Record<string, any>,
  options: {
    userId?: string;
    entityId?: string;
    entityType?: string;
    priority?: number;
  } = {}
): Promise<BackgroundJob> {
  const [job] = await db
    .insert(backgroundJobs)
    .values({
      type,
      payload,
      userId: options.userId,
      entityId: options.entityId,
      entityType: options.entityType,
      priority: options.priority || 0,
    })
    .returning();

  console.log(`[Worker] Created job ${job.id} (${type})`);
  return job;
}

export async function getJobStatus(jobId: string): Promise<BackgroundJob | null> {
  const [job] = await db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, jobId))
    .limit(1);

  return job || null;
}

export async function getJobsForUser(userId: string, limit = 10): Promise<BackgroundJob[]> {
  return db
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.userId, userId))
    .orderBy(asc(backgroundJobs.createdAt))
    .limit(limit);
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await db
    .update(backgroundJobs)
    .set({
      status: "failed",
      errorMessage: "Cancelled by user",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundJobs.id, jobId),
        or(
          eq(backgroundJobs.status, "pending"),
          eq(backgroundJobs.status, "processing")
        )
      )
    );

  return true;
}
