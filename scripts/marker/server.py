"""
Tiny FastAPI server around Marker.

POST /convert
  multipart: file=<pdf>
Response: { ok, markdown, pages, durationMs }

Uses Marker's PdfConverter — first request is slow (model load), all
subsequent requests reuse the loaded models.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse


_converter = None


def _load_converter():
    """Marker import is heavy; defer until first request."""
    global _converter
    if _converter is not None:
        return _converter
    from marker.converters.pdf import PdfConverter  # type: ignore
    from marker.models import create_model_dict      # type: ignore
    _converter = PdfConverter(artifact_dict=create_model_dict())
    return _converter


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm-up at boot so the first user-facing call isn't a 30 s wait.
    try:
        _load_converter()
    except Exception as e:
        # Don't crash the container — let /healthz report the issue.
        print(f"[marker] warm-up failed: {e}")
    yield


app = FastAPI(lifespan=lifespan, title="Anker Marker sidecar")


@app.get("/healthz")
def healthz():
    return {"ok": True, "loaded": _converter is not None}


@app.post("/convert")
async def convert(file: UploadFile = File(...)) -> JSONResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDFs are supported.")
    blob = await file.read()
    if len(blob) > 30 * 1024 * 1024:
        raise HTTPException(413, "File too large (>30 MB).")
    started = time.time()
    converter = _load_converter()

    # Marker reads from a file path; write to a temp file.
    tmp = Path(f"/tmp/{int(time.time() * 1000)}-{file.filename}")
    try:
        tmp.write_bytes(blob)
        rendered = converter(str(tmp))
        # rendered is a `Rendered` object with `.markdown`, `.metadata`
        markdown = getattr(rendered, "markdown", str(rendered))
        meta = getattr(rendered, "metadata", {}) or {}
        page_count = int(meta.get("page_stats", {}).get("page_count") or 0) \
            or int(meta.get("page_count") or 0) \
            or markdown.count("\n\n# ") + 1
        return JSONResponse({
            "ok": True,
            "markdown": markdown,
            "pages": page_count,
            "durationMs": int((time.time() - started) * 1000),
            "filename": file.filename,
        })
    finally:
        try:
            tmp.unlink()
        except Exception:
            pass
