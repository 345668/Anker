"use client"
/** The always-on-top panel (docs/architecture/62 section 6): Document Picture-in-Picture in Chrome and Edge, an ordinary pop-up window elsewhere. Styles are copied so the panel looks the same. */
export async function openPanelWindow(): Promise<Window | null> {
  let w: Window | null = null
  try {
    const pip = (window as any).documentPictureInPicture
    w = pip ? await pip.requestWindow({ width: 380, height: 560 }) : window.open("", "halyard-panel", "popup,width=380,height=560")
  } catch { w = null }
  if (!w) return null
  w.document.title = "Halyard"
  w.document.documentElement.className = document.documentElement.className
  for (const n of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) w.document.head.appendChild(n.cloneNode(true))
  w.document.body.className = document.body.className; w.document.body.style.margin = "0"; w.document.body.style.padding = "12px"
  return w
}
