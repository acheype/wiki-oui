# syntax=docker/dockerfile:1

FROM node:22-slim AS base
# Prisma's engines need libssl on Debian slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# `prisma migrate deploy` and the seed script (docker-entrypoint.sh) run as
# processes separate from the Next.js server, so standalone output (which
# only traces what the server itself imports) never bundles them. Resolving
# their own full dependency tree — engines, debug, esbuild, etc. — via a
# real, isolated `pnpm install` avoids hand-picking transitive deps.
FROM base AS tools
WORKDIR /tools
COPY docker/deploy-tools/package.json pnpm-workspace.yaml ./
RUN pnpm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build
RUN mkdir -p .next/standalone/.next \
  && cp -r .next/static .next/standalone/.next/static \
  && cp -r public .next/standalone/public \
  && cp -r prisma .next/standalone/prisma \
  && cp -r lib .next/standalone/lib \
  && cp wiki.config.ts prisma.config.ts .next/standalone/
COPY --from=tools /tools/node_modules/. .next/standalone/node_modules/

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone/. ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && mkdir -p files
# Uploaded files (ADR 0012): instance data, must survive redeploys — mount a
# persistent volume here.
VOLUME ["/app/files"]
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
