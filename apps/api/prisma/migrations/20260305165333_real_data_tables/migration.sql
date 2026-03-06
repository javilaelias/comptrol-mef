-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "acquisition_year" INTEGER,
ADD COLUMN     "condition_label" VARCHAR(40),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "inventory_code" VARCHAR(40),
ADD COLUMN     "org_unit_id" UUID;

-- CreateTable
CREATE TABLE "org_units" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "objective" TEXT,
    "owner_org_unit" VARCHAR(200),
    "status" VARCHAR(80),
    "last_update_year" INTEGER,
    "source_document" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_holdings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "category" VARCHAR(160),
    "executing_unit" VARCHAR(200),
    "software_name" VARCHAR(240) NOT NULL,
    "quantity_int" INTEGER,
    "quantity_text" VARCHAR(80),
    "source_sheet" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "license_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_units_tenant_id_idx" ON "org_units"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_tenant_id_name_key" ON "org_units"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "applications_tenant_id_idx" ON "applications"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_tenant_id_name_key" ON "applications"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "license_holdings_tenant_id_as_of_date_idx" ON "license_holdings"("tenant_id", "as_of_date");

-- CreateIndex
CREATE INDEX "license_holdings_tenant_id_software_name_idx" ON "license_holdings"("tenant_id", "software_name");

-- CreateIndex
CREATE INDEX "license_holdings_tenant_id_executing_unit_idx" ON "license_holdings"("tenant_id", "executing_unit");

-- CreateIndex
CREATE INDEX "assets_tenant_id_inventory_code_idx" ON "assets"("tenant_id", "inventory_code");

-- CreateIndex
CREATE INDEX "assets_tenant_id_org_unit_id_idx" ON "assets"("tenant_id", "org_unit_id");

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_holdings" ADD CONSTRAINT "license_holdings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
