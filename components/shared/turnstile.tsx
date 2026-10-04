"use client"

import { useEffect, useRef, useState } from "react"

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void } } }

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/**
 * Cloudflare Turnstile bot check for the public forms. Renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; the matching
 * TURNSTILE_SECRET_KEY on the server then makes the check mandatory. With neither set the form works as before. The token travels in the hidden
 * field `turnstile_token`, which the public routes already verify.
 */
export function Turnstile() {
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const box = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState("")
  useEffect(() => {
    if (!site || !box.current) return
    let id: string | undefined
    const mount = () => { if (box.current && window.turnstile && !id) id = window.turnstile.render(box.current, { sitekey: site, callback: (t: string) => setToken(t), "expired-callback": () => setToken(""), "error-callback": () => setToken("") }) }
    if (window.turnstile) mount()
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
      if (!s) { s = document.createElement("script"); s.src = SRC; s.async = true; document.head.appendChild(s) }
      s.addEventListener("load", mount)
    }
    return () => { try { if (id) window.turnstile?.remove(id) } catch { /* the widget is gone with the page */ } }
  }, [site])
  if (!site) return null
  return <><div ref={box} className="min-h-[65px]" /><input type="hidden" name="turnstile_token" value={token} readOnly /></>
}
