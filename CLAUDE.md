# PROTEÇÃO SOLATIUM — Plataforma de Proteção de Celular para Lojas Parceiras

> Este arquivo é o contexto persistente do projeto para o Claude Code.
> Leia-o integralmente antes de qualquer tarefa. Atualize a seção STATUS ao final de cada sprint.

---

## 1. VISÃO DO PRODUTO

Plataforma white label onde a Solatium (estipulante + corretora) vende proteção de celular
(roubo/furto) através de ~500 lojas parceiras de eletrônicos/celulares. O cliente compra o
aparelho na loja e sai protegido na hora: vistoria → pagamento → certificado no WhatsApp.

**Modelo jurídico:** apólice coletiva com seguradora parceira (risco na seguradora).

- Solatium Proteção (CNPJ estipulante): dona da plataforma, marca, cliente, cobrança, sinistro.
- Solatium Seguros (corretora SUSEP 221136609): corretagem.
- Lojas: representantes de seguros (Res. CNSP 431/2021), comissão de 30%.
- Emissão de certificados individuais pelo sistema; reporte à seguradora via borderô mensal
  (fase 1) e/ou API (fase 2, se a seguradora tiver).
- Indenização de roubo/furto = voucher para compra na mesma loja (QR code validável).

**Diferenciais competitivos:**

1. Venda presencial no momento da compra do aparelho (500 pontos de venda).
2. Vistoria antifraude presencial → sinistralidade baixa → profit share.
3. Voucher na loja → aumenta LTV da loja → loja motivada a vender.

## 2. STACK E INFRAESTRUTURA

- **Backend:** Node.js + NestJS + TypeScript (mesmo padrão do solatium-backend)
- **Banco:** PostgreSQL (Railway) + Prisma ORM
- **Cache/filas:** Redis + BullMQ (cobrança, notificações, renovação)
- **Storage:** Cloudflare R2 (fotos de vistoria, PDFs de certificado, BOs) — compatível S3
- **Frontend:** React + Vite + Tailwind. Dois apps:
  - `app-loja` (mobile-first, PWA): usado pelo vendedor da loja
  - `app-admin`: backoffice Solatium
- **PDF:** geração de certificado com Puppeteer ou pdf-lib (template com marca Solatium)
- **Pagamentos:** Asaas (split nativo, Pix/boleto/cartão, régua de cobrança) — abstrair em
  `PaymentProvider` para permitir Pagar.me depois
- **WhatsApp:** Digisac (já contratado pela Solatium) via API
- **Email:** Resend
- **Deploy:** Railway (monorepo: apps/backend, apps/app-loja, apps/app-admin)
- **Auth:** JWT + refresh token; roles: ADMIN, OPERADOR, LOJA_ADMIN, LOJA_VENDEDOR

## 3. MÓDULOS (ordem de prioridade)

### M1 — Cadastros base

- Lojas (CNPJ, endereço, responsável, conta bancária p/ split Asaas, % comissão, status)
- Vendedores por loja (login próprio — rastrear quem vendeu)
- Clientes (CPF, nome, nascimento, telefone WhatsApp, email, endereço)
- Aparelhos (marca, modelo, IMEI único no sistema, valor de mercado — tabela de referência
  atualizável, nota fiscal opcional)
- Planos/produtos (cobertura, prêmio mensal e anual, franquia se houver, capital segurado,
  regras por faixa de valor do aparelho)

### M2 — Vistoria antifraude (bloqueante para emissão)

Fluxo no app-loja, mobile-first, câmera nativa:

1. Sistema gera **código dinâmico de 6 dígitos** com validade de 10 min
2. Foto 1: tela do aparelho ligada exibindo o código (prova de funcionamento naquele momento)
3. Foto 2: tela com `*#06#` mostrando IMEI (OCR do IMEI e comparação com o digitado)
4. Fotos 3-4: frente e verso do aparelho
5. Captura automática: geolocalização, timestamp, hash SHA-256 de cada foto, device fingerprint
6. Validações: IMEI não pode existir com proteção ativa; formato/dígito verificador do IMEI;
   geolocalização deve bater com raio da loja (500m); consulta futura a base de IMEIs roubados
7. Status: PENDENTE → APROVADA (auto se todas as regras passam) / EM_ANALISE / REPROVADA
8. Carência configurável pós-emissão (default 72h) para roubo/furto

### M3 — Emissão do certificado

- Vistoria aprovada + pagamento confirmado (ou 1ª cobrança gerada) → emite certificado
- Numeração sequencial própria + dados exigidos: seguradora, nº da apólice coletiva,
  processo SUSEP, estipulante, corretora, cliente, aparelho/IMEI, vigência 1 ano, coberturas,
  exclusões resumidas, canal de sinistro
- PDF com marca Proteção Solatium → enviado por WhatsApp (Digisac) e email na hora
- Página pública de validação: `/validar/{codigo}` (QR code no PDF)

### M4 — Pagamentos e split

- Checkout na loja: Pix (prioridade — dinheiro na hora), cartão de crédito (mensal recorrente
  ou anual à vista/parcelado), boleto
- Split automático Asaas: 30% loja, restante conta Solatium (percentual configurável por loja)
- Regra de ouro: **não perder venda** — se cartão falhar, oferecer Pix; se Pix não pago em
  30 min, gerar boleto e enviar por WhatsApp
- Webhooks Asaas: PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED → atualizar status

### M5 — Régua de cobrança (BullMQ + Digisac + Resend)

- D-3: lembrete de vencimento (WhatsApp)
- D0: cobrança com link de pagamento
- D+3, D+7: reenvio com nova via
- D+15: aviso de suspensão da cobertura (status SUSPENSA — sem cobertura, não cancela)
- D+30: cancelamento por inadimplência + comunicação formal
- Pagou durante suspensão → reativa com nova carência de 72h
- Todos os envios logados (auditoria); templates versionados

### M6 — Sinistro + voucher

- Abertura: pelo cliente via WhatsApp (integração futura com agente IA Sofia) ou pela loja/admin
- Documentos: BO digital (obrigatório), relato, dados bancários NÃO necessários (indenização = voucher)
- Esteira: ABERTO → DOCUMENTACAO_PENDENTE → EM_ANALISE → APROVADO / NEGADO
- Regras automáticas de alerta antifraude: sinistro < 30 dias da emissão, mesmo CPF com
  sinistro anterior, mesma loja com sinistralidade > X%, BO com data anterior à vigência
- APROVADO → gera **voucher**: valor = capital segurado (menos franquia se houver),
  QR code, validade 90 dias, resgatável apenas na loja de origem (configurável)
- App-loja tem tela "Resgatar voucher": escaneia QR, confirma aparelho novo vendido,
  registra novo IMEI (cliente pode contratar nova proteção na hora — fluxo encadeado)
- Financeiro do voucher: seguradora indeniza → Solatium repassa à loja no resgate
  (conciliação no módulo financeiro)

### M7 — Endosso (troca de aparelho)

- Cliente trocou de aparelho → nova vistoria do aparelho novo → substitui item no
  certificado → recalcula prêmio se faixa de valor mudou → gera endosso PDF → WhatsApp
- Histórico completo de endossos por certificado

### M8 — Renovação automática

- D-30 do fim de vigência: proposta de renovação por WhatsApp com link
- Cartão recorrente: renova automático com aviso prévio (D-30 e D-10, opt-out claro)
- Pix/boleto: cobrança de renovação; não pago até D0 → não renova, comunica fim de cobertura
- Renovação pode exigir nova vistoria se configurado (default: não exige)

### M9 — Dashboards

- **Loja:** vendas do mês, comissões a receber/recebidas, clientes ativos, ranking entre lojas,
  vouchers pendentes de resgate
- **Admin Solatium:** vidas ativas, MRR, churn, inadimplência, sinistralidade global e POR LOJA
  (métrica-chave para profit share e corte de loja fraudulenta), funil de vistorias, borderô
- **Borderô mensal:** export CSV/Excel no layout da seguradora (emissões, cancelamentos,
  endossos, sinistros do mês) — automatizar geração no dia 1

### M10 — Comunicação em massa + indicação

- Disparo segmentado via Digisac (filtros: loja, plano, status, cidade) com fila e rate limit
- Programa de indicação: link único por cliente (`/i/{codigo}`), recompensa configurável
  (ex.: 1 mês grátis para indicador e indicado), tracking de conversão

### M11 — API pública (fase 2)

- REST com API key por parceiro: criar cliente, iniciar vistoria, consultar certificado,
  webhook de eventos — para CRMs de terceiros e para o produto SaaS de agentes IA

### M12 — Financeiro: comissões, conta-corrente e clawback

**Conceito:** toda loja tem uma CONTA-CORRENTE DE COMISSÕES (livro-razão). Créditos: comissões de
vendas. Débitos: clawbacks de cancelamento e ajustes manuais. O saldo é liquidado conforme o
modo de pagamento configurado por loja.

**Modos de pagamento de comissão (configurável por loja):**

1. `SPLIT_INSTANTANEO` — 30% na entrada via provider (Asaas). Conta-corrente registra o crédito
   como já liquidado. Clawbacks viram débitos compensados nos próximos splits/repasses; se o saldo
   ficar negativo, o sistema retém 100% das próximas comissões até zerar.
2. `REPASSE_PROGRAMADO` — tudo entra na conta Solatium (Cora); o sistema consolida a
   conta-corrente e gera lote de repasse semanal/quinzenal via Pix (API Cora), já líquido de
   clawbacks. Gera relatório de repasse por loja (PDF/CSV).

**Clawback proporcional (regra central):**

- Comissão antecipada sobre contrato anual = comissão calculada sobre 12 parcelas.
- Cancelamento (inadimplência D+30 ou pedido do cliente) com N parcelas pagas →
  comissão devida = comissão_total × (N/12); clawback = comissão_total × ((12−N)/12).
- Lançar débito automático na conta-corrente da loja no evento de cancelamento, com memória de
  cálculo visível (contrato, parcelas pagas, valor devolvido).
- Mesmo racional para a comissão de corretagem e para o pró-labore (visão Solatium).
- Endosso que reduz prêmio → clawback proporcional da diferença; que aumenta → crédito complementar.

**Tabelas novas:** `comissoes`, `conta_corrente_lancamentos`, `repasses` (ver seção 4).

### M13 — Dashboard de sinistralidade com meta de 30%

**KPI central:** sinistralidade = sinistros_pagos / prêmio_arrecadado (competência mensal e
acumulado 12 meses), global e POR LOJA.

**Visualizações (app-admin):**

1. Gauge/velocímetro global: % atual com faixas VERDE (<20%), AMARELA (20–30%), VERMELHA (>30%) —
   linha de meta fixa em 30%.
2. Barras por loja: prêmio arrecadado vs sinistros pagos, ordenado por sinistralidade desc, com
   linha horizontal em 30%.
3. Série temporal (12 meses): prêmio, sinistro e % mês a mês.
4. Tabela ranking: loja, vidas ativas, prêmio, sinistros, %, tendência (▲▼), status.

**Automação:** loja acima de 30% por 2 meses consecutivos → status REVISAO automática + alerta
WhatsApp para o admin (Digisac) + destaque vermelho no dashboard. Acima de 60% → sugestão de
suspensão de novas vendas.

**Visão da loja (app-loja):** a loja vê a própria sinistralidade e quanto falta para a faixa verde
(transparência gera comportamento — a loja policia fraude do próprio balcão).

## 4. SCHEMA (principais tabelas — Prisma)

lojas, vendedores, clientes, aparelhos, planos,
vistorias (fotos jsonb, geolocalizacao, hash, status, motivo_reprova),
certificados (numero, cliente_id, aparelho_id, plano_id, loja_id, vendedor_id,
vigencia_inicio, vigencia_fim, status: ATIVO|SUSPENSO|CANCELADO|EXPIRADO, pdf_url),
endossos, pagamentos (asaas_id, tipo, status, valor, split jsonb),
cobrancas_log, sinistros (status, bo_url, alertas_fraude jsonb),
vouchers (codigo, qr, valor, validade, status: EMITIDO|RESGATADO|EXPIRADO, loja_resgate_id),
indicacoes, notificacoes_log, borderos, usuarios, audit_log (tudo relevante logado),
comissoes (loja_id, certificado_id?, endosso_id?, tipo: LOJA|CORRETAGEM, regime: ANTECIPADA|PRO_RATA,
valor_base, valor_total, parcelas_totais, parcelas_pagas, valor_estornado, status),
conta_corrente_lancamentos (loja_id, tipo: CREDITO|DEBITO_CLAWBACK|AJUSTE, valor, saldo_apos,
referencia, comissao_id?, memoria_calculo jsonb),
repasses (lote, loja_id, valor_liquido, status: ABERTO|PROCESSANDO|PAGO|FALHA, comprovante_url)

Loja ganha `modo_pagamento_comissao` (SPLIT_INSTANTANEO|REPASSE_PROGRAMADO).

Regras de integridade: IMEI único com proteção ATIVA; certificado só nasce com vistoria
APROVADA; voucher só nasce de sinistro APROVADO; toda mudança de status em audit_log;
todo clawback lança débito na conta-corrente com saldo_apos e memória de cálculo.

## 5. REGRAS DE NEGÓCIO CRÍTICAS

1. Nunca emitir certificado sem vistoria aprovada e pagamento confirmado/agendado.
2. Carência de 72h para roubo/furto após emissão e após reativação (configurável).
3. Suspensão ≠ cancelamento: suspenso não tem cobertura mas pode reativar.
4. Sinistralidade por loja > limiar (config, ex. 60%) → loja entra em revisão automática.
5. Linguagem em TODO material: produto é seguro com nome comercial "Proteção Solatium";
   certificado deve citar seguradora, apólice e processo SUSEP (compliance).
6. LGPD: consentimento no fluxo de venda, dados criptografados em repouso (CPF), logs de acesso.
7. Toda comissão nasce com regime definido (antecipada/pro-rata) e agenda de clawback vinculada
   ao ciclo de parcelas do certificado.
8. Saldo negativo de conta-corrente de loja bloqueia repasses e retém comissões futuras até zerar.
9. Sinistralidade por loja >30% por 2 meses → REVISAO automática; >60% → suspensão sugerida.
10. Provider de pagamento é plugável: Asaas (split instantâneo) e Cora (cobrança + repasse
    programado via Pix) devem coexistir atrás da interface PaymentProvider.

## 6. ROADMAP DE SPRINTS (MVP em ~6 semanas)

- **S1:** monorepo, auth/roles, cadastros base (M1), deploy Railway
- **S2:** vistoria completa (M2) + upload R2 + validações IMEI
- **S3:** planos, checkout Asaas + split + webhooks (M4), emissão + PDF + WhatsApp (M3)
- **S4:** régua de cobrança (M5) + suspensão/reativação + dashboards (M9) + **liquidação do M12
  (split Asaas / repasse Cora)** + **dashboard de sinistralidade M13 (meta 30%)**
- **S5:** sinistro + voucher + resgate na loja (M6), endosso (M7)
- **S6:** renovação (M8), borderô, disparo em massa, indicação (M10), hardening + piloto

> **M12 (financeiro):** schema + cálculo de comissão/clawback + lançamentos automáticos já
> entregues na S1.5; a **liquidação** (split/repasse) entra na S4. **M13** entra na S4.

**Piloto:** 10 lojas selecionadas, 60 dias, meta 300 certificados, sinistralidade < 30%.

## 7. INTEGRAÇÕES — VARIÁVEIS DE AMBIENTE

ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, CORA_CLIENT_ID, CORA_CLIENT_SECRET, CORA_CERT (repasse Pix),
DIGISAC_TOKEN, DIGISAC_URL, RESEND_API_KEY,
R2_ACCESS_KEY/SECRET/BUCKET, DATABASE_URL, REDIS_URL, JWT_SECRET, SEGURADORA_* (definir após contrato)

## 8. STATUS

- [ ] Contrato seguradora: EM NEGOCIAÇÃO (Akad / ESSOR / Assurant)
- [ ] CNPJ estipulante: A CONSTITUIR
- [x] **Sprint 1 (S1) — CONCLUÍDA**: monorepo (pnpm + Turborepo), backend NestJS + Prisma
      (schema completo M1–M11 + migration inicial + índice parcial do IMEI), auth JWT + refresh +
      argon2 com guards por papel, CRUDs do M1 (lojas, vendedores, clientes, aparelhos, planos,
      usuarios), validação IMEI (Luhn) e CPF, interceptor de auditoria global, health check
      (Postgres/Redis), Swagger em /docs, stubs de integração (Payment/Messaging/Storage), seed,
      testes unitários (validadores) + e2e (auth), os dois frontends (app-loja PWA e app-admin),
      CI (GitHub Actions), Dockerfiles + railway.json e DEPLOY.md. Gate verde: typecheck + lint +
      testes + build.
- [x] **Atualização de regras (M12/M13) — parcial**: schema do M12 (comissoes,
      conta_corrente_lancamentos, repasses + `modo_pagamento_comissao` na loja + migration 0002),
      serviço de cálculo de comissão e **clawback proporcional** com testes unitários (exemplo
      anual 2/12 → clawback 10/12) e lançamentos automáticos na conta-corrente (emissão/cancelamento/
      endosso). Liquidação (split/repasse) e M13 (dashboard de sinistralidade) registrados para a S4.
      Regras 7–10 adicionadas à seção 5.
- [ ] Sprint atual: **S2** (vistoria antifraude M2 + upload R2 + validações IMEI)
- Última atualização: 04/07/2026
