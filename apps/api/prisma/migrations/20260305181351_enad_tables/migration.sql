-- CreateTable
CREATE TABLE "enad_surveys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "as_of_date" DATE NOT NULL,
    "source_document" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enad_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enad_raw_pages" (
    "id" BIGSERIAL NOT NULL,
    "survey_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enad_raw_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enad_items" (
    "id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "question_code" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "value1" DECIMAL(18,2),
    "value2" DECIMAL(18,2),
    "value_text" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enad_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enad_manual_answers" (
    "id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "question_code" INTEGER NOT NULL,
    "selected_option_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer_text" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enad_manual_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enad_surveys_tenant_id_as_of_date_idx" ON "enad_surveys"("tenant_id", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "enad_surveys_tenant_id_year_key" ON "enad_surveys"("tenant_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "enad_raw_pages_survey_id_page_number_key" ON "enad_raw_pages"("survey_id", "page_number");

-- CreateIndex
CREATE INDEX "enad_items_survey_id_question_code_idx" ON "enad_items"("survey_id", "question_code");

-- CreateIndex
CREATE INDEX "enad_items_survey_id_code_idx" ON "enad_items"("survey_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "enad_manual_answers_survey_id_question_code_key" ON "enad_manual_answers"("survey_id", "question_code");

-- AddForeignKey
ALTER TABLE "enad_surveys" ADD CONSTRAINT "enad_surveys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enad_raw_pages" ADD CONSTRAINT "enad_raw_pages_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "enad_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enad_items" ADD CONSTRAINT "enad_items_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "enad_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enad_manual_answers" ADD CONSTRAINT "enad_manual_answers_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "enad_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
