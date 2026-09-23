/** Investor stage vocabulary → the seven startup stages (doc 11 §4.3). */
import { PhraseMap, toList } from "./text"

export const STAGE_ORDER = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "late-stage"] as const
export type Stage = (typeof STAGE_ORDER)[number]

const STAGES = new PhraseMap<Stage[]>()
const add = (stages: Stage[], ...phrases: string[]) => { for (const p of phrases) STAGES.set(p, stages) }

add(["pre-seed"], "pre seed", "preseed", "pre-seed", "idea", "idea stage", "idea first check", "first check", "angel", "angel round", "friends and family", "concept")
add(["seed"], "seed", "seed stage", "pre series a", "pre-series a", "post seed")
add(["pre-seed", "seed", "series-a"], "early stage", "early", "early stage venture", "early-stage venture", "venture")
add(["series-a"], "series a", "a round")
add(["series-b"], "series b", "b round")
add(["series-b", "series-c"], "series b+", "series b plus")
add(["series-c"], "series c", "series c & beyond", "series c and beyond", "series d", "series e", "series f")
add(["growth"], "growth", "growth stage", "expansion", "growth equity", "scale up", "scaleup")
add(["growth", "late-stage"], "later stage", "late stage", "late stage venture", "late-stage venture", "pre ipo", "pre-ipo", "mature")
add(["late-stage"], "buyout", "buyouts", "private equity", "post ipo", "public")

/** Normalise a stored stage list. Unknown labels (debt, grant, bridge …) are ignored. */
export function normalizeStages(raw: unknown): Stage[] {
  const out = new Set<Stage>()
  for (const item of toList(raw)) for (const hit of STAGES.findAll(item)) hit.forEach((s) => out.add(s))
  return STAGE_ORDER.filter((s) => out.has(s))
}

export function stageDistance(a: Stage, b: Stage): number {
  return Math.abs(STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
}
