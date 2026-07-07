-- CreateTable
CREATE TABLE "modelos_aparelho" (
    "id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "armazenamentoGb" INTEGER NOT NULL,
    "valorReferencia" DECIMAL(12,2) NOT NULL,
    "protecaoMensal" DECIMAL(12,2),
    "protecaoAnual" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_aparelho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modelos_aparelho_marca_modelo_armazenamentoGb_key" ON "modelos_aparelho"("marca", "modelo", "armazenamentoGb");
