# Anker MCP server

A local MCP (Model Context Protocol) server that exposes Anker's
fundraising loop — investor discovery, matchmaking, CRM, and the
Layer-2 / Layer-4 outreach AI — to any MCP-compatible client.

Designed to be paired with a **local model** (Ollama) per the
8fundraising playbook's 4-layer structure, so you don't have to
forward your CRM and outreach data to ChatGPT or Perplexity.

## Install

```bash
cd mcp-server
pnpm install        # or: npm install
```

## Configure

The server is stdio-transport. Add it to your MCP client config.

### Claude Code (`~/.config/claude/mcp.json` or project `.mcp.json`)

```json
{
  "mcpServers": {
    "anker": {
      "command": "node",
      "args": ["/absolute/path/to/Anker/mcp-server/bin/anker-mcp.mjs"],
      "env": {
        "DATABASE_URL": "postgresql://anker:anker@localhost:5432/anker",
        "ANKER_API_BASE": "http://localhost:3000",
        "ANKER_SESSION_COOKIE": "next-auth.session-token=…"
      }
    }
  }
}
```

`ANKER_SESSION_COOKIE` is only required for the `generate_dms` and
`classify_reply` tools (they call the Next.js API to honour auth +
rate-limit policy). DB-only tools work without it.

### Cursor / Continue / Aider

Same shape — stdio command + env. Refer to your client's MCP docs.

## Tools

| Tool                       | What it does                                            |
| -------------------------- | ------------------------------------------------------- |
| `search_investors`         | Free-text search firms / investors                      |
| `list_recent_sessions`     | Last N matchmaking runs (LP or founder)                 |
| `get_session`              | Fetch a single matchmaking session                      |
| `list_crm_entries`         | Read crm_entries by stage / source / search             |
| `add_to_crm`               | Add a row to the queued column                          |
| `move_crm_stage`           | Transition a CRM entry's stage                          |
| `generate_dms`             | Layer 2: 4-step DM sequence (drafts only, no send)      |
| `classify_reply`           | Layer 4: classify + draft response (≤320 chars)         |
| `list_outreach_messages`   | Read outreach_messages by entry id or status            |
| `get_database_stats`       | Counts of firms / investors / crm_entries by source     |

## Local-model setup (Ollama)

The Anker app already has a multi-provider AI abstraction
(`lib/ai/provider.ts`) that uses Ollama by default when the
`OLLAMA_HOST` and `OLLAMA_MODEL` env vars are set on the Next.js
server, and falls back to Anthropic only when explicitly configured.

Recommended local model: `gemma2:2b` (1.6 GB, runs on a M-series
laptop without breaking a sweat). Pull once:

```bash
ollama pull gemma2:2b
```

Set on the Next.js server:

```bash
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma2:2b
```

The MCP server itself does NOT call any model directly — it routes
all generative work through the Anker Next.js API, which already
selects the local model when configured.

## Hard rules (from the 8fundraising playbook)

The MCP server enforces (or relays to the API) these rules:

- **Never auto-send.** All outreach goes through the human approval
  gate in `/dashboard/shortlist`. The MCP `generate_dms` tool
  returns drafts; it cannot transition a message to `sent`.
- **25 connection requests / day, 50 follow-ups / day, weekday-only.**
  Enforced by `lib/outreach/rate-limit.ts` on the Next.js side.
- **One hook per message.** Day 0 references one specific recent
  post; day 7 must use a different angle.
- **No em dashes.** Sanitiser strips them automatically.
- **Day 0 ≤ 280 chars; replies ≤ 320 chars.** Truncated at the word
  boundary if the model overshoots.

## Worked example: drive the loop from Claude Code

Place a `CLAUDE.md` in your repo root with your founder context
(see `mcp-server/CLAUDE.example.md`). Then in Claude Code:

```
> Find me 50 seed-stage VCs in Europe doing fintech, score them,
  add the top 30 to my CRM, and generate the day-0 DMs.
```

The model will call:
1. `search_investors(query="seed Europe fintech")` → see what's loaded
2. `list_recent_sessions(kind="lp")` → check for an existing run
3. `add_to_crm(...)` per entry → queued column
4. `generate_dms(crmEntryIds=[...], founder={...})` → drafts ready
5. You open `/dashboard/shortlist`, review, approve, copy to LinkedIn.

No data leaves your machine. No ChatGPT / Perplexity round-trip.
