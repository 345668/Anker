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

1. **New Project → Deploy from Docker Image** → `n8nio/n8n:latest` (or pin a version).
2. Add a **persistent Volume** mounted at `/home/node/.n8n` (holds the local encryption key
   material + any binary data). Small — 1GB is plenty.
3. Set the environment variables from [`.env.example`](./.env.example) (see that file for the
   full annotated list). The essentials:
   - `DB_TYPE=postgresdb` + the `DB_POSTGRESDB_*` vars pointing at the **direct** Neon host,
     with `DB_POSTGRESDB_SCHEMA=n8n` and `DB_POSTGRESDB_SSL_ENABLED=true`.
   - `N8N_ENCRYPTION_KEY` — a stable 32+ char secret. **Never change it** once set, or n8n
     can't decrypt stored credentials. Generate with `openssl rand -hex 24`.
   - `N8N_PORT=${{PORT}}` so n8n listens on the port Railway assigns.
   - `WEBHOOK_URL` / `N8N_HOST` = your Railway public domain.
4. Deploy. Open the Railway domain and create the **owner account** on first load (n8n's
   built-in user management — this is your login; no separate basic-auth needed on current n8n).

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

Then import [`workflows/connect-then-message.example.json`](./workflows/connect-then-message.example.json)
into n8n — an illustrative connect → wait → (if the connect sent) → message sequence that
exercises both endpoints. Set its `userId` / `senderId` / `targetUrl` to real values first.

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
