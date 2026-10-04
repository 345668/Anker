# Anker doc/compute worker

The high-fidelity rendering sidecar for §C of the tooling expansion. It runs the local
binaries that **cannot** run on Vercel serverless, and the Anker app calls it over HTTP:

- **tectonic** — LaTeX → PDF (white-paper-class typesetting)
- **LibreOffice** — Word/ODF/RTF → PDF, and PDF → Word (docx). See `docs/architecture/40-exact-layout-conversion.md`

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

Auth: requests must send `Authorization: Bearer <token>`. The worker refuses to start without `DOC_WORKER_TOKEN` (set `DOC_WORKER_ALLOW_NO_AUTH=1` for local development only).

Supported conversions: `docx doc odt rtf txt` → `pdf`; `pdf` → `docx`. Errors: 400 unsupported combination, 401, 413 too large, 422 the converter could not read it, 429 busy, 504 timed out.

## Run

```bash
# Local (needs tectonic + libreoffice on PATH):
node server.mjs

# Container (bundles both binaries):
docker build -t anker-doc-worker services/doc-worker
docker run -p 8080:8080 -e DOC_WORKER_TOKEN=change-me anker-doc-worker
# Tests (no LibreOffice needed): node --test services/doc-worker/server.test.mjs
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
| `DOC_WORKER_MAX_BODY_BYTES` | `50331648` | Max request body (48 MB; a 25 MB file is about 34 MB as base64) |
| `DOC_WORKER_CONCURRENCY` | `2` | Conversions at once (each LibreOffice needs about 400 MB) |
| `DOC_WORKER_MAX_QUEUE` | `8` | Waiting requests before a 429 |
| `DOC_WORKER_RENDER_TIMEOUT_MS` | `90000` | Per-render kill timeout |
| `TECTONIC_CACHE_DIR` | `/var/cache/tectonic` | LaTeX package cache |

## Fonts and fidelity

The image carries Carlito, Caladea, Liberation and DejaVu. Carlito and Caladea are metric-compatible with Calibri and Cambria, Liberation with Arial, Times New Roman and Courier New, so documents set in those paginate exactly as in Word. Any other font is replaced by the closest installed one and line breaks can move: copy the font files into `/usr/share/fonts` in the image to be exact. No CJK font is installed (add `fonts-noto-cjk`).

## Resources and network

About 1 GB of memory per container is comfortable (LibreOffice peaks near 400 MB per conversion). Give the container no route to your internal services and no secrets beyond `DOC_WORKER_TOKEN`: a document can ask LibreOffice to fetch a URL. The image is non-root.

## Build options

`--build-arg LO_PACKAGES="libreoffice-writer libreoffice-calc libreoffice-impress"` adds spreadsheets and presentations (about 300 MB). `--build-arg WITH_TECTONIC=1` installs the LaTeX engine (not packaged in Debian bookworm, so it is downloaded as a release binary).
