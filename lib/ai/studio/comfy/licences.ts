/**
 * Licence register for everything a ComfyUI recipe runs (docs/architecture/49 section 3). A recipe may only name keys listed here, and a recipe that is
 * offered to customers may only use entries with `commercial: true`. Entries record what was read and when; each is re-checked on the GPU spike.
 */
export interface LicenceEntry {
  name: string
  licence: string
  /** True only where the licence permits use in paid, customer-facing work. */
  commercial: boolean
  source: string
  checked: string
  note?: string
}
export const LICENCES: Record<string, LicenceEntry> = {
  comfyui: {
    name: "ComfyUI (service)",
    licence: "GPL-3.0",
    commercial: true,
    source: "https://github.com/comfy-org/ComfyUI/blob/master/LICENSE",
    checked: "2026-10-10",
    note: "Run as a separate network service only; no ComfyUI code is copied into Anker.",
  },
  "core-nodes": {
    name: "ComfyUI core nodes (no model)",
    licence: "GPL-3.0",
    commercial: true,
    source: "https://github.com/comfy-org/ComfyUI",
    checked: "2026-10-10",
    note: "Used by the smoke recipe: no weights involved.",
  },
  "qwen-image": {
    name: "Qwen-Image weights",
    licence: "Apache-2.0",
    commercial: true,
    source: "model card, Qwen/Qwen-Image",
    checked: "2026-10-10",
    note: "Re-read the card for the exact files used when the recipe is verified.",
  },
  "wan2.2": {
    name: "Wan 2.2 weights",
    licence: "Apache-2.0",
    commercial: true,
    source: "model card, Wan-AI/Wan2.2",
    checked: "2026-10-10",
    note: "Re-read the card for the exact files used when the recipe is verified.",
  },
  "flux1-dev": {
    name: "FLUX.1 [dev] weights",
    licence: "FLUX.1 [dev] Non-Commercial License",
    commercial: false,
    source: "model card, black-forest-labs/FLUX.1-dev",
    checked: "2026-10-10",
    note: "Not offered: the studio makes customer-facing material.",
  },
}
