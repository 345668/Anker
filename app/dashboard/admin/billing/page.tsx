import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { AdminShell } from "@/components/admin/admin-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Billing & credits — Anker admin" }

/**
 * Billing & credits admin page — stub.
 *
 * Placeholder for plan, usage meters, credit balance, and invoices. Wired
 * into the sidebar so admins have a canonical destination.
 */
export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Admin · billing"
      title="Billing & credits."
      description="Plan, usage meters, credit balance, and invoices. AI-router spend, storage, and seat count all roll up here."
      email={email}
    >
      <div className="rounded-xl border border-foreground/10 bg-background p-6 text-sm text-muted-foreground">
        <p className="mb-3 font-medium text-foreground">Coming soon</p>
        <p>
          This page will show current plan, seats used vs. licensed, AI credits burned
          this cycle by provider (Anthropic / Mistral / Qwen / OpenAI / Gemini), storage
          usage in Vercel Blob + Neon, and download links for the last 12 invoices.
        </p>
      </div>
    </AdminShell>
  )
}
