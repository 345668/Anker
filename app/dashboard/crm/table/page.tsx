import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContacts } from "@/lib/db/platform-queries"
import { ContactsTable, type ContactRow } from "@/components/data/contacts-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "CRM — contacts table | Anker" }

export default async function CrmTablePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const contacts = (await getContacts(500)) as unknown as ContactRow[]

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#e5380f]" /> Relationships
        </div>
        <h1 className="text-3xl font-display tracking-tight">Contacts</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your relationship graph as a table — search, filter, and export. The board view lives in CRM.</p>
      </div>
      <ContactsTable rows={contacts} />
    </div>
  )
}
