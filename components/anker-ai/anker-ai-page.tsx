import { redirect } from "next/navigation"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { agentForPersona } from "@/lib/agents/personas"
import { AnkerAiChat } from "./anker-ai-chat"

/**
 * Anker AI — the conversational surface. Doc 28 phase 2.
 *
 * One of two deliberately separate assistants (doc 27 §2.1, decision 2026-09-26):
 *
 *   Anker AI      /dashboard/anker-ai  → /api/anker/chat   conversation, multi-model,
 *                                        NO platform tools, nothing is ever changed
 *   AI Assistant  /dashboard/assistant → /api/assistant    agentic, runs tools, reads
 *                                        and writes workspace records
 *
 * Keeping them apart is a safety property, not a product preference: the chat
 * surface states in its own system prompt that it has no tools and must never
 * claim to have touched a record. Merging the two would make that promise
 * conditional, and a user could no longer tell from the page they are on whether
 * the thing they are talking to can act.
 *
 * This wrapper exists because the chat is a client component and `scopeKey` is
 * server state: the routes reject a request whose scope does not match the
 * session, so it has to be resolved here and passed down. Mirrors
 * components/assistant/persona-assistant-page.tsx.
 */
export async function AnkerAiPage() {
  let p
  try {
    p = await requireAiPrincipal()
  } catch (e) {
    if (e instanceof WorkspaceError && e.status === 401) redirect("/auth/login")
    if (e instanceof WorkspaceError && e.status === 403) {
      return (
        <main className="p-8">
          <h1 className="text-2xl font-semibold">Choose a workspace</h1>
          <p className="my-4">{e.message}</p>
          <a className="underline" href="/dashboard/discover">Set up or select a workspace</a>
        </main>
      )
    }
    throw e
  }
  const agent = agentForPersona(p.persona)
  // Keyed on the scope so switching workspace remounts with a clean history
  // rather than showing the previous workspace's conversation.
  return (
    <AnkerAiChat
      key={`${p.userId}:${p.scopeKey}`}
      scopeKey={p.scopeKey}
      agentLabel={agent.label}
      suggestions={agent.suggestions}
    />
  )
}
