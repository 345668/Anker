# Anker ComfyUI gateway

ComfyUI has **no authentication** and can execute any installed node, so it must never be reachable by the browser or the internet. This small service is the only way in (docs/architecture/49, section 5).

| What | How |
| --- | --- |
| Who may call | `X-API-Key` must match one of `GATEWAY_API_KEYS`; `/interrupt` and job cancel also need `X-Admin-Key` (`GATEWAY_ADMIN_KEY`) |
| Routes | `GET /health` (open), `/system_stats`, `/api/jobs/{id}`, `/history/{id}`, `/queue`, `/view`; `POST /prompt`, `/upload/image`; admin `POST /interrupt`, `/api/jobs/{id}/cancel`. Everything else, including `/userdata`, `/users`, `/settings`, `/models`, `/object_info`, `/free`, is 404 |
| Workflows | `POST /prompt` accepts only `prompt`, `prompt_id` (UUID) and `client_id`; every `class_type` must be in `ALLOWED_NODES`; values are numbers, booleans, bounded strings or links to another node; no `..`, absolute paths or URLs; at most 200 nodes |
| Files | `/view` takes plain file names in the `output` or `input` folder only |
| Limits | 1 MB workflow, 25 MB upload, `RATE_PER_MIN` (default 120) per key |
| Logs | One JSON line per request: method, path with ids removed, status, milliseconds. No bodies, no prompts |

Generate `ALLOWED_NODES` from the recipes in the repo so the gateway can never run a node no reviewed recipe uses:

```bash
npx tsx -e "import('./lib/ai/studio/comfy/recipes').then(m=>console.log(m.allowedNodeList().join(',')))"
```

Run beside a pinned ComfyUI on a private network (see `infra/comfy/README.md`). Test: `node --test services/comfy-gateway/server.test.mjs`.
