-- Map each finance category to a default jar per finance model.
CREATE TABLE "finance_category_jar_mappings" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "financeModelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "jarId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_category_jar_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_category_jar_mappings_financeModelId_categoryId_key"
    ON "finance_category_jar_mappings"("financeModelId", "categoryId");

CREATE INDEX "finance_category_jar_mappings_familyId_idx"
    ON "finance_category_jar_mappings"("familyId");

CREATE INDEX "finance_category_jar_mappings_financeModelId_idx"
    ON "finance_category_jar_mappings"("financeModelId");

CREATE INDEX "finance_category_jar_mappings_categoryId_idx"
    ON "finance_category_jar_mappings"("categoryId");

CREATE INDEX "finance_category_jar_mappings_jarId_idx"
    ON "finance_category_jar_mappings"("jarId");

ALTER TABLE "finance_category_jar_mappings"
    ADD CONSTRAINT "finance_category_jar_mappings_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_category_jar_mappings"
    ADD CONSTRAINT "finance_category_jar_mappings_financeModelId_fkey"
    FOREIGN KEY ("financeModelId") REFERENCES "finance_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_category_jar_mappings"
    ADD CONSTRAINT "finance_category_jar_mappings_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "finance_category_jar_mappings"
    ADD CONSTRAINT "finance_category_jar_mappings_jarId_fkey"
    FOREIGN KEY ("jarId") REFERENCES "finance_jars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
