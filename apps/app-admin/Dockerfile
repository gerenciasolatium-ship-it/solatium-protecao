# =========================================================================
# Dockerfile do app-admin (React + Vite) — Proteção Solatium
# Multi-stage: builder compila o bundle Vite; runtime serve estático via nginx.
# Contexto de build = RAIZ do monorepo (ver DEPLOY.md).
#
# IMPORTANTE (Vite): a URL da API é injetada em BUILD TIME.
# Passe VITE_API_URL como build arg (no Railway: Variables do serviço já viram
# build args). Ex.: VITE_API_URL=https://backend-xxxx.up.railway.app
# =========================================================================

# ---------- Estágio 1: build ----------
FROM node:20-slim AS builder
WORKDIR /app

# API consumida pelo frontend (injetada no bundle em tempo de build).
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Manifestos primeiro (cache de camadas).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/app-admin/package.json apps/app-admin/package.json
COPY packages/shared/package.json packages/shared/package.json

# Sem lockfile commitado ainda → --no-frozen-lockfile.
RUN pnpm install --no-frozen-lockfile

# Código.
COPY apps/app-admin apps/app-admin
COPY packages/shared packages/shared

# Compila o pacote shared antes (o Vite resolve @solatium/shared por ele).
RUN pnpm --filter @solatium/shared build
# Build (gera apps/app-admin/dist).
RUN pnpm --filter @solatium/app-admin build

# ---------- Estágio 2: runtime (nginx) ----------
FROM nginx:alpine AS runner

# Config SPA (try_files → index.html).
COPY apps/app-admin/nginx.conf /etc/nginx/conf.d/default.conf

# Bundle estático.
COPY --from=builder /app/apps/app-admin/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
