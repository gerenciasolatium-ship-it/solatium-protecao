# Deploy no Railway — Proteção Solatium

Guia passo a passo para subir o monorepo (backend + 2 frontends + Postgres + Redis)
no [Railway](https://railway.app) a partir do zero.

> Monorepo: `apps/backend` (NestJS), `apps/app-loja` e `apps/app-admin` (React+Vite).
> Cada serviço é buildado pelo seu próprio `Dockerfile`.

---

## 0. Pré-requisitos

- Conta no [Railway](https://railway.app) (pode logar com o GitHub).
- Repositório já no GitHub e conectado ao Railway:
  **`github.com/gerenciasolatium-ship-it/solatium-protecao`**.
- (Recomendado) Commitar o `pnpm-lock.yaml` antes do primeiro deploy — ver seção 9.

---

## 1. Criar o projeto no Railway a partir do GitHub

1. No dashboard do Railway → **New Project**.
2. Escolha **Deploy from GitHub repo**.
3. Autorize o Railway a acessar sua conta/organização do GitHub, se pedido.
4. Selecione o repositório **`gerenciasolatium-ship-it/solatium-protecao`**.
5. O Railway pode criar um primeiro serviço automaticamente — tudo bem, vamos
   ajustar (ou deletar e recriar) os serviços nos próximos passos.

---

## 2. Adicionar os plugins de banco (PostgreSQL e Redis)

Dentro do projeto (canvas do Railway):

1. Clique em **New → Database → Add PostgreSQL**.
2. Clique em **New → Database → Add Redis**.

O Railway cria automaticamente as variáveis de conexão:

- Postgres expõe **`DATABASE_URL`** (e `PGHOST`, `PGDATABASE`, etc.).
- Redis expõe **`REDIS_URL`**.

Você vai **referenciar** essas variáveis no serviço backend (passo 4) usando a
sintaxe de referência do Railway, por exemplo:

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
REDIS_URL    = ${{ Redis.REDIS_URL }}
```

> Os nomes `Postgres` / `Redis` são os nomes dos serviços de banco no seu projeto —
> confira e ajuste se estiverem diferentes.

---

## 3. Criar os 3 serviços de aplicação

Você precisa de **3 serviços**, todos apontando para o **mesmo repositório**, cada um
usando um Dockerfile diferente. Para cada serviço: **New → GitHub Repo → selecione o
repo** (ou use o serviço já criado no passo 1 para o backend).

Para cada serviço, entre em **Settings** e configure:

### Serviço `backend`

- **Settings → Build**
  - **Builder:** `Dockerfile`
  - **Root Directory:** `/` (raiz do repo — o Dockerfile faz `COPY` do monorepo inteiro)
  - **Dockerfile Path:** `apps/backend/Dockerfile`
- **Settings → Deploy → Healthcheck Path:** `/health`
- Já existe `apps/backend/railway.json` com esses valores; se o Railway respeitar o
  arquivo, você só confirma. Caso contrário, preencha manualmente como acima.

### Serviço `app-loja`

- **Builder:** `Dockerfile`
- **Root Directory:** `/`
- **Dockerfile Path:** `apps/app-loja/Dockerfile`

### Serviço `app-admin`

- **Builder:** `Dockerfile`
- **Root Directory:** `/`
- **Dockerfile Path:** `apps/app-admin/Dockerfile`

> **Sobre Root Directory:** como cada Dockerfile faz `COPY package.json`,
> `pnpm-workspace.yaml`, `apps/...` e `packages/shared`, o contexto de build precisa
> ser a **raiz do monorepo**. Por isso Root Directory = `/` e o caminho do Dockerfile
> é relativo à raiz (`apps/backend/Dockerfile`). **Não** coloque Root Directory =
> `apps/backend`, senão o `COPY` da raiz falha.

---

## 4. Variáveis de ambiente por serviço

Configure em cada serviço → **Variables**. Baseado na seção 7 do `CLAUDE.md` e no
`.env.example`.

### `backend`

| Variável             | Valor                            | Observação                                                           |
| -------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`           | `production`                     |                                                                      |
| `PORT`               | `3000`                           | (o Railway também injeta `PORT`; o app escuta em `process.env.PORT`) |
| `DATABASE_URL`       | `${{ Postgres.DATABASE_URL }}`   | referência ao plugin Postgres                                        |
| `REDIS_URL`          | `${{ Redis.REDIS_URL }}`         | referência ao plugin Redis                                           |
| `JWT_SECRET`         | _(segredo forte)_                | gere com `openssl rand -hex 32`                                      |
| `JWT_REFRESH_SECRET` | _(outro segredo forte)_          | diferente do de cima                                                 |
| `JWT_ACCESS_TTL`     | `15m`                            | opcional (default no código)                                         |
| `JWT_REFRESH_TTL`    | `7d`                             | opcional                                                             |
| `APP_LOJA_URL`       | _(domínio público do app-loja)_  | preencher no passo 7 (CORS)                                          |
| `APP_ADMIN_URL`      | _(domínio público do app-admin)_ | preencher no passo 7 (CORS)                                          |
| `SWAGGER_USER`       | `solatium`                       | protege `/docs`                                                      |
| `SWAGGER_PASSWORD`   | _(senha forte)_                  |                                                                      |

Integrações — deixar **em branco** por enquanto (entram em S2/S3):

| Variável                                                             | Fase          |
| -------------------------------------------------------------------- | ------------- |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`                               | S3            |
| `DIGISAC_TOKEN`, `DIGISAC_URL`                                       | S3            |
| `RESEND_API_KEY`                                                     | S3            |
| `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ENDPOINT`         | S2            |
| `SEGURADORA_NOME`, `SEGURADORA_APOLICE`, `SEGURADORA_PROCESSO_SUSEP` | após contrato |

### `app-loja`

| Variável       | Valor                          | Observação                      |
| -------------- | ------------------------------ | ------------------------------- |
| `VITE_API_URL` | _(domínio público do backend)_ | **build arg** — ver nota abaixo |

### `app-admin`

| Variável       | Valor                          | Observação                      |
| -------------- | ------------------------------ | ------------------------------- |
| `VITE_API_URL` | _(domínio público do backend)_ | **build arg** — ver nota abaixo |

> **Atenção (Vite):** `VITE_API_URL` é lido em **tempo de build** e embutido no bundle.
> No Railway, as Variables do serviço são passadas como build args ao Docker, então
> basta definir `VITE_API_URL`. **Se você alterar `VITE_API_URL` depois, precisa
> forçar um novo build/redeploy** do frontend para o valor novo entrar no bundle.

---

## 5. Primeiro deploy e migrations do Prisma

- Faça o deploy dos serviços (o Railway builda ao salvar/commitar).
- O **Dockerfile do backend já roda `prisma migrate deploy` no start** (comando
  `CMD`), então as migrations são aplicadas automaticamente a cada deploy, assim que
  o `DATABASE_URL` estiver configurado.
- Acompanhe em **Deployments → Logs** do serviço backend.

### Rodar o seed manualmente (uma vez)

O seed **não** roda sozinho. Rode-o após a primeira migration bem-sucedida:

**Opção A — Railway CLI (na sua máquina):**

```bash
railway login
railway link           # selecione o projeto e o serviço backend
railway run pnpm --filter @solatium/backend prisma:seed
```

**Opção B — Shell do serviço (no dashboard):**
No serviço backend → aba de terminal/shell → execute:

```bash
pnpm --filter @solatium/backend prisma:seed
```

---

## 6. (Opcional) Ordem de subida

Suba na ordem: **Postgres/Redis → backend → frontends**. Assim, quando os frontends
buildarem, você já terá o domínio público do backend para preencher `VITE_API_URL`.

---

## 7. Gerar domínios públicos e ajustar URLs

Para **cada** um dos 3 serviços:

1. **Settings → Networking → Generate Domain** (gera algo como
   `backend-production-xxxx.up.railway.app`).
2. Anote os 3 domínios.

Depois, volte às Variables e preencha os cruzamentos:

- `backend` → `APP_LOJA_URL` = domínio do app-loja; `APP_ADMIN_URL` = domínio do
  app-admin (necessário para o **CORS** aceitar os frontends).
- `app-loja` e `app-admin` → `VITE_API_URL` = domínio do backend.

> Ao mudar `VITE_API_URL`, **redeploy** os frontends (o valor entra no bundle em build).
> Ao mudar `APP_LOJA_URL`/`APP_ADMIN_URL`, o backend reinicia e passa a aceitar o CORS.

---

## 8. Verificação final

- **Backend health:** abra `https://<dominio-backend>/health` → deve responder 200.
- **Swagger:** abra `https://<dominio-backend>/docs` (login `SWAGGER_USER` /
  `SWAGGER_PASSWORD`).
- **app-loja / app-admin:** abra os domínios e confirme que carregam e conseguem
  falar com a API (verifique o Network do navegador apontando para `VITE_API_URL`).

---

## 9. Observação importante — lockfile

O repositório **ainda não tem `pnpm-lock.yaml` commitado**. Sem lockfile os builds
usam `--no-frozen-lockfile` (funciona, mas não é 100% reproduzível). Para builds
reproduzíveis e mais rápidos:

```bash
# na raiz do repo, uma vez:
corepack use pnpm@9.15.0
pnpm install          # gera o pnpm-lock.yaml
git add pnpm-lock.yaml
git commit -m "chore: adiciona pnpm-lock.yaml para builds reproduzíveis"
git push
```

Depois disso você pode trocar `--no-frozen-lockfile` por `--frozen-lockfile` nos
Dockerfiles e no CI.

---

## Referências

- Contexto do produto e variáveis: [`CLAUDE.md`](./CLAUDE.md)
- Visão geral e execução local: [`README.md`](./README.md)
