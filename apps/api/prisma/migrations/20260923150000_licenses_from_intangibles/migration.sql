-- AlterEnum
ALTER TYPE "LicenseStatus" ADD VALUE 'retired';

-- AlterEnum
ALTER TYPE "LicenseType" ADD VALUE 'perpetual';

-- AlterTable
ALTER TABLE "software_licenses" ADD COLUMN     "origin" VARCHAR(30) NOT NULL DEFAULT 'manual',
ADD COLUMN     "origin_key" VARCHAR(300);

-- CreateIndex
CREATE INDEX "software_licenses_tenant_id_origin_idx" ON "software_licenses"("tenant_id", "origin");


-- Una licencia por grupo de intangibles (idempotencia de la regeneracion)
CREATE UNIQUE INDEX "software_licenses_origin_key_unique" ON "software_licenses"("tenant_id", "origin", "origin_key") WHERE "origin_key" IS NOT NULL;
