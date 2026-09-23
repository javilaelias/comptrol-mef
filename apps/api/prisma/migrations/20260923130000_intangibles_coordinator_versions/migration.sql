-- El coordinador puede subir varias versiones con el mismo corte ("version 1", "version 2"...).
-- La unicidad por corte queda solo para SIGA (un dump = un corte).
DROP INDEX "intangible_batches_tenant_id_source_cut_date_key";

CREATE INDEX "intangible_batches_tenant_id_source_cut_date_idx" ON "intangible_batches"("tenant_id", "source", "cut_date");

CREATE UNIQUE INDEX "intangible_batches_one_siga_per_cut" ON "intangible_batches"("tenant_id", "cut_date") WHERE "source" = 'siga';
