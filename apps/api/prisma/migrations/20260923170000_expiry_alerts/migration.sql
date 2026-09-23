-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'dismissed', 'auto_resolved');

-- CreateTable
CREATE TABLE "alert_rules" (
    "tenant_id" UUID NOT NULL,
    "days_before" INTEGER[] DEFAULT ARRAY[90, 60, 30, 7]::INTEGER[],
    "include_expired" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "threshold_days" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_tenant_id_status_idx" ON "alerts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_tenant_id_kind_target_id_threshold_days_due_date_key" ON "alerts"("tenant_id", "kind", "target_id", "threshold_days", "due_date");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

