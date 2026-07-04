# =========================================================================
# Dockerfile do backend (NestJS + Prisma) — Proteção Solatium
# Multi-stage. Contexto de build = RAIZ do monorepo.
# No Railway configure:  Root Directory = (raiz)  e  Dockerfile Path = apps/backend/Dockerfile
# (ou Root Directory = apps/backend, ver DEPLOY.md).
#
# Usamos node:20-slim (Debian) em vez de alpine porque argon2 e os engines
# do Prisma exigem glibc / libssl — evita dores de cabeça com musl.
# =========================================================================

# ---------- Estágio 1: build ----------
FROM node:20-slim AS builder
WORKDIR /app

# libssl é exigida pelos engines do Prisma.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Habilita o pnpm na versão fixada do monorepo.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# 1) Copia apenas os manifestos primeiro (melhor cache de camadas).
#    pnpm-lock.yaml é copiado se existir (o "*" evita erro quando ainda não há lockfile).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json

# 1b) O schema do Prisma precisa existir ANTES do install, porque o postinstall
#     do backend roda `prisma generate` (que exige prisma/schema.prisma).
COPY apps/backend/prisma apps/backend/prisma

# 2) Instala dependências do workspace.
#    Como ainda pode não haver lockfile commitado, usamos --no-frozen-lockfile.
#    (Depois de commitar o pnpm-lock.yaml, pode trocar por --frozen-lockfile.)
RUN pnpm install --no-frozen-lockfile

# 3) Copia o restante do código necessário ao build do backend.
COPY apps/backend apps/backend
COPY packages/shared packages/shared

# 4) Gera o Prisma Client e compila o Nest (dist/).
RUN pnpm --filter @solatium/backend prisma:generate
RUN pnpm --filter @solatium/backend build

# ---------- Estágio 2: runtime ----------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copia o app já buildado do estágio anterior (inclui node_modules com Prisma Client gerado).
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/backend

EXPOSE 3000

# No start: aplica migrations pendentes e sobe a API.
# Usa `pnpm exec` para resolver o binário do Prisma pela estrutura de symlinks do pnpm
# (caminho fixo em node_modules/prisma/build/index.js não existe no layout do pnpm).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
