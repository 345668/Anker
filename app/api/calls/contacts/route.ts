import { sql } from "@/lib/db"
import { callResponse, callScope } from "@/lib/calls/access"
export async function GET() {
  return callResponse(async () => {
    const scope = await callScope()
    if (scope.persona === "lp") return { contacts: [] }
    return { contacts: await sql`SELECT id, display_name FROM crm_entries WHERE user_id = ${scope.userId} ORDER BY display_name LIMIT 500` }
  })
}
