# n8n for Railway (and any Docker host).
#
# Thin wrapper over the official image so the deploy is reproducible and the
# version is pinned in git. Override at build time:  --build-arg N8N_VERSION=1.72.1
# All configuration is via environment variables (see .env.example / README.md);
# nothing app-specific is baked in here.
ARG N8N_VERSION=latest
FROM n8nio/n8n:${N8N_VERSION}

# n8n listens on N8N_PORT (default 5678). On Railway, set N8N_PORT=${{PORT}} so it
# binds the port Railway assigns; the platform's healthcheck hits /healthz.
EXPOSE 5678

# The base image already sets a correct ENTRYPOINT/CMD and runs as the non-root
# `node` user — do not override them.
