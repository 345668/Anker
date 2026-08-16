import { sql } from "@/lib/db"
import { computeVesting, buildVestingSchedule, exercisable, type VestRow, type VestingResult } from "@/lib/modules/vesting"

/**
 * Share Plans engine (server) — company-scoped grant servicing on top of the
 * pure vesting math in `./vesting`. Handles the exercise ledger, the derived
 * exercised total, the authorized option pool, and the detail rollup the
 * grant page renders.
 *
 * Every mutation is scoped by (id, company_id) so one founder can never touch
 * another company's grants. `exercised_options` is a cached column recomputed
 * from the ledger after each change — never hand-set (same pattern as the
 * loans outstanding balance).
 */

export interface GrantFull {
  id: string
  company_id: string
  grantee_name: string
  grantee_email: string | null
  options: number
  strike_price: number | null
  grant_date: string | null
  vesting_start: string | null
  vest_months: number
  cliff_months: number
  terminated_on: string | null
  exercised_options: number
  status: "draft" | "granted" | "exercised" | "cancelled"
  created_at: string
}

export interface Exercise {
  id: string
  grant_id: string
  exercised_on: string
  quantity: number
  note: string | null
  created_at: string
}

export interface GrantServicing {
  grant: GrantFull
  exercises: Exercise[]
  vesting: VestingResult
  schedule: VestRow[]
  exercisable: number
  /** Notional cost to exercise everything currently exercisable, at strike. */
  exercisableCost: number
}

const n = (v: any, d = 0) => (v == null ? d : Number(v))
// Neon returns `date` columns as JS Date objects (local midnight) and other
// drivers as "yyyy-mm-dd" strings. Normalize both to a plain yyyy-mm-dd,
// reading local components so we never tz-shift a date-only value.
const d = (v: any): string | null => {
  if (v == null) return null
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), day = String(v.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  return String(v).slice(0, 10)
}

function normGrant(r: any): GrantFull {
  return {
    id: r.id, company_id: r.company_id,
    grantee_name: r.grantee_name, grantee_email: r.grantee_email ?? null,
    options: n(r.options), strike_price: r.strike_price != null ? Number(r.strike_price) : null,
    grant_date: d(r.grant_date), vesting_start: d(r.vesting_start),
    vest_months: n(r.vest_months, 48), cliff_months: n(r.cliff_months, 12),
    terminated_on: d(r.terminated_on), exercised_options: n(r.exercised_options),
    status: r.status, created_at: String(r.created_at),
  }
}
function normExercise(r: any): Exercise {
  return { id: r.id, grant_id: r.grant_id, exercised_on: d(r.exercised_on)!, quantity: n(r.quantity), note: r.note ?? null, created_at: String(r.created_at) }
}

export async function getGrant(companyId: string, id: string): Promise<GrantFull | null> {
  const rows = await sql`SELECT * FROM option_grants WHERE id = ${id} AND company_id = ${companyId} LIMIT 1`
  return rows[0] ? normGrant(rows[0]) : null
}

export async function listExercises(grantId: string): Promise<Exercise[]> {
  const rows = await sql`SELECT * FROM grant_exercises WHERE grant_id = ${grantId} ORDER BY exercised_on ASC, created_at ASC`
  return rows.map(normExercise)
}

/** Recompute the cached exercised total from the ledger; flip status when fully exercised. */
export async function recomputeExercised(companyId: string, grantId: string): Promise<number> {
  const rows = await sql`SELECT COALESCE(SUM(quantity), 0) AS total FROM grant_exercises WHERE grant_id = ${grantId}`
  const total = n(rows[0]?.total)
  await sql`UPDATE option_grants SET exercised_options = ${total} WHERE id = ${grantId} AND company_id = ${companyId}`
  return total
}

/**
 * Record an exercise. Guards against exercising more than is currently vested
 * and unexercised (as of the exercise date). Returns null if the grant isn't
 * found; throws with a clear message when the quantity exceeds what's exercisable.
 */
export async function addExercise(
  companyId: string,
  grantId: string,
  input: { exercisedOn?: string | null; quantity: number; note?: string | null },
): Promise<{ exercise: Exercise; grant: GrantFull } | null> {
  const grant = await getGrant(companyId, grantId)
  if (!grant) return null
  const qty = Math.max(0, Math.floor(input.quantity))
  if (qty <= 0) throw new Error("Quantity must be a positive number of options.")

  const asOf = input.exercisedOn ? new Date(`${input.exercisedOn}T00:00:00`) : new Date()
  const { vested } = computeVesting(
    { totalOptions: grant.options, vestingStart: grant.vesting_start ?? grant.grant_date, vestMonths: grant.vest_months, cliffMonths: grant.cliff_months, terminatedOn: grant.terminated_on },
    asOf,
  )
  const room = exercisable(vested, grant.exercised_options)
  if (qty > room) {
    throw new Error(`Only ${room.toLocaleString()} option(s) are vested and exercisable as of that date (requested ${qty.toLocaleString()}).`)
  }

  const rows = await sql`
    INSERT INTO grant_exercises (grant_id, exercised_on, quantity, note)
    VALUES (${grantId}, COALESCE(${input.exercisedOn ?? null}::date, CURRENT_DATE), ${qty}, ${input.note ?? null})
    RETURNING *`
  await recomputeExercised(companyId, grantId)
  // Fully exercised → mark the grant exercised; otherwise leave status as-is.
  const after = await getGrant(companyId, grantId)
  if (after && after.exercised_options >= after.options && after.status === "granted") {
    await sql`UPDATE option_grants SET status = 'exercised' WHERE id = ${grantId} AND company_id = ${companyId}`
  }
  const grantAfter = (await getGrant(companyId, grantId))!
  return { exercise: normExercise(rows[0]), grant: grantAfter }
}

export async function removeExercise(companyId: string, grantId: string, exerciseId: string): Promise<GrantFull | null> {
  const grant = await getGrant(companyId, grantId)
  if (!grant) return null
  await sql`DELETE FROM grant_exercises WHERE id = ${exerciseId} AND grant_id = ${grantId}`
  await recomputeExercised(companyId, grantId)
  // Reverting below the fully-exercised line returns the grant to 'granted'.
  const after = await getGrant(companyId, grantId)
  if (after && after.status === "exercised" && after.exercised_options < after.options) {
    await sql`UPDATE option_grants SET status = 'granted' WHERE id = ${grantId} AND company_id = ${companyId}`
  }
  return (await getGrant(companyId, grantId))!
}

const STATUSES = ["draft", "granted", "exercised", "cancelled"] as const
export async function setGrantStatus(companyId: string, id: string, status: string): Promise<GrantFull | null> {
  if (!STATUSES.includes(status as any)) throw new Error("invalid status")
  const rows = await sql`UPDATE option_grants SET status = ${status} WHERE id = ${id} AND company_id = ${companyId} RETURNING *`
  return rows[0] ? normGrant(rows[0]) : null
}

export interface GrantTerms {
  options?: number
  strike?: number | null
  grantDate?: string | null
  vestingStart?: string | null
  vestMonths?: number
  cliffMonths?: number
  terminatedOn?: string | null
}
export async function updateGrantTerms(companyId: string, id: string, t: GrantTerms): Promise<GrantFull | null> {
  const g = await getGrant(companyId, id)
  if (!g) return null
  const options = t.options != null ? Math.max(0, Math.floor(t.options)) : g.options
  const strike = t.strike !== undefined ? t.strike : g.strike_price
  const grantDate = t.grantDate !== undefined ? t.grantDate : g.grant_date
  const vestingStart = t.vestingStart !== undefined ? t.vestingStart : g.vesting_start
  const vestMonths = t.vestMonths != null ? Math.max(1, Math.floor(t.vestMonths)) : g.vest_months
  const cliffMonths = t.cliffMonths != null ? Math.max(0, Math.floor(t.cliffMonths)) : g.cliff_months
  const terminatedOn = t.terminatedOn !== undefined ? t.terminatedOn : g.terminated_on
  const rows = await sql`
    UPDATE option_grants SET
      options = ${options}, strike_price = ${strike}, grant_date = ${grantDate}::date,
      vesting_start = ${vestingStart}::date, vest_months = ${vestMonths},
      cliff_months = ${cliffMonths}, terminated_on = ${terminatedOn}::date
    WHERE id = ${id} AND company_id = ${companyId}
    RETURNING *`
  return rows[0] ? normGrant(rows[0]) : null
}

// ── Option pool (company level) ──────────────────────────────────────────────
export async function getPool(companyId: string): Promise<number> {
  const rows = await sql`SELECT authorized FROM option_pools WHERE company_id = ${companyId} LIMIT 1`
  return n(rows[0]?.authorized)
}
export async function setPool(companyId: string, authorized: number): Promise<number> {
  const v = Math.max(0, Math.floor(authorized))
  const rows = await sql`
    INSERT INTO option_pools (company_id, authorized, updated_at)
    VALUES (${companyId}, ${v}, now())
    ON CONFLICT (company_id) DO UPDATE SET authorized = ${v}, updated_at = now()
    RETURNING authorized`
  return n(rows[0]?.authorized)
}

/** Full detail rollup for the grant page: vesting state, schedule, exercises. */
export async function getGrantServicing(companyId: string, id: string): Promise<GrantServicing | null> {
  const grant = await getGrant(companyId, id)
  if (!grant) return null
  const exercises = await listExercises(id)
  const vesting = computeVesting({
    totalOptions: grant.options,
    vestingStart: grant.vesting_start ?? grant.grant_date,
    vestMonths: grant.vest_months,
    cliffMonths: grant.cliff_months,
    terminatedOn: grant.terminated_on,
  })
  const schedule = buildVestingSchedule({
    totalOptions: grant.options,
    vestingStart: grant.vesting_start ?? grant.grant_date,
    vestMonths: grant.vest_months,
    cliffMonths: grant.cliff_months,
    terminatedOn: grant.terminated_on,
  })
  const canExercise = exercisable(vesting.vested, grant.exercised_options)
  return {
    grant, exercises, vesting, schedule,
    exercisable: canExercise,
    exercisableCost: grant.strike_price != null ? canExercise * grant.strike_price : 0,
  }
}
