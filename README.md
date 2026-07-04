# Proteção Solatium — Monorepo

Plataforma white label de **proteção de celular** (roubo/furto) vendida por lojas
parceiras: vistoria antifraude → pagamento → certificado no WhatsApp.

> Contexto completo do produto, módulos e regras de negócio: [`CLAUDE.md`](./CLAUDE.md).
> Deploy em produção (Railway): [`DEPLOY.md`](./DEPLOY.md).

---

## Stack

- **Backend:** Node.js + NestJS + TypeScript, Prisma ORM
- **Banco:** PostgreSQL
- **Cache/filas:** Redis + BullMQ
- **Frontend:** React + Vite + Tailwind (2 apps)
- **Auth:** JWT + refresh token (roles: ADMIN, OPERADOR, LOJA_ADMIN, LOJA_VENDEDOR)
- **Deploy:** Railway (Docker)
- **Monorepo:** pnpm workspaces + Turborepo (`pnpm@9.15.0`, Node 20)

### Estrutura

```
apps/
  backend/     NestJS + Prisma (API + /health + /docs)
  app-loja/    React+Vite — usado pelo vendedor da loja (mobile-first/PWA)
  app-admin/   React+Vite — backoffice Solatium
packages/
  shared/      tipos TS compartilhados (consumido via source, sem build)
```

---

## Rodando localmente

Pré-requisitos: **Node 20+**, **Docker** (para Postgres/Redis) e **pnpm 9.15.0**
via Corepack.

```bash
# 1. Ativar o pnpm na versão do projeto
corepack enable
corepack use pnpm@9.15.0

# 2. Variáveis de ambiente
cp .env.example .env        # (Windows PowerShell: Copy-Item .env.example .env)
#    edite .env se necessário — os defaults já apontam para o Postgres/Redis locais

# 3. Subir Postgres + Redis locais
docker compose up -d

# 4. Instalar dependências do workspace
pnpm install

# 5. Aplicar as migrations (cria o schema no Postgres)
pnpm --filter @solatium/backend prisma:migrate:dev

# 6. Popular dados iniciais (usuário admin, planos de exemplo, etc.)
pnpm db:seed

# 7. Subir tudo em modo dev (backend + os 2 frontends via Turborepo)
pnpm dev
```

### Portas

| Serviço   | URL                          |
| --------- | ---------------------------- |
| Backend   | http://localhost:3000        |
| Health    | http://localhost:3000/health |
| Swagger   | http://localhost:3000/docs   |
| app-loja  | http://localhost:5173        |
| app-admin | http://localhost:5174        |

### Credenciais do seed

- **Usuário:** `admin@solatium.com.br`
- **Senha:** `Solatium@123`

> A senha efetiva é a definida em `apps/backend/prisma/seed.ts` — em caso de dúvida,
> confira lá.

---

## Scripts úteis (raiz)

| Comando            | O que faz                               |
| ------------------ | --------------------------------------- |
| `pnpm dev`         | sobe todos os apps em watch (Turborepo) |
| `pnpm build`       | builda todos os apps                    |
| `pnpm lint`        | lint em todo o monorepo                 |
| `pnpm typecheck`   | `tsc --noEmit` em todos os pacotes      |
| `pnpm test`        | testes de todos os pacotes              |
| `pnpm db:generate` | gera o Prisma Client                    |
| `pnpm db:migrate`  | `prisma migrate deploy` (produção)      |
| `pnpm db:seed`     | roda o seed do backend                  |
| `pnpm format`      | Prettier em todo o repo                 |

Filtrando um app específico, ex. backend:

```bash
pnpm --filter @solatium/backend <script>
```

---

## CI

O workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) roda em cada push
e pull request: instala deps, gera o Prisma Client, `typecheck`, `lint`, testes
unitários e testes e2e do backend contra um Postgres real (service container).

---

## Deploy

Passo a passo completo no Railway (Postgres, Redis, 3 serviços Docker, variáveis,
migrations, domínios): **[`DEPLOY.md`](./DEPLOY.md)**.
