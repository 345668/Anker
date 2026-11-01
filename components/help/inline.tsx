import Link from "next/link"
import type { ReactNode } from "react"

/** Renders **bold**, `code` and [text](/internal/path). Only same-site links are made. */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((\/[^)\s]*)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) out.push(<strong key={i++}>{m[1]}</strong>)
    else if (m[2]) out.push(<code key={i++} className="rounded bg-muted px-1 text-[0.9em]">{m[2]}</code>)
    else out.push(<Link key={i++} href={m[4]} className="text-primary underline underline-offset-2">{m[3]}</Link>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
