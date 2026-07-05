"use client"

/**
 * Tiny sign-out button used in the LP portal header.
 * Lives in its own file because the LP layout is a server component
 * and can't mount client handlers directly.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LogOut, Loader2 } from "lucide-react"

export function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true)
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push("/auth/login")
        router.refresh()
      }}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
      Sign out
    </button>
  )
}
