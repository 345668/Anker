/**
 * Licence register for the open-weights lane (docs/architecture/53 section 6). A model may be used by a task only if its entry here says `commercial: true` AND a person has set `checked`
 * to the date they read the licence. Every candidate below ships as NOT cleared: nobody has read these licences for this purpose, and "open weights" does not mean "free to use in a
 * paid product". Setting `commercial: true` is a decision (counsel reads this register before private mode is sold); until then the lane refuses to run, and says why.
 */
export interface ModelLicence {
  /** The model id exactly as the serving engine reports it. */
  id: string
  family: string
  /** Where the weights and the licence text come from. */
  source: string
  licence: string
  /** True only where a person has read the licence and it permits use in paid, customer-facing work with the conditions we can meet. */
  commercial: boolean
  /** ISO date a person read it; empty until then. */
  checked: string
  /** SHA-256 of the pinned weights file(s), recorded when the model is deployed. Empty until then. */
  checksum: string
  note: string
}
export const MODEL_LICENCES: ModelLicence[] = [
  { id: "Qwen/Qwen3-8B", family: "Qwen3 instruct", source: "https://huggingface.co/Qwen/Qwen3-8B", licence: "to be read", commercial: false, checked: "", checksum: "", note: "Candidate: the rest of Anker is tuned for Qwen. Licence not yet read for this purpose." },
  { id: "Qwen/Qwen3-32B", family: "Qwen3 instruct", source: "https://huggingface.co/Qwen/Qwen3-32B", licence: "to be read", commercial: false, checked: "", checksum: "", note: "Candidate for the balanced tier. Licence not yet read for this purpose." },
  { id: "mistralai/Mistral-Small-3.2-24B-Instruct-2506", family: "Mistral Small", source: "https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506", licence: "to be read", commercial: false, checked: "", checksum: "", note: "Candidate for comparison. Licence not yet read for this purpose." },
]
export interface Clearance { ok: boolean; reason: string | null; entry: ModelLicence | null }
/** Whether a model may be used for customer-facing work. Unknown, uncleared and unchecked models are refused with the reason. */
export function clearance(modelId: string | null | undefined, register: ModelLicence[] = MODEL_LICENCES): Clearance {
  const e = register.find((x) => x.id === modelId) ?? null
  if (!modelId) return { ok: false, reason: "No open-weights model is configured.", entry: null }
  if (!e) return { ok: false, reason: `The model "${modelId}" is not in the licence register (lib/ai/openweights/licences.ts).`, entry: null }
  if (!e.commercial) return { ok: false, reason: `The licence of "${modelId}" has not been cleared for customer-facing use.`, entry: e }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checked)) return { ok: false, reason: `Nobody has recorded reading the licence of "${modelId}".`, entry: e }
  return { ok: true, reason: null, entry: e }
}
