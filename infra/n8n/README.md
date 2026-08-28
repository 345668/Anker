# n8n orchestration — Railway + Neon

Phase 1.5 of the LinkedIn outreach engine (`docs/scope-linkedin-outreach.md`). n8n is the
**brain**: it owns timing + sequence branching and calls back into Anker's orchestration API
to enqueue actions and read their results. n8n **never touches LinkedIn** — only Anker's
extension does, and only for human-approved actions.

```
n8n workflow ──POST /api/orchestration/actions──▶ Anker (li_action_queue, approval gate)
     ▲                                                     │
     └──GET /api/orchestration/actions (branch on state)───┘   extension executes 'queued'
```

## Why Railway + Neon

- **Railway** runs the long-lived n8n server for ~$5/mo (Hobby) — least ops for the floor price.
- **Neon** (the Postgres you already run) hosts n8n's own tables in a dedicated **`n8n` schema**,
  so there's no second database bill and zero collision with Anker's `public` schema.

---

## 1. Prepare Neon

n8n keeps long-lived connections and runs its own migrations — use the **direct (unpooled)**
Neon connection, not the pooler.

1. In the Neon console, copy the **direct** connection string (host *without* `-pooler`).
2. Create the schema n8n will own (keeps its ~30 tables out of Anker's `public`):
   ```sql
   CREATE SCHEMA IF NOT EXISTS n8n;
   ```
   (Optional: create a dedicated role scoped to that schema. The app DB role also works.)

## 2. Deploy n8n on Railway

This folder is deployable as-is — [`Dockerfile`](./Dockerfile) + [`railway.json`](./railway.json)
(Dockerfile build, `/healthz` healthcheck, restart-on-failure). Two ways in:

**A — Railway CLI (from this folder):**
```bash
cd infra/n8n
railway login
railway init            # or: railway link   (to an existing project)
railway up              # builds the Dockerfile and deploys
```

**B — Dashboard:** New Project → Deploy from GitHub repo → set the **Root Directory** to
`infra/n8n` (so Railway picks up this `Dockerfile` + `railway.json`).

Then, on the service:
1. Add a **persistent Volume** mounted at `/home/node/.n8n` (encryption-key material + binary
   data). 1GB is plenty.
2. Set the environment variables from [`.env.example`](./.env.example) — the essentials:
   - `DB_TYPE=postgresdb` + the `DB_POSTGRESDB_*` vars pointing at the **direct** Neon host,
     with `DB_POSTGRESDB_SCHEMA=n8n` and `DB_POSTGRESDB_SSL_ENABLED=true`.
   - `N8N_ENCRYPTION_KEY` — a stable 32+ char secret. **Never change it** once set, or n8n
     can't decrypt stored credentials. Generate with `openssl rand -hex 24`.
   - `N8N_PORT=${{PORT}}` so n8n binds the port Railway assigns (the `/healthz` check uses it).
   - `WEBHOOK_URL` / `N8N_HOST` = your Railway public domain.
3. Redeploy. Open the Railway domain and create the **owner account** on first load (n8n's
   built-in user management — this is your login; no separate basic-auth needed on current n8n).

> **Local parity:** `cp .env.example .env && docker compose up -d` runs the same image against
> the same Neon `n8n` schema at http://localhost:5678 (see [`docker-compose.yml`](./docker-compose.yml)).

## 3. Wire Anker ↔ n8n

**On Anker (Vercel):** set one env var — the service key n8n will present.
```
ORCHESTRATION_API_KEY=<openssl rand -hex 32>
```
The orchestration endpoints **fail closed** when this is unset (503), so nothing is exposed
until you deliberately set it.

**On n8n:** store the same key + Anker's base URL as an **n8n credential** (Header Auth):
- Name: `Anker Orchestration`
- Header name: `Authorization`  ·  Header value: `Bearer <ORCHESTRATION_API_KEY>`
- Keep the base URL (`https://www.an-ker.de`) in a workflow variable or the HTTP node.

## 4. Smoke-test the seam

From n8n (or curl), confirm auth works:
```bash
curl -s https://www.an-ker.de/api/orchestration/health \
  -H "Authorization: Bearer $ORCHESTRATION_API_KEY"
# → {"ok":true,"service":"anker-orchestration","ts":"…"}
```

Then import the workflows from [`workflows/`](./workflows/) (n8n → Workflows → Import from File):

- **`sequencer-tick.example.json`** — the autonomous heartbeat. A Schedule trigger (every 30 min)
  that POSTs `/api/orchestration/sequence/tick` to advance every active campaign for a user. This
  is what actually runs your campaigns — set the `userId`, attach the credential, and **activate** it.
- **`connect-then-message.example.json`** — an illustrative connect → wait → (if sent) → message
  sequence that exercises the enqueue + read endpoints directly. Good for understanding the API.

Set each workflow's `userId` (and `senderId` / `targetUrl` where present) to real values first.

---

## The orchestration API (what n8n calls)

Base: `https://www.an-ker.de/api/orchestration` · Auth: `Authorization: Bearer $ORCHESTRATION_API_KEY`

| Method / path | Purpose |
|---|---|
| `GET  /health` | Authed connectivity check. |
| `POST /actions` | Enqueue an action for a user. Body: `{ userId, actionType, targetUrl, targetName?, senderId?, campaignId?, memberId?, payload?, scheduledFor?, autoApprove? }`. Defaults to `pending_approval`; `autoApprove:true` is the explicit full-auto opt-in. |
| `GET  /actions?userId=&status=&campaignId=&senderId=&limit=` | Read action state so a workflow can branch (e.g. wait until the connect is `done`, or react to `failed`). |

**The approval gate still holds.** Even from n8n, an action defaults to `pending_approval` and
is invisible to the extension until a human approves it (or the campaign explicitly runs
full-auto via `autoApprove`). n8n schedules and sequences; it does not bypass approval.

## Notes

- **Acceptance / reply detection** (did the invite get accepted? did they reply?) is **Phase 3**
  (Unibox + network sync). Until then, n8n can branch on send outcome (`done`/`failed`) but not
  on the prospect's response — the example workflow is written accordingly.
- Prefer pinning the n8n image to a version tag over `:latest` for reproducible deploys.
- Back up the `N8N_ENCRYPTION_KEY` somewhere safe (a password manager). Losing it means
  re-entering every credential.
