# Anker doc worker: Node + LibreOffice (Word/ODF/RTF to PDF, PDF to Word), optional tectonic (LaTeX).
# Build:  docker build -t anker-doc-worker services/doc-worker
# Run:    docker run -p 8080:8080 -e DOC_WORKER_TOKEN=secret anker-doc-worker
#
# CJK: WenQuanYi Micro Hei (Chinese), VL Gothic (Japanese) and NanumGothic (Korean), small and enough for body text; add fonts-noto-cjk for fuller coverage.
# Fidelity depends on fonts. Carlito and Caladea are metric-compatible with Calibri and Cambria, Liberation with
# Arial, Times New Roman and Courier New, so a document set in those looks the same as it does in Word. Fonts that are
# not here fall back to the closest one and the line breaks can shift: add them to /usr/share/fonts to be exact.
#
# Writer (Word and PDF import), Calc (spreadsheets) and Impress (presentations). Drop calc and impress with
#   --build-arg LO_PACKAGES="libreoffice-writer"   to save about 300 MB if only Word tools are needed.
# LaTeX: tectonic is not in Debian bookworm. Build with --build-arg WITH_TECTONIC=1 to install a release binary.
FROM node:22-bookworm-slim

ARG LO_PACKAGES="libreoffice-writer libreoffice-calc libreoffice-impress"
ARG WITH_TECTONIC=0
ARG TECTONIC_VERSION=0.15.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core ${LO_PACKAGES} \
      fontconfig fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu-core \
      fonts-wqy-microhei fonts-vlgothic fonts-nanum \
      ca-certificates curl \
    && if [ "$WITH_TECTONIC" = "1" ]; then \
         arch="$(uname -m)"; \
         curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${arch}-unknown-linux-musl.tar.gz" | tar -xz -C /usr/local/bin tectonic; \
       fi \
    && fc-cache -f \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json server.mjs ./

ENV TECTONIC_CACHE_DIR=/var/cache/tectonic
RUN mkdir -p /var/cache/tectonic

ENV PORT=8080
EXPOSE 8080

# Non-root; every conversion works in its own directory under /tmp.
RUN useradd -m worker && chown -R worker /app /var/cache/tectonic
USER worker

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8080) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
