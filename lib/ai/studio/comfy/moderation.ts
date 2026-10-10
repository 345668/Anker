/**
 * Content screening for self-hosted generation (docs/architecture/49 section 5). Open models have no built-in safety, unlike the hosted providers. A recipe that takes free text
 * only runs when both screens are set up, and a screen that cannot decide blocks. The real classifiers are a later step; until they are registered, free-text recipes stay off.
 */
export interface Screens {
  prompt: (text: string) => Promise<{ ok: boolean; reason?: string }>
  output: (bytes: Buffer, kind: "image" | "video") => Promise<{ ok: boolean; reason?: string }>
}
let screens: Screens | null = null
export const registerScreens = (s: Screens | null) => {
  screens = s
}
export const screensReady = () => screens !== null
export async function screenPrompt(text: string) {
  if (!screens) return { ok: false, reason: "Content screening is not set up." }
  try {
    return await screens.prompt(text)
  } catch {
    return { ok: false, reason: "The prompt could not be screened." }
  }
}
export async function screenOutput(bytes: Buffer, kind: "image" | "video") {
  if (!screens) return { ok: false, reason: "Content screening is not set up." }
  try {
    return await screens.output(bytes, kind)
  } catch {
    return { ok: false, reason: "The result could not be screened." }
  }
}
