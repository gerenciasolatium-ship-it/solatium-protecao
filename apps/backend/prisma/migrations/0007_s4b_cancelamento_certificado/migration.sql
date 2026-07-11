-- S4b: rastreio de cancelamento no certificado (dashboards de churn/recebimento)

-- AlterTable
ALTER TABLE "certificados" ADD COLUMN "canceladoEm" TIMESTAMP(3),
ADD COLUMN "motivoCancelamento" TEXT;

-- Backfill: cancelados pré-existentes herdam a data da última atualização.
UPDATE "certificados"
SET "canceladoEm" = "updatedAt"
WHERE "status" = 'CANCELADO' AND "canceladoEm" IS NULL;
