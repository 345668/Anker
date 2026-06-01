#!/usr/bin/env node
/**
 * Anker MCP server — stdio transport.
 *
 * Exposes the Anker fundraising stack to any MCP-compatible client
 * (Claude Code, Cursor, Continue, Aider, local-model agents, etc.)
 * as a focused toolset.  Designed to be paired with a LOCAL model
 * via Ollama, in line with the user's directive to use local models
 * in place of ChatGPT / Perplexity.
 *
 * Configure your MCP client with:
 *   {
 *     "mcpServers": {
 *       "anker": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/Anker/mcp-server/bin/anker-mcp.mjs"],
 *         "env": {
 *           "DATABASE_URL": "postgresql://anker:anker@localhost:5432/anker",
 *           "ANKER_API_BASE": "http://localhost:3000"
 *         }
 *       }
 *     }
 *   }
 *
 * Tools exposed:
 *   search_investors       — full-text search over investment_firms / investors
 *   list_recent_sessions   — last N matchmaking runs (LP or founder)
 *   get_session            — fetch a full matchmaking result by sessionId
 *   list_crm_entries       — read crm_entries by stage / source / search
 *   add_to_crm             — add a single firm or investor to the queued column
 *   move_crm_stage         — transition a CRM entry to a new stage
 *   generate_dms           — Layer 2: produce the 4-step LinkedIn sequence
 *                             (calls /api/outreach/generate)
 *   classify_reply         — Layer 4: classify an inbound reply + draft response
 *                             (calls /api/outreach/replies)
 *   list_outreach_messages — read outreach_messages by entry id or status
 *   get_database_stats     — counts of firms / investors / crm_entries by source
 *
 * The server intentionally does NOT auto-send anything.  All sends go
 * through the human approval gate in /dashboard/shortlist.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import pg from "pg"
const { Pool } = pg

// ─── env ─────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://anker:anker@localhost:5432/anker"
const ANKER_API_BASE = (process.env.ANKER_API_BASE || "http://localhost:3000").replace(/\/+$/, "")
// Optional: a session cookie / bearer for the API.  When unset the MCP
// will only call DB-only tools and skip API-backed ones (generate_dms,
// classify_reply) with a clear error.
const ANKER_SESSION_COOKIE = process.env.ANKER_SESSION_COOKIE || ""

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 })

// ─── tool definitions ───────────────────────────────────────────────────
const TOOLS = [
  {
    name: "search_investors",
    description:
      "Search the Anker database for firms or individual investors by free text. Returns up to `limit` rows with id, name, type, location, sectors, source, contact info.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search (matches name, sectors, description)." },
        kind: { type: "string", enum: ["firm", "person", "both"], default: "both" },
        type: { type: "string", description: "Optional firm type filter (e.g. 'venture capital', 'family office', 'accelerator')." },
        limit: { type: "number", default: 20, maximum: 100 },
      },
      required: ["query"],
    },
  },
  {
    name: "list_recent_sessions",
    description: "List the most recent matchmaking sessions (LP or founder) with totals and timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["lp", "founder", "both"], default: "both" },
        limit: { type: "number", default: 10, maximum: 50 },
      },
    },
  },
  {
    name: "get_session",
    description: "Fetch a single matchmaking session by id (returns top firms / contacts and totals).",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        kind: { type: "string", enum: ["lp", "founder"], description: "Which sessions table to read." },
      },
      required: ["sessionId", "kind"],
    },
  },
  {
    name: "list_crm_entries",
    description: "Read crm_entries.  Filter by stage and/or source, optional free-text search.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Filter by user_id (otherwise returns all)." },
        stage: {
          type: "string",
          enum: ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"],
        },
        source: { type: "string", enum: ["lp_matching", "founder_matching", "manual"] },
        query: { type: "string" },
        limit: { type: "number", default: 50, maximum: 500 },
      },
    },
  },
  {
    name: "add_to_crm",
    description:
      "Add a single firm or investor to the user's CRM as a queued outreach target. Returns 'created' or 'alreadyPresent'.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Required — user_id who owns the entry." },
        firmId: { type: "string" },
        investorId: { type: "string" },
        displayName: { type: "string", description: "Display name for the CRM card." },
        displayTitle: { type: "string" },
        displayEmail: { type: "string" },
        displayLinkedin: { type: "string" },
        displayLocation: { type: "string" },
        displayType: { type: "string" },
        whyMatch: { type: "string" },
      },
      required: ["userId", "displayName"],
    },
  },
  {
    name: "move_crm_stage",
    description: "Transition a CRM entry to a new stage. Optionally update last_contacted_at.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: { type: "string" },
        userId: { type: "string" },
        stage: {
          type: "string",
          enum: ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"],
        },
        markContactedNow: { type: "boolean", default: false },
      },
      required: ["entryId", "userId", "stage"],
    },
  },
  {
    name: "generate_dms",
    description:
      "Layer 2 of the outreach loop: generate a 4-step LinkedIn sequence (day 0/3/7/14) for one or more CRM entries via the Anker API. Drafts only, no send. Local-model when Ollama is configured.",
    inputSchema: {
      type: "object",
      properties: {
        crmEntryIds: { type: "array", items: { type: "string" } },
        founder: {
          type: "object",
          properties: {
            companyName: { type: "string" },
            oneLiner: { type: "string" },
            facts: { type: "array", items: { type: "string" } },
            calendarUrl: { type: "string" },
            currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
          },
          required: ["companyName", "oneLiner"],
        },
        partnerPosts: {
          type: "object",
          description:
            "Optional map: crmEntryId → array of recent LinkedIn posts ({text, timestamp?, url?}). Used to hook the day-0 message off a real recent post.",
        },
      },
      required: ["crmEntryIds", "founder"],
    },
  },
  {
    name: "classify_reply",
    description:
      "Layer 4: classify a partner's reply (INTERESTED / INTERESTED_LATER / WRONG_FIT / WRONG_NOW / QUESTION) and draft a response under 320 chars via the Anker API.",
    inputSchema: {
      type: "object",
      properties: {
        crmEntryId: { type: "string" },
        replyText: { type: "string" },
        inReplyToMessageId: { type: "string" },
        founder: {
          type: "object",
          properties: {
            companyName: { type: "string" },
            oneLiner: { type: "string" },
            facts: { type: "array", items: { type: "string" } },
            calendarUrl: { type: "string" },
          },
          required: ["companyName", "oneLiner"],
        },
      },
      required: ["crmEntryId", "replyText", "founder"],
    },
  },
  {
    name: "list_outreach_messages",
    description: "List outreach_messages by crm_entry_id, or by status (e.g. 'queued', 'sent').",
    inputSchema: {
      type: "object",
      properties: {
        crmEntryId: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "approved", "queued", "sent", "delivered", "failed", "cancelled", "replied", "accepted"],
        },
        limit: { type: "number", default: 50, maximum: 500 },
      },
    },
  },
  {
    name: "get_database_stats",
    description: "Counts of firms / investors / crm_entries by source. Useful first call to see what's loaded.",
    inputSchema: { type: "object", properties: {} },
  },
]

// ─── server boot ────────────────────────────────────────────────────────
const server = new Server(
  { name: "anker-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const args = req.params.arguments ?? {}
  try {
    switch (name) {
      case "search_investors":      return ok(await searchInvestors(args))
      case "list_recent_sessions":  return ok(await listRecentSessions(args))
      case "get_session":           return ok(await getSession(args))
      case "list_crm_entries":      return ok(await listCrmEntries(args))
      case "add_to_crm":            return ok(await addToCrm(args))
      case "move_crm_stage":        return ok(await moveCrmStage(args))
      case "generate_dms":          return ok(await generateDms(args))
      case "classify_reply":        return ok(await classifyReply(args))
      case "list_outreach_messages":return ok(await listOutreachMessages(args))
      case "get_database_stats":    return ok(await getDatabaseStats())
      default: return error(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return error(`Tool '${name}' failed: ${e.message}`)
  }
})

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
}
function error(msg) {
  return { content: [{ type: "text", text: msg }], isError: true }
}

// ─── tool impls (DB-only) ───────────────────────────────────────────────
async function searchInvestors({ query, kind = "both", type, limit = 20 }) {
  const cap = Math.min(Number(limit) || 20, 100)
  const results = {}
  if (kind === "firm" || kind === "both") {
    const params = [`%${query}%`]
    let where = `(name ILIKE $1 OR description ILIKE $1 OR sectors::text ILIKE $1)`
    if (type) { where += ` AND type = $2`; params.push(type) }
    const r = await pool.query(
      `SELECT id, name, type, hq_location, sectors::text AS sectors, website,
              source, typical_check_size
         FROM investment_firms
        WHERE ${where}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT ${cap}`,
      params,
    )
    results.firms = r.rows
  }
  if (kind === "person" || kind === "both") {
    const r = await pool.query(
      `SELECT id, first_name, last_name, title, email, linkedin_url, firm_id,
              location, source, investor_type
         FROM investors
        WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR title ILIKE $1
              OR bio ILIKE $1 OR email ILIKE $1
        ORDER BY updated_at DESC NULLS LAST
        LIMIT ${cap}`,
      [`%${query}%`],
    )
    results.people = r.rows
  }
  return results
}

async function listRecentSessions({ kind = "both", limit = 10 }) {
  const cap = Math.min(Number(limit) || 10, 50)
  const out = {}
  if (kind === "lp" || kind === "both") {
    const r = await pool.query(
      `SELECT id, fund_profile_id, fund_name, qualified_firms, qualified_contacts,
              contacts_with_email, anchor_candidates, duration_ms, created_at
         FROM lp_match_sessions
        ORDER BY created_at DESC LIMIT ${cap}`,
    )
    out.lp = r.rows
  }
  if (kind === "founder" || kind === "both") {
    const r = await pool.query(
      `SELECT id, startup_name, qualified_firms, qualified_contacts, created_at
         FROM founder_match_sessions
        ORDER BY created_at DESC LIMIT ${cap}`,
    ).catch(() => ({ rows: [] }))
    out.founder = r.rows
  }
  return out
}

async function getSession({ sessionId, kind }) {
  const table = kind === "lp" ? "lp_match_sessions" : "founder_match_sessions"
  const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [sessionId])
  if (!r.rows.length) throw new Error(`Session ${sessionId} not found in ${table}`)
  return r.rows[0]
}

async function listCrmEntries({ userId, stage, source, query, limit = 50 }) {
  const cap = Math.min(Number(limit) || 50, 500)
  const where = []
  const params = []
  if (userId) { params.push(userId); where.push(`user_id = $${params.length}`) }
  if (stage)  { params.push(stage);  where.push(`stage = $${params.length}`) }
  if (source) { params.push(source); where.push(`source = $${params.length}`) }
  if (query)  {
    params.push(`%${query}%`)
    where.push(`(display_name ILIKE $${params.length} OR display_email ILIKE $${params.length} OR why_match ILIKE $${params.length})`)
  }
  const sql = `SELECT * FROM crm_entries ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY added_at DESC LIMIT ${cap}`
  const r = await pool.query(sql, params)
  return { count: r.rows.length, entries: r.rows }
}

async function addToCrm(args) {
  const { userId, firmId = null, investorId = null,
          displayName, displayTitle = null, displayEmail = null,
          displayLinkedin = null, displayLocation = null,
          displayType = null, whyMatch = null } = args
  if (!userId || !displayName) throw new Error("userId + displayName required")
  const r = await pool.query(
    `INSERT INTO crm_entries (
        user_id, source, firm_id, investor_id,
        display_name, display_title, display_email, display_linkedin,
        display_location, display_type, why_match, stage
     ) VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued')
     ON CONFLICT (user_id, source, firm_id, investor_id) DO NOTHING
     RETURNING *`,
    [userId, firmId, investorId, displayName, displayTitle, displayEmail,
     displayLinkedin, displayLocation, displayType, whyMatch],
  )
  if (r.rows.length) return { status: "created", entry: r.rows[0] }
  return { status: "alreadyPresent" }
}

async function moveCrmStage({ entryId, userId, stage, markContactedNow = false }) {
  const r = await pool.query(
    `UPDATE crm_entries
        SET stage = $3,
            last_contacted_at = CASE WHEN $4 THEN NOW() ELSE last_contacted_at END,
            updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [entryId, userId, stage, markContactedNow],
  )
  if (!r.rows.length) throw new Error(`Entry ${entryId} not found for this user`)
  return r.rows[0]
}

async function listOutreachMessages({ crmEntryId, status, limit = 50 }) {
  const cap = Math.min(Number(limit) || 50, 500)
  const where = []
  const params = []
  if (crmEntryId) { params.push(crmEntryId); where.push(`crm_entry_id = $${params.length}`) }
  if (status)     { params.push(status);     where.push(`status = $${params.length}`) }
  const sql = `SELECT * FROM outreach_messages
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY step_number ASC, created_at DESC LIMIT ${cap}`
  const r = await pool.query(sql, params)
  return { count: r.rows.length, messages: r.rows }
}

async function getDatabaseStats() {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM investment_firms)          AS firms_total,
      (SELECT COUNT(*) FROM investors)                  AS investors_total,
      (SELECT COUNT(*) FROM crm_entries)                AS crm_entries_total,
      (SELECT COUNT(*) FROM outreach_messages)          AS outreach_messages_total
  `)
  const bySource = await pool.query(`
    SELECT source, COUNT(*) AS n FROM investment_firms
    WHERE source IS NOT NULL GROUP BY source ORDER BY n DESC LIMIT 20
  `)
  const byType = await pool.query(`
    SELECT COALESCE(type, '(unknown)') AS type, COUNT(*) AS n FROM investment_firms
    GROUP BY type ORDER BY n DESC LIMIT 20
  `).catch(() => ({ rows: [] }))
  const byStage = await pool.query(`
    SELECT stage, COUNT(*) AS n FROM crm_entries GROUP BY stage ORDER BY n DESC
  `).catch(() => ({ rows: [] }))
  return {
    totals: r.rows[0],
    firms_by_source: bySource.rows,
    firms_by_type: byType.rows,
    crm_by_stage: byStage.rows,
  }
}

// ─── tool impls (API-backed) ────────────────────────────────────────────
async function generateDms(args) {
  if (!ANKER_SESSION_COOKIE) {
    throw new Error(
      "generate_dms requires ANKER_SESSION_COOKIE in env (the Anker auth cookie). Without it the API rejects requests.",
    )
  }
  const r = await fetch(`${ANKER_API_BASE}/api/outreach/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": ANKER_SESSION_COOKIE },
    body: JSON.stringify(args),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error ?? `Anker API ${r.status}`)
  return data
}

async function classifyReply(args) {
  if (!ANKER_SESSION_COOKIE) {
    throw new Error("classify_reply requires ANKER_SESSION_COOKIE in env.")
  }
  const r = await fetch(`${ANKER_API_BASE}/api/outreach/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": ANKER_SESSION_COOKIE },
    body: JSON.stringify(args),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error ?? `Anker API ${r.status}`)
  return data
}

// ─── transport ──────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write("[anker-mcp] connected via stdio\n")
