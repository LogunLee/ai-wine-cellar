-- AlterTable
ALTER TABLE "discount_offer" ADD COLUMN     "grape_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "grapes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "discount_offer_grape_count_idx" ON "discount_offer"("grape_count");
