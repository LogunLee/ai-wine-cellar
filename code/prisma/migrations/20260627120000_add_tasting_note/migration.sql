-- CreateTable
CREATE TABLE "tasting_note" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cellar_item_id" UUID NOT NULL,
    "vintage" INTEGER,
    "tasting_date" DATE NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL,
    "note_text" TEXT,
    "vivino_note_text" TEXT,
    "vivino_note_created_at" TIMESTAMP(3),
    "vivino_note_updated_at" TIMESTAMP(3),
    "place" TEXT,
    "price" DECIMAL(10,2),
    "would_buy_again" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tasting_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasting_note_user_id_deleted_at_tasting_date_created_at_idx" ON "tasting_note"("user_id", "deleted_at", "tasting_date", "created_at");

-- CreateIndex
CREATE INDEX "tasting_note_cellar_item_id_idx" ON "tasting_note"("cellar_item_id");

-- AddForeignKey
ALTER TABLE "tasting_note" ADD CONSTRAINT "tasting_note_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_note" ADD CONSTRAINT "tasting_note_cellar_item_id_fkey" FOREIGN KEY ("cellar_item_id") REFERENCES "cellar_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data integrity (spec §24.1): rating 1..5 in 0.1 steps, free-text length caps.
ALTER TABLE "tasting_note" ADD CONSTRAINT "tasting_note_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);
ALTER TABLE "tasting_note" ADD CONSTRAINT "tasting_note_rating_step" CHECK (("rating" * 10) = floor("rating" * 10));
ALTER TABLE "tasting_note" ADD CONSTRAINT "tasting_note_note_text_len" CHECK (char_length("note_text") <= 5000);
ALTER TABLE "tasting_note" ADD CONSTRAINT "tasting_note_vivino_note_text_len" CHECK (char_length("vivino_note_text") <= 5000);
