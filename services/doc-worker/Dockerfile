# Anker doc/compute worker — Node + tectonic (LaTeX) + LibreOffice.
# Build:  docker build -t anker-doc-worker services/doc-worker
# Run:    docker run -p 8080:8080 -e DOC_WORKER_TOKEN=secret anker-doc-worker
FROM node:22-bookworm-slim

# tectonic compiles LaTeX → PDF and fetches packages on demand (cached in the volume
# below). libreoffice-core + writer cover docx/odt → pdf/docx conversion. fontconfig +
# a couple of font families keep typeset output looking right.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tectonic \
      libreoffice-core libreoffice-writer libreoffice-calc \
      fontconfig fonts-liberation fonts-dejavu \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json server.mjs ./

# tectonic caches downloaded LaTeX packages here; mount a volume to persist across runs.
ENV TECTONIC_CACHE_DIR=/var/cache/tectonic
RUN mkdir -p /var/cache/tectonic

ENV PORT=8080
EXPOSE 8080

# Non-root for safety; the temp dirs the server uses live under /tmp.
RUN useradd -m worker && chown -R worker /app /var/cache/tectonic
USER worker

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8080) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
