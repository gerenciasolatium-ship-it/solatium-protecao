# Relatório de Qualidade — Sprint S4 (11/07/2026)

Escopo da sprint: **Sinistros + Voucher (M6)** · **Dashboards executivos (M9/M13)** ·
**Inadimplência (M5-lite)** · **Cadastro em massa** · **Auditoria de bugs do código
existente com correções**. Preparação da plataforma para escalar a 3.000+ lojistas.

---

## 1. Auditoria do código existente (bugs encontrados e corrigidos)

Antes de qualquer feature nova, um agente auditor varreu os fluxos críticos
(checkout, split, webhook, emissão, financeiro, multi-tenant). Resultado:

### Corrigidos nesta sprint

| # | Severidade | Problema | Correção |
|---|---|---|---|
| 1 | **CRÍTICO** | `novaCobranca` ("não perder venda") não cancelava a cobrança/assinatura anterior no Asaas → assinatura órfã cobrando o cartão todo mês + risco de cobrança dupla (cartão confirma atrasado depois do cliente pagar o Pix). | `PaymentProvider.cancelarCobranca/cancelarAssinatura` (DELETE no Asaas, best-effort) chamados antes de gerar nova cobrança; pagamentos `PENDENTE` viram `CANCELADO` (novo status); guard bloqueia nova cobrança se já há pagamento `CONFIRMADO`; webhook loga alerta se cobrança cancelada confirmar mesmo assim. `contratos.service.ts` |
| 2 | **ALTO** | Race condition no `saldo_apos` do livro-razão (read-then-write sem lock; desempate de ordenação por uuid aleatório) → saldo de comissões podia corromper permanentemente. | `pg_advisory_xact_lock` por loja dentro da transação de lançamento + coluna `seq SERIAL` como ordem monotônica (backfill na migration 0006); todas as leituras de saldo ordenam por `seq`. `financeiro.service.ts` |
| 3 | **ALTO** | Emissão só tratava `P2002` do `unique(contratoId)`; o unique parcial de IMEI ativo derrubava o job silenciosamente → cliente PAGAVA e nunca recebia certificado. | Re-checagem de IMEI com proteção ativa no `POST /contratos` (previne o cenário) + erro explícito no catch da emissão apontando a ação manual (estorno/endosso). |
| 4 | **ALTO** | Falha persistente do WhatsApp bloqueava o envio do e-mail do certificado (cliente ficava sem documento por nenhum canal). | Canais independentes: e-mail é tentado mesmo com WhatsApp falhando; o erro do WhatsApp é relançado só no fim (retry preservado, flags por canal evitam duplicação). `emissao.service.ts` |
| 5 | **MÉDIO** | `PAYMENT_REFUNDED`/`OVERDUE` não tinham consequência: certificado seguia ATIVO e comissão creditada sem clawback (funções de clawback existiam mas **nenhum caller**). | Estorno da 1ª cobrança → certificado CANCELADO + clawback integral; OVERDUE entra na régua D+15/D+30 (ver §3). |
| 6 | **MÉDIO** | OVERDUE de parcela 2+ da assinatura (não registrada localmente) era ignorado → inadimplência invisível. | Webhook registra pagamento `VENCIDO` via `externalReference` (com `dueDate`). |
| 7 | **MÉDIO** | Corrida de webhooks duplicados no branch "cobrança desconhecida" → `P2002` não tratado virava HTTP 500 (retry desnecessário do Asaas). | `P2002` capturado e tratado como "já registrado". |
| 8 | **MÉDIO** | Token do webhook comparado com `!==` (timing attack teórico). | `crypto.timingSafeEqual`. |

### Riscos conhecidos ACEITOS (documentados, não corrigidos nesta sprint)

- **Rate limiting** nos endpoints públicos (webhook, API de parceiros): não há
  throttle global. Mitigação atual: token/chave com comparação segura + hash.
  Recomendação: `@nestjs/throttler` na S5 (nova dependência — não incluída para
  não misturar mudança de lockfile nesta PR).
- Vistoria pode referenciar aparelho de cliente de outra loja (BAIXO — a vistoria
  nasce sempre na loja do vendedor; sem IDOR de leitura).
- `dataPagamento` fixa 12:00 BRT quando o Asaas só manda a data (BAIXO — afeta
  borda de carência em horas).
- Proposta externa `UTILIZADA` pode ser relida pela loja dona até expirar (BAIXO).

### Pontos verificados e sólidos (sem alteração)

Idempotência da emissão em 3 camadas; numeração `PS-AAAA-` atômica; escopo
multi-tenant (`autorizarLoja` consistente em todos os controllers — nenhum IDOR
encontrado); split percentual sem erro de escala; cálculo de clawback proporcional
correto; DTOs com `ValidationPipe` global (`whitelist+forbidNonWhitelisted`);
chaves de API armazenadas só como SHA-256; CORS restrito.

---

## 2. Módulo de Sinistros (M6)

- **Abertura** (loja ou backoffice) com validações duras: certificado precisa estar
  ATIVO e na vigência (SUSPENSO → mensagem de regularização); 1 sinistro em
  andamento por certificado.
- **Alertas antifraude automáticos** na abertura (`sinistro.util.ts`, puro/testado):
  sinistro < 30 dias da emissão, abertura dentro da carência de 72h, B.O. anterior
  à vigência, CPF reincidente, loja com sinistralidade > 30%. Alertas **não
  bloqueiam** — marcam para análise humana (exibidos em destaque no admin).
- **Esteira controlada**: `ABERTO → DOCUMENTACAO_PENDENTE → EM_ANALISE → APROVADO |
  NEGADO` (mapa de transições testado; não aprova sem B.O.; negativa exige motivo).
  Decisão restrita a ADMIN/OPERADOR; loja abre e anexa documentação.
- **Voucher na aprovação** (regra 13): `capital × (1 − franquia_do_PLANO/100)`,
  teste obrigatório R$ 3.000 → R$ 2.250/R$ 750 incluído; validade 90 dias; código
  `VC-` sem caracteres ambíguos; criação atômica na mesma transação da decisão
  (`unique(sinistroId)` garante 1 voucher).
- **Resgate no balcão**: só na loja de origem, `updateMany` condicionado ao status
  (sem resgate duplo em corrida), expiração lazy.
- UI: página **Sinistros no app-admin** (fila, alertas, decisão) e no **app-loja**
  (abrir por busca de certificado, acompanhar, ver voucher) + **Resgatar Voucher**.

## 3. Inadimplência (M5-lite) — regra 3 do CLAUDE.md

- Job BullMQ **repetível diário** (03:00 BRT, `jobId` fixo — sem duplicação em
  redeploy): parcela vencida há **15+ dias → SUSPENSO** (sem cobertura, avisa
  cliente no WhatsApp); **30+ dias → CANCELADO** (contrato junto), com **clawback
  proporcional** às parcelas não pagas e cancelamento da assinatura no Asaas.
- **Reativação**: pagamento confirmado com certificado SUSPENSO → ATIVO com **nova
  carência de 72h** (regra 2), aviso ao cliente.
- Tudo com `audit_log`, `notificacoes_log` e isolamento por certificado (um erro
  não trava a régua). Lote de 500/dia por varredura (proteção de memória).

## 4. Dashboards (M9 + M13)

- **`GET /dashboard/resumo`** (ADMIN/OPERADOR): vidas ativas, vendas/prêmio/ticket
  médio do mês, MRR, inadimplência (parcelas vencidas, valor, %), sinistralidade
  12m com faixa VERDE/AMARELA/VERMELHA e meta 30%, funil de vistorias, série
  mensal de 12 meses (vendas, prêmio arrecadado, indenizações, % mês a mês) e
  **ranking de lojas** (vidas, vendas, prêmio, indenizações, parcelas vencidas,
  sinistralidade + faixa).
- **`GET /dashboard/loja`**: mesmos números escopados + saldo da conta-corrente,
  comissões creditadas, vouchers pendentes e **margem em R$ até sair da faixa
  verde** (transparência M13 — a loja policia o próprio balcão).
- **Escala**: 100% agregado no banco (groupBy/SQL com índices novos
  `certificados(lojaId,status)`, `pagamentos(status,vencimento)`,
  `sinistros(lojaId,status)`); ranking com LIMIT; nunca carrega a carteira em
  memória. Preparado para 3.000+ lojas.
- **UI admin**: KPI row, medidor de sinistralidade vs meta, gráficos SVG próprios
  (sem dependência nova) com tooltip por hover, legenda e paleta **validada para
  daltonismo** (ΔE 74,6; contraste ≥3:1); auto-refresh 60s. **UI loja**: painel
  "Minhas Vendas" mobile-first.

## 5. Cadastro em massa (escala de onboarding)

- `POST /lojas/importar` e `POST /vendedores/importar` (ADMIN/OPERADOR): CSV com
  separador `;` ou `,`, aspas, BOM e CRLF tratados (parser próprio testado);
  relatório por linha (criadas / já existiam / erros com nº da linha); limite de
  1.000 linhas por lote; vendedores resolvem a loja por CNPJ em 1 query e reusam o
  `create()` atômico (login + vendedor); senha por linha ou padrão do lote.
- UI: modal "Importar CSV" nas telas Lojas e Vendedores com download de modelo.

## 6. Testes e gate

| Verificação | Resultado |
|---|---|
| Lint (Prettier, 3 apps + shared) | ✅ |
| Typecheck (tsc, 5 pacotes) | ✅ |
| Testes unitários | ✅ **78 testes** (eram 45) — novos: alertas de fraude (7), voucher/franquia (3), esteira (3), código voucher (1), dashboard utils (8), CSV (7), webhook (9 cenários incl. reativação, estorno→cancelamento, OVERDUE parcela 2+, token timing-safe) |
| Build (turbo, 4 pacotes) | ✅ 4/4 |
| Migration | `0006_s4_sinistros_dashboards` — **roda sozinha no boot** (`prisma migrate deploy`), com backfill do livro-razão e `lojaId` dos sinistros |

### Cobertura crítica por fluxo
- **Venda/checkout**: guard de pagamento confirmado + cancelamento da cobrança
  anterior (novos); IMEI re-checado.
- **Pagamento/split**: split inalterado (já auditado como correto); cancelamento
  de assinatura coberto por interface + stub.
- **Emissão**: idempotência preservada (testes existentes) + entrega multi-canal.
- **Sinistro/voucher**: cálculo, esteira e fraude 100% unit-tested.

## 7. Pendências recomendadas (próximas sprints)

1. `@nestjs/throttler` (rate limit público) + testes e2e com Postgres efêmero.
2. Régua de cobrança completa M5 (D-3/D0/D+3/D+7 com reenvio de via).
3. Liquidação M12 (lote de repasse semanal Pix) — `repasseBloqueado()` já pronto.
4. Alerta automático M13 (loja >30% por 2 meses → EM_REVISAO + WhatsApp admin).
5. Borderô mensal (M9) e endosso (M7).
