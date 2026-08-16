"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

export function AdminShell({
  eyebrow,
  title,
  description,
  email,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  email: string | null
  children: ReactNode
}) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Admin tools
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
            <ShieldCheck className="w-3.5 h-3.5" /> {eyebrow}
            {email && <span className="opacity-70">· {email}</span>}
          </div>
          <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05] mb-2">{title}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8">{children}</div>
    </div>
  )
}
