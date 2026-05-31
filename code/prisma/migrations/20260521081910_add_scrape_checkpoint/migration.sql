-- CreateTable
CREATE TABLE "scrape_checkpoint" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "page_num" INTEGER NOT NULL DEFAULT 1,
    "last_url" TEXT,
    "offers_collected" INTEGER NOT NULL DEFAULT 0,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrape_checkpoint_store_id_idx" ON "scrape_checkpoint"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "scrape_checkpoint_store_id_category_key" ON "scrape_checkpoint"("store_id", "category");
