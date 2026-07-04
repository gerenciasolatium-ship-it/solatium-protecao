# PROMPT — SPRINT 1 (colar no Claude Code)

> Pré-requisito: pasta do repositório `solatium-protecao` clonada, com o arquivo
> `CLAUDE.md` do projeto na raiz. Abra o Claude Code dentro dessa pasta e cole o
> prompt abaixo inteiro.

---

Leia o arquivo CLAUDE.md na raiz deste repositório antes de qualquer coisa — ele é a
especificação completa do projeto Proteção Solatium. Sua missão nesta sessão é executar a
SPRINT 1 completa: fundação do monorepo, autenticação, cadastros base (módulo M1) e
preparação para deploy no Railway.

## 1. Estrutura do monorepo

Crie um monorepo com pnpm workspaces + Turborepo:

```
solatium-protecao/
├── CLAUDE.md
├── package.json / pnpm-workspace.yaml / turbo.json
├── apps/
│   ├── backend/        → NestJS + TypeScript + Prisma
│   ├── app-loja/       → React + Vite + Tailwind (PWA mobile-first, vendedor da loja)
│   └── app-admin/      → React + Vite + Tailwind (backoffice Solatium)
├── packages/
│   └── shared/         → tipos TypeScript compartilhados (DTOs, enums de status)
└── .github/workflows/ci.yml  → lint + typecheck + testes em todo push
```

## 2. Backend (apps/backend)

- NestJS com estrutura modular: `auth`, `lojas`, `vendedores`, `clientes`, `aparelhos`,
  `planos`, `usuarios`, `health`
- Prisma + PostgreSQL. Crie o schema COMPLETO já nesta sprint (todas as tabelas da seção 4
  do CLAUDE.md, incluindo as que só serão usadas nas próximas sprints — vistorias,
  certificados, sinistros, vouchers, etc.) para não quebrar migrations depois. Implemente
  os CRUDs apenas dos cadastros base (M1).
- Auth: JWT + refresh token. Roles: ADMIN, OPERADOR, LOJA_ADMIN, LOJA_VENDEDOR.
  Guards por role em todas as rotas. Senha com argon2.
- Regras já nesta sprint:
  - IMEI: validação de formato + dígito verificador (algoritmo de Luhn) no cadastro de aparelho
  - CPF: validação de dígitos
  - Unique constraint: IMEI não pode ter dois registros com proteção ativa (preparar índice
    parcial no Postgres)
  - `audit_log`: interceptor global que registra toda mutação (quem, o quê, quando, antes/depois)
- Validação com class-validator em todos os DTOs; erros padronizados em português
- Swagger em `/docs` (protegido por auth em produção)
- Seed: 1 usuário ADMIN, 2 lojas de exemplo com 2 vendedores cada, 3 planos
  (Essencial R$ 19,90/mês, Completo R$ 29,90/mês, Anual R$ 299) e 5 clientes fictícios
- Testes: unitários dos validadores (IMEI, CPF) e e2e do fluxo de auth

## 3. Frontends

**app-loja (mobile-first, PWA):**

- Login do vendedor
- Home com atalhos grandes: "Nova Proteção" (placeholder por enquanto), "Meus Clientes",
  "Minhas Vendas" (placeholder)
- Tela de cadastro de cliente + aparelho (com validação de IMEI em tempo real)
- Visual: limpo, botões grandes, uso com uma mão no balcão da loja. Cores da Solatium
  (usar variáveis CSS fáceis de trocar; placeholder: azul-escuro #0B2545 + verde #16A34A)

**app-admin:**

- Login admin/operador
- CRUD de lojas (com campos de conta bancária p/ futuro split e % de comissão)
- CRUD de vendedores, planos e clientes
- Layout com sidebar, tabelas com busca e paginação

## 4. DevOps / Railway

- Dockerfile para cada app + `railway.json` por serviço
- Variáveis de ambiente documentadas em `.env.example` (seção 7 do CLAUDE.md)
- Health check `/health` no backend (verifica Postgres e Redis)
- Ao final, gere um arquivo `DEPLOY.md` com o passo a passo exato para eu criar o projeto
  no Railway: serviços, plugins Postgres/Redis, variáveis, conexão com o GitHub e domínios

## 5. Regras de trabalho

- Commits pequenos e descritivos em português (conventional commits)
- Ao final de cada etapa grande, rode lint + typecheck + testes antes de seguir
- Não invente integrações ainda (Asaas, Digisac, R2 são das próximas sprints) — apenas
  deixe as interfaces/stubs preparados (`PaymentProvider`, `MessagingProvider`, `StorageProvider`)
- Ao terminar, atualize a seção STATUS do CLAUDE.md marcando a Sprint 1 e me apresente
  um resumo do que foi feito + como rodar localmente

## ✅ Checklist de aceite da Sprint 1

- [ ] `pnpm install && pnpm dev` sobe backend + os dois frontends localmente
- [ ] Login funciona nos dois apps com roles corretas (vendedor não acessa admin)
- [ ] Consigo cadastrar loja → vendedor → cliente → aparelho (IMEI validado por Luhn)
- [ ] IMEI duplicado com proteção ativa é bloqueado
- [ ] Toda mutação aparece no audit_log
- [ ] Swagger em /docs documenta todas as rotas
- [ ] Testes passando no CI (GitHub Actions verde)
- [ ] DEPLOY.md gerado com passo a passo do Railway
- [ ] Seed popula dados de exemplo e consigo navegar pelos dois apps

Comece agora pela estrutura do monorepo e vá me atualizando a cada módulo concluído.
