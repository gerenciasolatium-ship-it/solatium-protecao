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

### M3 — Emissão do certificado (spec fechada — sprint S3)

**Regra de ouro:** confirmada a PRIMEIRA cobrança do contrato, o sistema emite o
certificado/bilhete em PDF e entrega no WhatsApp e email do cliente SEM nenhuma ação humana.

**Job `emitir-certificado` (BullMQ, retry + idempotência):**

- Disparado pelo webhook Asaas (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` da 1ª cobrança).
- Idempotente: NUNCA emitir duas vezes para o mesmo contrato (chave = pagamento/contrato;
  webhook duplicado não gera segundo certificado).
- Gera número sequencial em série própria: `PS-AAAA-000001` (AAAA = ano da emissão).
- Vigência: início = data/hora da confirmação do pagamento; fim = início + 1 ano.
  Carência de 72h para roubo/furto a partir do início (herdada da vistoria/config).
- Renderiza o PDF (template abaixo), salva no R2, grava `pdf_url` no certificado.
- Envia na hora por WhatsApp (Digisac — mensagem + PDF anexo) e email (Resend).
- Status do certificado: ATIVO; `audit_log` completo de cada passo.
- Registra comissão da loja via gancho `registrarComissaoEmissao` (M12).

**TEMPLATE DO BILHETE (PDF 1 página, marca Proteção Solatium):**

1. Cabeçalho: logo/nome PROTEÇÃO SOLATIUM + "Certificado Individual de Seguro" +
   número do certificado + QR code apontando para `/validar/{codigo}`.
2. Bloco SEGURADO: nome completo, CPF, data de nascimento, telefone/WhatsApp, email,
   endereço completo.
3. Bloco APARELHO SEGURADO: marca, modelo, capacidade de armazenamento (GB — campo
   obrigatório no cadastro de aparelho), cor, IMEI, valor de referência (capital segurado),
   data e nº da vistoria aprovada.
4. Bloco VIGÊNCIA: início e fim (1 ano), carência de 72h para roubo/furto destacada,
   forma de pagamento contratada.
5. Bloco COBERTURA E FRANQUIA (destaque visual — caixa):
   - Cobertura: roubo e furto qualificado do aparelho segurado.
   - Indenização: voucher para aquisição de outro aparelho na loja parceira de origem.
   - FRANQUIA: 25% do valor de referência, deduzida da indenização.
   - Exemplo CALCULADO com os números do próprio cliente: "Aparelho segurado: R$ {valor}.
     Em caso de sinistro coberto, seu voucher será de R$ {valor×0,75} (indenização) e sua
     participação (franquia) será de R$ {valor×0,25}."
   - Como acionar: canal de sinistro (WhatsApp oficial) + necessidade de B.O.
   - Principais exclusões resumidas (furto simples sem vestígios se não coberto, quebra,
     perda, esquecimento — conforme condições gerais).
6. Rodapé legal (placeholders via env): Seguradora {SEGURADORA_NOME} — CNPJ
   {SEGURADORA_CNPJ} — Apólice coletiva nº {APOLICE_NUMERO} — Processo SUSEP
   {PROCESSO_SUSEP}; Estipulante {ESTIPULANTE_RAZAO} — CNPJ {ESTIPULANTE_CNPJ};
   Corretora Solatium Seguros — SUSEP 221136609 — CNPJ {SOLATIUM_CNPJ}; Loja parceira
   (representante): razão social + CNPJ da loja da venda; central da seguradora, SUSEP,
   condições gerais (link).

**REGRA DURA no código:** se as envs da seguradora não estiverem preenchidas, TODO PDF sai
com marca d'água diagonal "AMBIENTE DE TESTE — SEM VALIDADE". Sem exceção. (Proteção contra
emissão de documento sem lastro legal.)

**Página pública `/validar/{codigo}`** (sem login, QR code do PDF aponta pra cá): status do
certificado (ATIVO/SUSPENSO/CANCELADO/EXPIRADO), vigência, modelo do aparelho, IMEI mascarado
(últimos 4), nome parcial do titular — valida sem expor dados pessoais.

**Mensagem de entrega (WhatsApp):** "🎉 {primeiro_nome}, seu aparelho está protegido!
Certificado PS-2026-000123 em anexo. Vigência até {data}. Guarde este documento. Qualquer
sinistro, é só chamar aqui." + PDF. Email equivalente (Resend).

### M4 — Pagamentos e split (mínimo da sprint S3)

- Integração **Asaas atrás da interface `PaymentProvider`** já stubada: criar cliente Asaas,
  criar cobrança (PIX | CARTAO_RECORRENTE mensal | ANUAL à vista ou parcelado | BOLETO),
  split de 30% para a conta da loja (`asaasWalletId` no cadastro da loja; % configurável).
- Fluxo no app-loja após vistoria APROVADA: escolher plano/forma de pagamento → gerar
  cobrança → exibir QR Pix / link na tela para o cliente pagar ALI no balcão.
- Webhook Asaas (`POST /webhooks/asaas`, validado por token `ASAAS_WEBHOOK_TOKEN` no header
  `asaas-access-token`): `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` da PRIMEIRA cobrança do
  contrato → dispara o job `emitir-certificado` (BullMQ, retry + idempotência).
  Demais eventos (`PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`) atualizam status do pagamento.
- Registrar comissão da loja via gancho `registrarComissaoEmissao` (M12, já existente).
- Regra de ouro: **não perder venda** — cartão recusado → sistema oferece Pix na mesma tela;
  Pix não pago em 30 min → gerar boleto e enviar por WhatsApp (régua completa fica pro M5).

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
- APROVADO → gera **voucher**: valor = capital_segurado × (1 − franquia_percentual/100),
  lendo `franquia_percentual` do PLANO (default 25) — nunca hard-coded. Ex.: aparelho
  R$ 3.000 → voucher R$ 2.250 / franquia R$ 750 (teste unitário obrigatório).
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

Ajustes da S3: `aparelhos` ganha `armazenamento_gb` (obrigatório) e `cor`; `planos` ganha
`franquia_percentual` (default 25 — fonte única do cálculo de voucher no M6); `certificados`
ganha `forma_pagamento` contratada; `pagamentos` ganha `asaas_customer_id`/`external_ref` e
flag de 1ª cobrança do contrato; série sequencial do certificado em tabela própria
(`certificado_series` por ano) pra numeração `PS-AAAA-000001` atômica.

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
11. Emissão é 100% automática pós-pagamento (webhook → job BullMQ) e idempotente: webhook
    duplicado nunca gera segundo certificado para o mesmo contrato.
12. Sem envs da seguradora (`SEGURADORA_*`, `APOLICE_NUMERO`, `PROCESSO_SUSEP`,
    `ESTIPULANTE_*`) → todo PDF sai com marca d'água "AMBIENTE DE TESTE — SEM VALIDADE".
13. Franquia é atributo do PLANO (`franquia_percentual`, default 25); o cálculo do voucher
    (M6) e o exemplo em reais do PDF (M3) leem SEMPRE desse campo.

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

ASAAS_API_KEY, ASAAS_BASE_URL (sandbox: https://api-sandbox.asaas.com/v3), ASAAS_WEBHOOK_TOKEN,
CORA_CLIENT_ID, CORA_CLIENT_SECRET, CORA_CERT (repasse Pix),
DIGISAC_TOKEN, DIGISAC_URL, RESEND_API_KEY, RESEND_FROM,
R2_ACCESS_KEY/SECRET/BUCKET/ENDPOINT/PUBLIC_URL, DATABASE_URL, REDIS_URL, JWT_SECRET,
PUBLIC_VALIDAR_URL (base do link/QR de validação).
Rodapé legal do bilhete (vazias → marca d'água "AMBIENTE DE TESTE — SEM VALIDADE"):
SEGURADORA_NOME, SEGURADORA_CNPJ, APOLICE_NUMERO, PROCESSO_SUSEP,
ESTIPULANTE_RAZAO, ESTIPULANTE_CNPJ, SOLATIUM_CNPJ, CONDICOES_GERAIS_URL, SEGURADORA_CENTRAL_TEL

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
- [x] **Sprint S3 (M3+M4) — pagamento → emissão automática do bilhete** (07/07/2026,
      branch `feat/s3-pagamento-emissao`): Asaas real atrás do `PaymentProvider`
      (cliente com dedup por CPF, PIX com QR/copia-e-cola, assinatura mensal, cartão anual
      à vista/parcelado, boleto, split percentual pela `asaasWalletId` da loja quando
      `SPLIT_INSTANTANEO`), checkout no app-loja (wizard Nova Proteção: cliente+aparelho →
      vistoria → plano/forma → QR na tela → polling → sucesso), webhook `/api/webhooks/asaas`
      (token, PAYMENT_CONFIRMED/RECEIVED → job; OVERDUE/REFUNDED → status), fila BullMQ
      `emissao` (5 tentativas, backoff exponencial, idempotência em 3 camadas: jobId único +
      `unique(contratoId)` + flags de pdf/envio), numeração `PS-AAAA-000001` atômica
      (`certificado_series`), PDF 1 página (pdfkit + QR `/validar/{codigo}`, caixa de
      franquia com exemplo calculado, rodapé legal com placeholders e **marca d'água
      "AMBIENTE DE TESTE — SEM VALIDADE" quando envs da seguradora ausentes**), entrega
      automática WhatsApp (Digisac, PDF anexo) + email (Resend), comissão via
      `registrarComissaoEmissao`, endpoint público `/validar/:codigo` mascarado + página
      no app-loja, `franquiaPercentual` no plano (default 25) com teste 3.000→2.250/750,
      migration 0004, Digisac/Resend/R2 providers reais com fallback stub sem env.
      Gate verde: lint + typecheck + 40 testes + build 4/4.
      **Vistoria nesta sprint é o gate mínimo** (código dinâmico + aprovação manual +
      trava de IMEI); M2 completo (fotos, OCR, geolocalização) continua pendente.
- [ ] Sprint atual: **S2** (vistoria antifraude M2 completa + upload R2 + OCR/geo)
- Última atualização: 07/07/2026
