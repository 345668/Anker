"use client"

import { useEffect, useState } from "react"

/**
 * Keep motion preferences in sync with the OS. Components that auto-rotate
 * content should use this hook to stop timers and render the first state as
 * useful, stable content when reduced motion is requested.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener?.("change", update)
    return () => media.removeEventListener?.("change", update)
  }, [])

  return reduced
}
