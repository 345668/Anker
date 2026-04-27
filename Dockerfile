# Anker production-style Dockerfile (used by docker-compose.yml `app` service).
# Multi-stage: deps → build → runner. Non-root user. ~200MB final image.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time stub envs so route collection passes; real values come from
# docker-compose at runtime.
ENV DATABASE_URL=postgresql://stub:stub@stubhost:5432/stub
ENV NEXT_PUBLIC_SUPABASE_URL=https://stub.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=stub
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
RUN corepack enable

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs

USER nextjs
EXPOSE 3000
CMD ["pnpm", "start"]
