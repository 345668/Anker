"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { Check, ArrowUpRight } from "lucide-react"
import { AnkerLogo } from "@/components/brand/anker-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import s from "./onboarding.module.css"

export type PersonaKey = "founder" | "vc"

export function ObShell({ current, total, eyebrow, title, sub, steps, aside, complete = false, allowLeave, children }: {
  current: number; total: number; eyebrow: string; title: string; sub?: string
  steps?: string[]; aside?: React.ReactNode; complete?: boolean; allowLeave?: () => boolean; children: React.ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const previous = useRef(title)
  useEffect(() => {
    if (previous.current !== title) heading.current?.focus()
    previous.current = title
  }, [title])
  return (
    <div className={`marketing-site ${s.page}`} onClickCapture={event => {
      const link = (event.target as Element).closest("a[href]")
      if (link && !link.getAttribute("href")?.startsWith("#") && allowLeave && !allowLeave()) {
        event.preventDefault(); event.stopPropagation()
      }
    }}>
      <a href="#onboarding-content" className={s.skip}>Skip to setup</a>
      <header className={s.header}>
        <Link href="/" aria-label="Anker home"><AnkerLogo className={s.logo} /></Link>
        <span className={s.headerLabel}>Your venture workspace</span>
        <div className={s.headerActions}>
          <Link href="/contact">Need help? <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <ThemeToggle className={s.theme} />
        </div>
      </header>
      <main id="onboarding-content" tabIndex={-1} className={steps ? s.workspace : s.chooserLayout}>
        {steps && <nav className={s.rail} aria-label="Setup progress">
          <p className={s.eyebrow}>Workspace setup</p>
          <p className={s.progressLabel}>{complete ? "Setup complete" : `Step ${current} of ${total}`}</p>
          <progress className={s.progress} value={complete ? total : current - 1} max={total} aria-label="Completed setup steps" />
          <ol className={s.steps}>
            {steps.map((label, i) => <li key={label} aria-current={!complete && i + 1 === current ? "step" : undefined} data-done={complete || i + 1 < current}>
              <span className={s.stepNumber}>{complete || i + 1 < current ? <Check size={14} aria-hidden="true" /> : String(i + 1).padStart(2, "0")}</span>
              <span>{label}</span>
            </li>)}
          </ol>
          <p className={s.railNote}>A few essentials now.<br />Build on them as you go.</p>
        </nav>}
        <div className={s.content}>
          <div className={s.intro}>
            <p className={s.eyebrow}>{eyebrow}</p>
            <h1 ref={heading} tabIndex={-1} className={s.title}>{title}</h1>
            {sub && <p className={s.description}>{sub}</p>}
          </div>
          <div className={aside ? s.formLayout : undefined}>
            <div className={s.formColumn}>{children}</div>
            {aside && <aside className={s.aside} aria-label="Workspace summary">{aside}</aside>}
          </div>
        </div>
      </main>
      <footer className={s.footer}><span>Anker · Venture, connected.</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></footer>
    </div>
  )
}
