# Running ComfyUI for the Media Studio

Spec: `docs/architecture/49-media-studio-comfyui.md`. ComfyUI is GPL-3.0 and runs as its **own service**; Anker only calls it over HTTP through `services/comfy-gateway`. Never copy ComfyUI code into this repository.

## Pin and start (P0 spike used this)
```bash
git clone --depth 1 --branch v0.39.2 https://github.com/comfy-org/ComfyUI.git   # commit 3c1b7a17fdf239d35ce98cc777756f572d089795
python3 -m venv venv && ./venv/bin/pip install -r ComfyUI/requirements.txt
cd ComfyUI && ../venv/bin/python main.py --listen 127.0.0.1 --port 8188 \
  --disable-auto-launch --disable-all-custom-nodes --disable-api-nodes
```
Add `--cpu` where there is no GPU. Do not use `--listen 0.0.0.0` unless the host is on a private network that only the gateway can reach. Keep `--enable-manager` off. Custom nodes, if ever adopted, are pinned to a commit and reviewed first.

## In front of it
Run `services/comfy-gateway` on the same private network (see its README) and give Anker the gateway address and key:

| Variable (Anker, server only) | Meaning |
| --- | --- |
| `COMFY_BASE_URL` | gateway address, `https://` in production |
| `COMFY_API_KEY` | one of the gateway's `GATEWAY_API_KEYS` |
| platform flag `ai_studio_comfy` | master switch, off by default (SAIL, Flags) |

## Models
Weights live in a read-only store and are downloaded by hash from approved sources only. Every model a recipe uses needs an entry in `lib/ai/studio/comfy/licences.ts` that says it may be used commercially; the tests fail otherwise.
