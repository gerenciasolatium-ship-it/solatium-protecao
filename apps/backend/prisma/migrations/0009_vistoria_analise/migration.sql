-- Vistoria v2: resultado consolidado das checagens antifraude da conclusão
-- (OCR do IMEI na foto, geofence contra a loja, device check).

-- AlterTable
ALTER TABLE "vistorias" ADD COLUMN "analise" JSONB;
