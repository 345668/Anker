import Link from "next/link"
import { Fragment } from "react"

/** Draws a registry sentence; `[label](/path)` becomes a link. */
export function LegalText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return <>{parts.map((p, i) => { const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p); return m ? <Link key={i} className="underline" href={m[2]}>{m[1]}</Link> : <Fragment key={i}>{p}</Fragment> })}</>
}
