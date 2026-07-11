-- S4: sinistros (M6) + índices de dashboard (M9/M13) + inadimplência (M5)
-- + correções da auditoria (ordem monotônica do livro-razão, status CANCELADO)

-- AlterEnum: cobrança substituída no balcão e cancelada no provedor.
ALTER TYPE "PagamentoStatus" ADD VALUE IF NOT EXISTS 'CANCELADO';

-- Livro-razão: ordem monotônica (uuid não ordena; createdAt colide no mesmo ms).
ALTER TABLE "conta_corrente_lancamentos" ADD COLUMN "seq" INTEGER;
CREATE SEQUENCE "conta_corrente_lancamentos_seq_seq" OWNED BY "conta_corrente_lancamentos"."seq";
UPDATE "conta_corrente_lancamentos" c
SET "seq" = sub.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "conta_corrente_lancamentos"
) sub
WHERE sub."id" = c."id";
SELECT setval(
  'conta_corrente_lancamentos_seq_seq',
  COALESCE((SELECT MAX("seq") FROM "conta_corrente_lancamentos"), 0) + 1,
  false
);
ALTER TABLE "conta_corrente_lancamentos"
  ALTER COLUMN "seq" SET DEFAULT nextval('conta_corrente_lancamentos_seq_seq'),
  ALTER COLUMN "seq" SET NOT NULL;
CREATE UNIQUE INDEX "conta_corrente_lancamentos_seq_key" ON "conta_corrente_lancamentos"("seq");

-- AlterTable: sinistros ganham loja de origem (denormalizada p/ sinistralidade
-- por loja), data do BO, motivo da negativa e carimbo da decisão.
ALTER TABLE "sinistros" ADD COLUMN     "lojaId" TEXT,
ADD COLUMN     "boData" TIMESTAMP(3),
ADD COLUMN     "motivoNegativa" TEXT,
ADD COLUMN     "decididoEm" TIMESTAMP(3);

-- Backfill: sinistros pré-existentes herdam a loja do certificado.
UPDATE "sinistros" s
SET "lojaId" = c."lojaId"
FROM "certificados" c
WHERE s."certificadoId" = c."id" AND s."lojaId" IS NULL;

ALTER TABLE "sinistros" ALTER COLUMN "lojaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "sinistros" ADD CONSTRAINT "sinistros_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "sinistros_lojaId_status_idx" ON "sinistros"("lojaId", "status");

-- CreateIndex
CREATE INDEX "certificados_lojaId_status_idx" ON "certificados"("lojaId", "status");

-- CreateIndex
CREATE INDEX "pagamentos_status_vencimento_idx" ON "pagamentos"("status", "vencimento");
