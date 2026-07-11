-- S5: vistoria remota antifraude (M2) — o cliente conclui pelo link no próprio aparelho.

-- AlterTable
ALTER TABLE "vistorias" ADD COLUMN "tokenPublico" TEXT,
ADD COLUMN "tokenExpiraEm" TIMESTAMP(3),
ADD COLUMN "linkEnviadoEm" TIMESTAMP(3),
ADD COLUMN "imeiInformado" TEXT,
ADD COLUMN "concluidaEm" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "vistorias_tokenPublico_key" ON "vistorias"("tokenPublico");
