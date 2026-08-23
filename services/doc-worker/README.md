# Anker doc/compute worker

The high-fidelity rendering sidecar for §C of the tooling expansion. It runs the local
binaries that **cannot** run on Vercel serverless, and the Anker app calls it over HTTP:

- **tectonic** — LaTeX → PDF (white-paper-class typesetting)
- **LibreOffice** — docx/odt/xlsx → PDF or docx

Everything else in Anker (branded `docx` via the `docx` lib, PDF via `pdf-lib`) is
serverless-native and needs no worker. Stand this up **only** when you need LaTeX-fidelity
or format conversions the serverless path can't do.

## Contract

Matches `lib/docworker/client.ts` in the app.

```
POST /render
  { "engine": "latex" | "libreoffice",
    "source":  string,          // LaTeX source (latex), or base64 of an input doc (libreoffice)
    "filename"?: string,
    "format"?: "pdf" | "docx" }  // libreoffice target; default pdf
  → 200  the rendered bytes  (Content-Type: application/pdf or the docx mime)
  → 4xx/5xx  { "error": string }

GET /health → { "ok": true }
```

Auth: if `DOC_WORKER_TOKEN` is set, requests must send `Authorization: Bearer <token>`.

## Run

```bash
# Local (needs tectonic + libreoffice on PATH):
node server.mjs

# Container (bundles both binaries):
docker build -t anker-doc-worker services/doc-worker
docker run -p 8080:8080 -e DOC_WORKER_TOKEN=change-me anker-doc-worker
```

Deploy the container anywhere that runs a long-lived process — Fly.io, Railway, Render, a
Cloud Run service, or an ECS task. Persist `/var/cache/tectonic` (a volume) so tectonic
doesn't re-download LaTeX packages on every cold start.

## Wire it to the app

Set on the Anker deployment (Vercel):

```
DOC_WORKER_URL=https://doc-worker.your-host.example
DOC_WORKER_TOKEN=change-me          # must match the worker's token
```

That's the only change — `lib/docworker/client.ts` picks it up and the `render_document_pro`
agent tool goes live. With no `DOC_WORKER_URL`, the tool stays inert and the agent falls
back to the serverless `generate_document` (docx) path.

## Smoke test

```bash
curl -s -X POST http://localhost:8080/render \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer change-me' \
  -d '{"engine":"latex","source":"\\documentclass{article}\\begin{document}Hello Anker\\end{document}"}' \
  --output out.pdf && file out.pdf
```

## Env

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `DOC_WORKER_TOKEN` | *(none)* | Bearer token; when set, required on `/render` |
| `DOC_WORKER_MAX_BODY_BYTES` | `8388608` | Max request body (8 MB) |
| `DOC_WORKER_RENDER_TIMEOUT_MS` | `90000` | Per-render kill timeout |
| `TECTONIC_CACHE_DIR` | `/var/cache/tectonic` | LaTeX package cache |
