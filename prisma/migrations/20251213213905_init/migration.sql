-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "WineType" AS ENUM ('RED', 'WHITE', 'ROSE', 'SPARKLING', 'SWEET', 'FORTIFIED', 'OTHER');

-- CreateEnum
CREATE TYPE "CellarItemStatus" AS ENUM ('IN_CELLAR', 'CONSUMED', 'GIFTED', 'LOST');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('TASTING', 'AI_ANSWER', 'MANUAL', 'PURCHASE', 'OTHER');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "login" TEXT,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credential" (
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credential_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "oauth_identity" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "provider_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country" (
    "id" UUID NOT NULL,
    "iso2" CHAR(2) NOT NULL,
    "iso3" CHAR(3),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grape_variety" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grape_variety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grape_name_mapping" (
    "id" UUID NOT NULL,
    "grape_id" UUID NOT NULL,
    "input_text" TEXT NOT NULL,
    "input_text_normalized" TEXT NOT NULL,
    "locale" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grape_name_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wine_series" (
    "id" UUID NOT NULL,
    "producer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_id" UUID NOT NULL,
    "region" TEXT,
    "appellation" TEXT,
    "wine_type" "WineType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wine_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wine_vintage" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "vintage_year" INTEGER,
    "alcohol_abv" DECIMAL(4,2),
    "volume_ml" INTEGER,
    "composition" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wine_vintage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cellar_item" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "wine_vintage_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "CellarItemStatus" NOT NULL DEFAULT 'IN_CELLAR',
    "acquired_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "purchase_price" DECIMAL(10,2),
    "currency" VARCHAR(3),
    "photo_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cellar_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "cellar_item_id" UUID NOT NULL,
    "note_type" "NoteType" NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "rating" DECIMAL(3,1),
    "tasted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_login_key" ON "user"("login");

-- CreateIndex
CREATE INDEX "oauth_identity_user_id_idx" ON "oauth_identity"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identity_provider_provider_user_id_key" ON "oauth_identity"("provider", "provider_user_id");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_expires_at_idx" ON "refresh_token"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "country_iso2_key" ON "country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "country_iso3_key" ON "country"("iso3");

-- CreateIndex
CREATE UNIQUE INDEX "grape_variety_name_key" ON "grape_variety"("name");

-- CreateIndex
CREATE INDEX "grape_name_mapping_grape_id_idx" ON "grape_name_mapping"("grape_id");

-- CreateIndex
CREATE UNIQUE INDEX "grape_name_mapping_input_text_normalized_key" ON "grape_name_mapping"("input_text_normalized");

-- CreateIndex
CREATE INDEX "wine_series_country_id_idx" ON "wine_series"("country_id");

-- CreateIndex
CREATE INDEX "wine_series_wine_type_idx" ON "wine_series"("wine_type");

-- CreateIndex
CREATE INDEX "wine_vintage_series_id_idx" ON "wine_vintage"("series_id");

-- CreateIndex
CREATE UNIQUE INDEX "wine_vintage_series_id_vintage_year_key" ON "wine_vintage"("series_id", "vintage_year");

-- CreateIndex
CREATE INDEX "cellar_item_owner_id_created_at_idx" ON "cellar_item"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "cellar_item_owner_id_status_idx" ON "cellar_item"("owner_id", "status");

-- CreateIndex
CREATE INDEX "cellar_item_owner_id_wine_vintage_id_idx" ON "cellar_item"("owner_id", "wine_vintage_id");

-- CreateIndex
CREATE INDEX "note_owner_id_cellar_item_id_created_at_idx" ON "note"("owner_id", "cellar_item_id", "created_at");

-- CreateIndex
CREATE INDEX "note_owner_id_note_type_idx" ON "note"("owner_id", "note_type");

-- AddForeignKey
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_identity" ADD CONSTRAINT "oauth_identity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grape_name_mapping" ADD CONSTRAINT "grape_name_mapping_grape_id_fkey" FOREIGN KEY ("grape_id") REFERENCES "grape_variety"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wine_series" ADD CONSTRAINT "wine_series_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wine_vintage" ADD CONSTRAINT "wine_vintage_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "wine_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cellar_item" ADD CONSTRAINT "cellar_item_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cellar_item" ADD CONSTRAINT "cellar_item_wine_vintage_id_fkey" FOREIGN KEY ("wine_vintage_id") REFERENCES "wine_vintage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_cellar_item_id_fkey" FOREIGN KEY ("cellar_item_id") REFERENCES "cellar_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
