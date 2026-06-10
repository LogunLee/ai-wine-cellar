-- CreateTable
CREATE TABLE "wine_card" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "card_key" TEXT NOT NULL,
    "external_id" TEXT,
    "url" TEXT NOT NULL,
    "grapes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alcohol" DOUBLE PRECISION,
    "appellation" TEXT,
    "country" TEXT,
    "region" TEXT,
    "color" TEXT,
    "payload_json" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wine_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wine_card_store_id_idx" ON "wine_card"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "wine_card_store_id_card_key_key" ON "wine_card"("store_id", "card_key");

-- AddForeignKey
ALTER TABLE "wine_card" ADD CONSTRAINT "wine_card_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
