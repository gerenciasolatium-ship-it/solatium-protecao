-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'CARTAO_RECORRENTE', 'CARTAO_ANUAL', 'BOLETO');

-- CreateEnum
CREATE TYPE "ContratoStatus" AS ENUM ('AGUARDANDO_PAGAMENTO', 'ATIVO', 'CANCELADO');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "asaasCustomerId" TEXT;

-- AlterTable
ALTER TABLE "aparelhos" ADD COLUMN     "armazenamentoGb" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cor" TEXT;

-- AlterTable
ALTER TABLE "planos" ADD COLUMN     "franquiaPercentual" DECIMAL(5,2) NOT NULL DEFAULT 25;

-- AlterTable
ALTER TABLE "certificados" ADD COLUMN     "contratoId" TEXT,
ADD COLUMN     "emailEnviadoEm" TIMESTAMP(3),
ADD COLUMN     "formaPagamento" "FormaPagamento",
ADD COLUMN     "whatsappEnviadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "contratoId" TEXT,
ADD COLUMN     "primeiraCobranca" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "vistoriaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "premioTotal" DECIMAL(12,2) NOT NULL,
    "checkout" JSONB,
    "status" "ContratoStatus" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificado_series" (
    "ano" INTEGER NOT NULL,
    "proximo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "certificado_series_pkey" PRIMARY KEY ("ano")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_vistoriaId_key" ON "contratos"("vistoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_contratoId_key" ON "certificados"("contratoId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_asaasId_key" ON "pagamentos"("asaasId");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_vistoriaId_fkey" FOREIGN KEY ("vistoriaId") REFERENCES "vistorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_aparelhoId_fkey" FOREIGN KEY ("aparelhoId") REFERENCES "aparelhos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

