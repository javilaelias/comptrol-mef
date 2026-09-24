-- AlterTable
ALTER TABLE "intangible_records" ADD COLUMN     "end_of_life_at" DATE,
ADD COLUMN     "entry_doc" VARCHAR(150),
ADD COLUMN     "po_date" DATE,
ADD COLUMN     "po_kind" VARCHAR(2),
ADD COLUMN     "po_subject" TEXT,
ADD COLUMN     "po_verified" BOOLEAN;
