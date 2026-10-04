/**
 * /intake/<fund-slug> — a fund's own public application form (docs/architecture/39).
 * Standalone and frameable, so a fund can link to it or embed it on its own website.
 */
import { notFound } from "next/navigation"
import { getPublicIntake } from "@/lib/intake/store"
import { IntakeForm } from "@/components/intake/intake-form"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPublicIntake((await params).slug)
  return { title: p ? `Pitch ${p.fundName}` : "Not found", robots: { index: false } }
}

export default async function IntakePage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPublicIntake((await params).slug)
  if (!p) notFound()
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <IntakeForm slug={p.slug} fundName={p.fundName} headline={p.headline} intro={p.intro} form={p.form} />
      <p className="mt-8 text-center text-[11px] text-muted-foreground">Powered by Anker</p>
    </main>
  )
}
