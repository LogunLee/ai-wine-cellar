-- CreateEnum
CREATE TYPE "StoreParserType" AS ENUM ('api', 'html', 'playwright', 'jina_fallback', 'manual');

-- CreateEnum
CREATE TYPE "ScrapeJobStatus" AS ENUM ('running', 'success', 'partial_success', 'failed');

-- CreateEnum
CREATE TYPE "DiscountConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('active', 'out_of_stock', 'expired', 'error', 'hidden');

-- CreateTable
CREATE TABLE "store" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parser_type" "StoreParserType" NOT NULL,
    "scrape_period_minutes" INTEGER NOT NULL DEFAULT 60,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "country" VARCHAR(2),
    "config_json" JSONB,
    "last_success_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_job" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "status" "ScrapeJobStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "found_count" INTEGER NOT NULL DEFAULT 0,
    "raw_created_count" INTEGER NOT NULL DEFAULT 0,
    "raw_updated_count" INTEGER NOT NULL DEFAULT 0,
    "normalized_created_count" INTEGER NOT NULL DEFAULT 0,
    "normalized_updated_count" INTEGER NOT NULL DEFAULT 0,
    "expired_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_offer" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "scrape_job_id" UUID,
    "external_id" TEXT,
    "raw_title" TEXT NOT NULL,
    "raw_url" TEXT NOT NULL,
    "raw_image_url" TEXT,
    "raw_current_price" DECIMAL(10,2),
    "raw_old_price" DECIMAL(10,2),
    "raw_discount_percent" INTEGER,
    "raw_availability" TEXT,
    "raw_payload_json" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_offer" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "raw_offer_id" UUID,
    "seller_name" TEXT NOT NULL,
    "wine_name_raw" TEXT NOT NULL,
    "producer" TEXT,
    "wine_name" TEXT,
    "full_name" TEXT,
    "vintage" TEXT,
    "country" TEXT,
    "region" TEXT,
    "origin_zone" TEXT,
    "wine_type" TEXT,
    "volume_ml" INTEGER,
    "current_price" DECIMAL(10,2) NOT NULL,
    "old_price" DECIMAL(10,2),
    "discount_percent" INTEGER,
    "discount_amount" DECIMAL(10,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "url" TEXT NOT NULL,
    "image_url" TEXT,
    "availability" TEXT,
    "confidence" "DiscountConfidence" NOT NULL DEFAULT 'medium',
    "status" "DiscountStatus" NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "discount_offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_code_key" ON "store"("code");

-- CreateIndex
CREATE INDEX "store_active_deleted_idx" ON "store"("active", "deleted");

-- CreateIndex
CREATE INDEX "scrape_job_store_id_created_at_idx" ON "scrape_job"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "raw_offer_store_id_collected_at_idx" ON "raw_offer"("store_id", "collected_at");

-- CreateIndex
CREATE INDEX "raw_offer_scrape_job_id_idx" ON "raw_offer"("scrape_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_offer_store_id_content_hash_key" ON "raw_offer"("store_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "discount_offer_raw_offer_id_key" ON "discount_offer"("raw_offer_id");

-- CreateIndex
CREATE INDEX "discount_offer_store_id_status_deleted_idx" ON "discount_offer"("store_id", "status", "deleted");

-- CreateIndex
CREATE INDEX "discount_offer_status_confidence_idx" ON "discount_offer"("status", "confidence");

-- CreateIndex
CREATE INDEX "discount_offer_discount_percent_idx" ON "discount_offer"("discount_percent");

-- CreateIndex
CREATE INDEX "discount_offer_current_price_idx" ON "discount_offer"("current_price");

-- CreateIndex
CREATE INDEX "discount_offer_last_checked_at_idx" ON "discount_offer"("last_checked_at");

-- CreateIndex
CREATE INDEX "discount_offer_wine_type_idx" ON "discount_offer"("wine_type");

-- CreateIndex
CREATE INDEX "discount_offer_country_idx" ON "discount_offer"("country");

-- AddForeignKey
ALTER TABLE "scrape_job" ADD CONSTRAINT "scrape_job_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_offer" ADD CONSTRAINT "raw_offer_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_offer" ADD CONSTRAINT "raw_offer_scrape_job_id_fkey" FOREIGN KEY ("scrape_job_id") REFERENCES "scrape_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_offer" ADD CONSTRAINT "discount_offer_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_offer" ADD CONSTRAINT "discount_offer_raw_offer_id_fkey" FOREIGN KEY ("raw_offer_id") REFERENCES "raw_offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
