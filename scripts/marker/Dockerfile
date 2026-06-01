# Marker PDF → Markdown sidecar service.
#
# Marker (https://github.com/VikParuchuri/marker) is a research-grade
# Python tool that converts PDFs to Markdown using small CV models.
# Quality on image-heavy decks is dramatically better than pdf-parse.
#
# This image wraps it in a tiny FastAPI server so Anker can POST a PDF
# and get back Markdown.
#
# First build will take a few minutes (downloads model weights).
# Cached models live in /root/.cache (see compose volume).

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# System deps Marker needs (poppler for PDF rendering).
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --upgrade pip && \
    pip install \
        "marker-pdf>=1.2.0,<2.0.0" \
        "fastapi>=0.115.0" \
        "uvicorn[standard]>=0.32.0" \
        "python-multipart>=0.0.20"

COPY server.py /app/server.py

EXPOSE 8001

# Single worker — Marker is memory-heavy.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
