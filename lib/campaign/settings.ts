/**
 * Admin-adjustable campaign engine settings (single DB row, campaign_settings).
 * The gate threshold, investor caps, wave size, and the two automation toggles
 * live here so the admin controls them from the platform — env vars remain the
 * fallback defaults. Read on every assessment/send so changes take effect
 * immediately, no redeploy.
 */
import { sql } from "@/lib/db"

export interface CampaignSettings {
  /** Readiness cutoff 0–100; below this a submission is auto-declined. */
  readinessThreshold: number
  /** Minimum match score for an investor to be included. */
  scoreFloor: number
  /** Max investors per campaign. */
  maxInvestors: number
  /** Investors emailed per send wave. */
  waveSize: number
  /** When false, the assessment cron won't auto-process received submissions
   *  (admin runs assessment manually). */
  autoAssess: boolean
  /** When false, an assessed/matched campaign waits for admin release before
   *  any investor email goes out. */
  autoSend: boolean
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  readinessThreshold: Number(process.env.CAMPAIGN_READINESS_THRESHOLD) || 62,
  scoreFloor: Number(process.env.CAMPAIGN_MATCH_SCORE_FLOOR) || 55,
  maxInvestors: Number(process.env.CAMPAIGN_MAX_INVESTORS) || 100,
  waveSize: Number(process.env.CAMPAIGN_WAVE_SIZE) || 20,
  autoAssess: process.env.CAMPAIGN_AUTO_ASSESS !== "false",
  autoSend: process.env.CAMPAIGN_AUTO_SEND !== "false",
}

function coerce(raw: any): CampaignSettings {
  const d = DEFAULT_SETTINGS
  const clampInt = (v: any, min: number, max: number, fb: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb
  }
  return {
    readinessThreshold: clampInt(raw?.readinessThreshold, 0, 100, d.readinessThreshold),
    scoreFloor: clampInt(raw?.scoreFloor, 0, 100, d.scoreFloor),
    maxInvestors: clampInt(raw?.maxInvestors, 1, 500, d.maxInvestors),
    waveSize: clampInt(raw?.waveSize, 1, 200, d.waveSize),
    autoAssess: typeof raw?.autoAssess === "boolean" ? raw.autoAssess : d.autoAssess,
    autoSend: typeof raw?.autoSend === "boolean" ? raw.autoSend : d.autoSend,
  }
}

/** Read the effective settings (persisted overrides merged over env defaults). */
export async function getCampaignSettings(): Promise<CampaignSettings> {
  try {
    const rows = await sql`SELECT data FROM campaign_settings WHERE id = 1 LIMIT 1`
    return coerce(rows[0]?.data ?? {})
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Persist a partial update; returns the merged effective settings. */
export async function updateCampaignSettings(
  patch: Partial<CampaignSettings>,
  updatedBy?: string | null,
): Promise<CampaignSettings> {
  const current = await getCampaignSettings()
  const merged = coerce({ ...current, ...patch })
  await sql`
    INSERT INTO campaign_settings (id, data, updated_by, updated_at)
    VALUES (1, ${JSON.stringify(merged)}::jsonb, ${updatedBy ?? null}, NOW())
    ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = NOW()
  `
  return merged
}
