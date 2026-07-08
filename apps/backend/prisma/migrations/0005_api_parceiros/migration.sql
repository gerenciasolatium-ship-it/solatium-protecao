-- M11 — API de parceiros: chaves por loja + propostas externas (link pré-preenchido)

-- CreateEnum
CREATE TYPE "StatusPropostaExterna" AS ENUM ('ABERTA', 'UTILIZADA', 'CONCLUIDA', 'EXPIRADA');

-- CreateTable
CREATE TABLE "parceiro_chaves_api" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "chaveHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUsoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parceiro_chaves_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propostas_externas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "chaveApiId" TEXT NOT NULL,
    "referenciaExterna" TEXT,
    "payload" JSONB NOT NULL,
    "status" "StatusPropostaExterna" NOT NULL DEFAULT 'ABERTA',
    "utilizadaEm" TIMESTAMP(3),
    "contratoId" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propostas_externas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parceiro_chaves_api_chaveHash_key" ON "parceiro_chaves_api"("chaveHash");

-- CreateIndex
CREATE UNIQUE INDEX "propostas_externas_codigo_key" ON "propostas_externas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "propostas_externas_contratoId_key" ON "propostas_externas"("contratoId");

-- CreateIndex
CREATE INDEX "propostas_externas_lojaId_status_idx" ON "propostas_externas"("lojaId", "status");

-- AddForeignKey
ALTER TABLE "parceiro_chaves_api" ADD CONSTRAINT "parceiro_chaves_api_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas_externas" ADD CONSTRAINT "propostas_externas_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas_externas" ADD CONSTRAINT "propostas_externas_chaveApiId_fkey" FOREIGN KEY ("chaveApiId") REFERENCES "parceiro_chaves_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas_externas" ADD CONSTRAINT "propostas_externas_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
