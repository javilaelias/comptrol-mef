-- CreateEnum
CREATE TYPE "IntangibleSource" AS ENUM ('siga', 'coordinator');

-- CreateEnum
CREATE TYPE "IntangibleStatus" AS ENUM ('active', 'retired');

-- CreateTable
CREATE TABLE "intangible_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source" "IntangibleSource" NOT NULL,
    "cut_date" DATE NOT NULL,
    "file_name" VARCHAR(200),
    "uploaded_by_id" UUID,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intangible_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intangible_records" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER,
    "patrimonial_code" VARCHAR(40) NOT NULL,
    "inventory_code" VARCHAR(40),
    "description" TEXT,
    "brand" VARCHAR(120),
    "model" VARCHAR(120),
    "status" "IntangibleStatus",
    "po_number" INTEGER,
    "po_year" INTEGER,
    "supplier_name" VARCHAR(250),
    "supplier_ruc" VARCHAR(20),
    "contract_number" VARCHAR(60),
    "registered_at" DATE,
    "initial_value" DECIMAL(14,2),
    "site_name" VARCHAR(160),
    "org_unit" VARCHAR(250),
    "physical_location" VARCHAR(300),
    "account_code" VARCHAR(30),
    "account_name" VARCHAR(160),
    "condition_norm" VARCHAR(40),
    "condition_raw" VARCHAR(120),
    "expires_at" DATE,
    "justification" TEXT,
    "hr" TEXT,
    "document" TEXT,
    "raw" JSONB,

    CONSTRAINT "intangible_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intangible_batches_tenant_id_source_is_current_idx" ON "intangible_batches"("tenant_id", "source", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "intangible_batches_tenant_id_source_cut_date_key" ON "intangible_batches"("tenant_id", "source", "cut_date");

-- CreateIndex
CREATE INDEX "intangible_records_batch_id_po_number_po_year_idx" ON "intangible_records"("batch_id", "po_number", "po_year");

-- CreateIndex
CREATE INDEX "intangible_records_batch_id_expires_at_idx" ON "intangible_records"("batch_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "intangible_records_batch_id_patrimonial_code_key" ON "intangible_records"("batch_id", "patrimonial_code");

-- AddForeignKey
ALTER TABLE "intangible_batches" ADD CONSTRAINT "intangible_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intangible_batches" ADD CONSTRAINT "intangible_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intangible_records" ADD CONSTRAINT "intangible_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "intangible_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Una sola version vigente por fuente y tenant
CREATE UNIQUE INDEX "intangible_batches_one_current_per_source" ON "intangible_batches"("tenant_id", "source") WHERE "is_current";
