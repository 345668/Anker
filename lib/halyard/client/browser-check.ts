/** What this browser can do for a Halyard session, in plain words (docs/architecture/62 section 6). Pure: the caller passes what it can detect, so it is testable. */
export interface BrowserFacts { ua: string; secure: boolean; getUserMedia: boolean; displayMedia: boolean; worklet: boolean; documentPip: boolean; wakeLock: boolean }
export interface BrowserCheck {
  /** The microphone can be used at all. */
  canListen: boolean
  /** A meeting tab's audio can be captured (a second, separate "Them" channel). */
  tabAudio: boolean
  /** An always-on-top panel window is available. */
  pip: "document" | "popup"
  wakeLock: boolean
  /** Why it cannot listen, or null. */
  problem: string | null
  /** What will and will not work, one sentence each. */
  notes: string[]
}
export function checkBrowser(f: BrowserFacts): BrowserCheck {
  const chromium = /\b(Chrome|Chromium|Edg|OPR)\//.test(f.ua) && !/\b(Mobile|Android|iPhone|iPad)\b/.test(f.ua) && !/\bFxiOS|CriOS\b/.test(f.ua)
  const mobile = /\b(Mobile|Android|iPhone|iPad)\b/.test(f.ua)
  const problem = !f.secure ? "Microphone access needs a secure (https) page." : !f.getUserMedia ? "This browser cannot use the microphone." : !f.worklet ? "This browser cannot process live audio. Use a recent Chrome, Edge, Firefox or Safari." : null
  const tabAudio = !problem && f.displayMedia && chromium
  const notes: string[] = []
  if (!problem) {
    if (tabAudio) notes.push("You can share the meeting's tab with its audio, so the other side and you are transcribed as separate speakers.")
    else if (mobile) notes.push("On a phone the microphone is the only source, and it hears both sides if the call is on speaker.")
    else if (/\bFirefox\//.test(f.ua)) notes.push("Firefox cannot capture a tab's audio. The microphone alone will hear both sides if you use speakers; use Chrome or Edge for separate speakers.")
    else if (/\bSafari\//.test(f.ua) && !chromium) notes.push("Safari cannot capture meeting audio. The microphone alone will hear both sides if you use speakers; use Chrome or Edge for separate speakers.")
    else notes.push("This browser cannot capture a meeting tab's audio; the microphone alone is used.")
    if (!f.documentPip) notes.push("There is no always-on-top panel in this browser; the pop-out opens an ordinary window you can place beside the call.")
    if (!f.wakeLock) notes.push("This browser may let the screen sleep during a long call; keep it awake in your system settings.")
    notes.push("Without headphones the microphone also hears the other side; a copy of their words that is picked up as yours is removed, but headphones are better.")
  }
  return { canListen: !problem, tabAudio, pip: f.documentPip ? "document" : "popup", wakeLock: f.wakeLock, problem, notes }
}
/** Reads the facts from the running browser. */
export function browserFacts(): BrowserFacts {
  const n = typeof navigator === "undefined" ? ({} as any) : (navigator as any), w = typeof window === "undefined" ? ({} as any) : (window as any)
  return { ua: n.userAgent ?? "", secure: !!w.isSecureContext, getUserMedia: !!n.mediaDevices?.getUserMedia, displayMedia: !!n.mediaDevices?.getDisplayMedia, worklet: typeof w.AudioWorkletNode !== "undefined", documentPip: !!w.documentPictureInPicture, wakeLock: !!n.wakeLock }
}
