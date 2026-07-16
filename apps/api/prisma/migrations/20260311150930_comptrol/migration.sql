-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "cpu_cores" INTEGER,
ADD COLUMN     "cpu_logical" INTEGER,
ADD COLUMN     "cpu_model" VARCHAR(200),
ADD COLUMN     "last_inventory_at" TIMESTAMPTZ(6),
ADD COLUMN     "os_version" VARCHAR(120),
ADD COLUMN     "ram_mb" INTEGER,
ADD COLUMN     "storage_gb" INTEGER;

-- CreateTable
CREATE TABLE "software_installations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "version" VARCHAR(120),
    "publisher" VARCHAR(200),
    "detected_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "software_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "software_installations_tenant_id_asset_id_idx" ON "software_installations"("tenant_id", "asset_id");

-- CreateIndex
CREATE INDEX "software_installations_tenant_id_name_idx" ON "software_installations"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "assets_tenant_id_last_inventory_at_idx" ON "assets"("tenant_id", "last_inventory_at" DESC);

-- AddForeignKey
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
