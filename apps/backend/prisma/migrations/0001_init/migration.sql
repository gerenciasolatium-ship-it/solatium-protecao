-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERADOR', 'LOJA_ADMIN', 'LOJA_VENDEDOR');

-- CreateEnum
CREATE TYPE "LojaStatus" AS ENUM ('ATIVA', 'INATIVA', 'EM_REVISAO');

-- CreateEnum
CREATE TYPE "PlanoPeriodicidade" AS ENUM ('MENSAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "VistoriaStatus" AS ENUM ('PENDENTE', 'APROVADA', 'EM_ANALISE', 'REPROVADA');

-- CreateEnum
CREATE TYPE "CertificadoStatus" AS ENUM ('ATIVO', 'SUSPENSO', 'CANCELADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "PagamentoTipo" AS ENUM ('PIX', 'CARTAO', 'BOLETO');

-- CreateEnum
CREATE TYPE "PagamentoStatus" AS ENUM ('PENDENTE', 'CONFIRMADO', 'VENCIDO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "SinistroStatus" AS ENUM ('ABERTO', 'DOCUMENTACAO_PENDENTE', 'EM_ANALISE', 'APROVADO', 'NEGADO');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('EMITIDO', 'RESGATADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "lojas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "responsavelNome" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bancoNome" TEXT,
    "bancoAgencia" TEXT,
    "bancoConta" TEXT,
    "bancoTipoConta" TEXT,
    "pixChave" TEXT,
    "asaasWalletId" TEXT,
    "comissaoPct" DECIMAL(5,4) NOT NULL DEFAULT 0.30,
    "status" "LojaStatus" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "refreshTokenHash" TEXT,
    "lojaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "lojaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "nascimento" TIMESTAMP(3),
    "telefoneWhatsapp" TEXT NOT NULL,
    "email" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "lojaOrigemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos" (
    "id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "valorMercado" DECIMAL(12,2) NOT NULL,
    "notaFiscalUrl" TEXT,
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparelhos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "periodicidade" "PlanoPeriodicidade" NOT NULL DEFAULT 'MENSAL',
    "premioMensal" DECIMAL(12,2),
    "premioAnual" DECIMAL(12,2),
    "franquia" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "capitalSegurado" DECIMAL(12,2) NOT NULL,
    "valorAparelhoMin" DECIMAL(12,2),
    "valorAparelhoMax" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vistorias" (
    "id" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "codigoDinamico" TEXT NOT NULL,
    "codigoExpiraEm" TIMESTAMP(3) NOT NULL,
    "fotos" JSONB,
    "geolocalizacao" JSONB,
    "deviceFingerprint" TEXT,
    "status" "VistoriaStatus" NOT NULL DEFAULT 'PENDENTE',
    "motivoReprova" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vistorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificados" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "codigoValidacao" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "vistoriaId" TEXT,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "carenciaAte" TIMESTAMP(3),
    "status" "CertificadoStatus" NOT NULL DEFAULT 'ATIVO',
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endossos" (
    "id" TEXT NOT NULL,
    "certificadoId" TEXT NOT NULL,
    "aparelhoAnteriorId" TEXT,
    "aparelhoNovoId" TEXT,
    "motivo" TEXT,
    "premioAnterior" DECIMAL(12,2),
    "premioNovo" DECIMAL(12,2),
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "endossos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "certificadoId" TEXT,
    "asaasId" TEXT,
    "tipo" "PagamentoTipo" NOT NULL,
    "status" "PagamentoStatus" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(12,2) NOT NULL,
    "split" JSONB,
    "vencimento" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobrancas_log" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT,
    "certificadoId" TEXT,
    "canal" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "payload" JSONB,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobrancas_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sinistros" (
    "id" TEXT NOT NULL,
    "certificadoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "SinistroStatus" NOT NULL DEFAULT 'ABERTO',
    "boUrl" TEXT,
    "relato" TEXT,
    "alertasFraude" JSONB,
    "valorIndenizacao" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sinistros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "sinistroId" TEXT NOT NULL,
    "qr" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "validade" TIMESTAMP(3) NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'EMITIDO',
    "lojaResgateId" TEXT,
    "resgatadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicacoes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteIndicadorId" TEXT NOT NULL,
    "clienteIndicadoId" TEXT,
    "recompensa" TEXT,
    "convertidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_log" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borderos" (
    "id" TEXT NOT NULL,
    "referenciaMes" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "arquivoUrl" TEXT,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "borderos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lojas_cnpj_key" ON "lojas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_cpf_key" ON "vendedores"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_usuarioId_key" ON "vendedores"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cpf_key" ON "clientes"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_imei_key" ON "aparelhos"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_numero_key" ON "certificados"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_codigoValidacao_key" ON "certificados"("codigoValidacao");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_vistoriaId_key" ON "certificados"("vistoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_codigo_key" ON "vouchers"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_sinistroId_key" ON "vouchers"("sinistroId");

-- CreateIndex
CREATE UNIQUE INDEX "indicacoes_codigo_key" ON "indicacoes"("codigo");

-- CreateIndex
CREATE INDEX "audit_log_entidade_entidadeId_idx" ON "audit_log"("entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_lojaOrigemId_fkey" FOREIGN KEY ("lojaOrigemId") REFERENCES "lojas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos" ADD CONSTRAINT "aparelhos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vistorias" ADD CONSTRAINT "vistorias_aparelhoId_fkey" FOREIGN KEY ("aparelhoId") REFERENCES "aparelhos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vistorias" ADD CONSTRAINT "vistorias_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vistorias" ADD CONSTRAINT "vistorias_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vistorias" ADD CONSTRAINT "vistorias_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_aparelhoId_fkey" FOREIGN KEY ("aparelhoId") REFERENCES "aparelhos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_vistoriaId_fkey" FOREIGN KEY ("vistoriaId") REFERENCES "vistorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endossos" ADD CONSTRAINT "endossos_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "certificados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "certificados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas_log" ADD CONSTRAINT "cobrancas_log_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "pagamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas_log" ADD CONSTRAINT "cobrancas_log_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "certificados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinistros" ADD CONSTRAINT "sinistros_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "certificados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinistros" ADD CONSTRAINT "sinistros_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_sinistroId_fkey" FOREIGN KEY ("sinistroId") REFERENCES "sinistros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_lojaResgateId_fkey" FOREIGN KEY ("lojaResgateId") REFERENCES "lojas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_clienteIndicadorId_fkey" FOREIGN KEY ("clienteIndicadorId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_clienteIndicadoId_fkey" FOREIGN KEY ("clienteIndicadoId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- Índice parcial (regra crítica): um aparelho — logo, um IMEI — não pode ter
-- duas proteções vigentes ao mesmo tempo (CLAUDE.md M2/5).
-- Cobre status ATIVO e SUSPENSO (suspenso ainda ocupa o vínculo do IMEI).
-- ===========================================================================
CREATE UNIQUE INDEX "uniq_certificado_aparelho_protecao_ativa"
  ON "certificados" ("aparelhoId")
  WHERE "status" IN ('ATIVO', 'SUSPENSO');
