-- AlterTable
ALTER TABLE "discount_offer" ADD COLUMN     "description" TEXT,
ADD COLUMN     "region_canonical" TEXT,
ADD COLUMN     "region_id" UUID,
ADD COLUMN     "region_key" TEXT;

-- AlterTable
ALTER TABLE "wine_card" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "wine_region" (
    "id" UUID NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "country" TEXT,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "status" TEXT NOT NULL DEFAULT 'resolved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wine_region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_alias" (
    "id" UUID NOT NULL,
    "region_key" TEXT NOT NULL,
    "raw_value" TEXT NOT NULL,
    "country" TEXT,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "region_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wine_region_canonical_key_key" ON "wine_region"("canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "region_alias_region_key_key" ON "region_alias"("region_key");

-- CreateIndex
CREATE INDEX "region_alias_region_id_idx" ON "region_alias"("region_id");

-- CreateIndex
CREATE INDEX "discount_offer_region_key_idx" ON "discount_offer"("region_key");

-- CreateIndex
CREATE INDEX "discount_offer_region_id_idx" ON "discount_offer"("region_id");

-- AddForeignKey
ALTER TABLE "region_alias" ADD CONSTRAINT "region_alias_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "wine_region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_offer" ADD CONSTRAINT "discount_offer_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "wine_region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
