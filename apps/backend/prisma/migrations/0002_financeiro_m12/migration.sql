-- CreateEnum
CREATE TYPE "ModoPagamentoComissao" AS ENUM ('SPLIT_INSTANTANEO', 'REPASSE_PROGRAMADO');

-- CreateEnum
CREATE TYPE "ComissaoTipo" AS ENUM ('LOJA', 'CORRETAGEM');

-- CreateEnum
CREATE TYPE "ComissaoRegime" AS ENUM ('ANTECIPADA', 'PRO_RATA');

-- CreateEnum
CREATE TYPE "ComissaoStatus" AS ENUM ('PREVISTA', 'CREDITADA', 'PARCIAL_ESTORNADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "LancamentoTipo" AS ENUM ('CREDITO', 'DEBITO_CLAWBACK', 'AJUSTE');

-- CreateEnum
CREATE TYPE "RepasseStatus" AS ENUM ('ABERTO', 'PROCESSANDO', 'PAGO', 'FALHA');

-- AlterTable
ALTER TABLE "lojas" ADD COLUMN     "modoPagamentoComissao" "ModoPagamentoComissao" NOT NULL DEFAULT 'SPLIT_INSTANTANEO';

-- CreateTable
CREATE TABLE "comissoes" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "certificadoId" TEXT,
    "endossoId" TEXT,
    "tipo" "ComissaoTipo" NOT NULL DEFAULT 'LOJA',
    "regime" "ComissaoRegime" NOT NULL,
    "valorBase" DECIMAL(12,2) NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "parcelasTotais" INTEGER NOT NULL DEFAULT 12,
    "parcelasPagas" INTEGER NOT NULL DEFAULT 0,
    "valorEstornado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ComissaoStatus" NOT NULL DEFAULT 'PREVISTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta_corrente_lancamentos" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "tipo" "LancamentoTipo" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "saldoApos" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT NOT NULL,
    "comissaoId" TEXT,
    "memoriaCalculo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conta_corrente_lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasses" (
    "id" TEXT NOT NULL,
    "lote" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "valorLiquido" DECIMAL(12,2) NOT NULL,
    "status" "RepasseStatus" NOT NULL DEFAULT 'ABERTO',
    "comprovanteUrl" TEXT,
    "referenciaInicio" TIMESTAMP(3),
    "referenciaFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repasses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comissoes_lojaId_idx" ON "comissoes"("lojaId");

-- CreateIndex
CREATE INDEX "conta_corrente_lancamentos_lojaId_createdAt_idx" ON "conta_corrente_lancamentos"("lojaId", "createdAt");

-- CreateIndex
CREATE INDEX "repasses_lojaId_idx" ON "repasses"("lojaId");

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "certificados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_endossoId_fkey" FOREIGN KEY ("endossoId") REFERENCES "endossos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_corrente_lancamentos" ADD CONSTRAINT "conta_corrente_lancamentos_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_corrente_lancamentos" ADD CONSTRAINT "conta_corrente_lancamentos_comissaoId_fkey" FOREIGN KEY ("comissaoId") REFERENCES "comissoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

