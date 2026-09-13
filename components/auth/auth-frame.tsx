import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight } from "lucide-react"
import { AnkerLogo } from "@/components/brand/anker-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import s from "./auth.module.css"

export function AuthFrame({ eyebrow, title, description, children, back = false }: {
  eyebrow: string; title: string; description: string; children: ReactNode; back?: boolean
}) {
  return (
    <div className={`marketing-site ${s.page}`}>
      <a className={s.skip} href="#auth-content">Skip to form</a>
      <header className={s.header}>
        <Link href="/" aria-label="Anker home"><AnkerLogo variant="silver" className={s.logo} /></Link>
        <div className={s.headerActions}>
          <Link href="/contact">Need help? <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <ThemeToggle className={s.theme} />
        </div>
      </header>
      <main className={s.layout} id="auth-content" tabIndex={-1}>
        <section className={s.formSide} aria-labelledby="auth-title">
          <div className={s.formWrap}>
            {back && <Link className={s.back} href="/auth/login"><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link>}
            <p className={s.eyebrow}>{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            <p className={s.description}>{description}</p>
            {children}
          </div>
          <footer className={s.footer}><span>Anker · Venture, connected.</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></footer>
        </section>
        <aside className={s.editorial} aria-label="About the Anker workspace">
          <div className={s.editorialTop}><span>The venture workspace</span><span>Built for what comes next</span></div>
          <div className={s.art} aria-hidden="true">
            <svg viewBox="0 0 640 500" fill="none" focusable="false">
              <path d="M80 480V210C80 78 560 78 560 210V480" stroke="#66869e" strokeWidth="1" />
              <path d="M124 480V214C124 102 516 102 516 214V480" stroke="#87a3b8" strokeWidth="2" />
              <path d="M168 480V218C168 127 472 127 472 218V480" stroke="#b5c8d6" strokeWidth="3" />
              <path d="M212 480V224C212 152 428 152 428 224V480" stroke="#e0e8ee" strokeWidth="5" />
              <path d="M256 480V232C256 184 384 184 384 232V480" stroke="#91b5ce" strokeWidth="8" />
              <path d="M0 480H640M80 480L320 380L560 480" stroke="#45647b" />
              <circle cx="320" cy="310" r="18" fill="#d6e3ec" />
            </svg>
          </div>
          <div className={s.editorialCopy}>
            <h2>Relationships.<br />Capital. Possibility.</h2>
            <p>One place for the people, decisions and work that move venture forward.</p>
            <div className={s.audiences}><span>Founders</span><span>Funds</span><span>Limited partners</span></div>
          </div>
        </aside>
      </main>
    </div>
  )
}
