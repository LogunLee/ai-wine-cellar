/*
  Warnings:

  - You are about to drop the column `owner_id` on the `cellar_item` table. All the data in the column will be lost.
  - You are about to drop the column `owner_id` on the `note` table. All the data in the column will be lost.
  - Added the required column `cellar_id` to the `cellar_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cellar_id` to the `note` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CellarMembershipRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- DropForeignKey
ALTER TABLE "cellar_item" DROP CONSTRAINT "cellar_item_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "note" DROP CONSTRAINT "note_owner_id_fkey";

-- DropIndex
DROP INDEX "cellar_item_owner_id_created_at_idx";

-- DropIndex
DROP INDEX "cellar_item_owner_id_status_idx";

-- DropIndex
DROP INDEX "cellar_item_owner_id_wine_vintage_id_idx";

-- DropIndex
DROP INDEX "note_owner_id_cellar_item_id_created_at_idx";

-- DropIndex
DROP INDEX "note_owner_id_note_type_idx";

-- AlterTable
ALTER TABLE "cellar_item" DROP COLUMN "owner_id",
ADD COLUMN     "cellar_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "note" DROP COLUMN "owner_id",
ADD COLUMN     "cellar_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "wine_cellar" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wine_cellar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cellar_membership" (
    "id" UUID NOT NULL,
    "cellar_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "CellarMembershipRole" NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "cellar_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wine_cellar_owner_id_idx" ON "wine_cellar"("owner_id");

-- CreateIndex
CREATE INDEX "cellar_membership_user_id_idx" ON "cellar_membership"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cellar_membership_cellar_id_user_id_key" ON "cellar_membership"("cellar_id", "user_id");

-- CreateIndex
CREATE INDEX "cellar_item_cellar_id_created_at_idx" ON "cellar_item"("cellar_id", "created_at");

-- CreateIndex
CREATE INDEX "cellar_item_cellar_id_status_idx" ON "cellar_item"("cellar_id", "status");

-- CreateIndex
CREATE INDEX "cellar_item_cellar_id_wine_vintage_id_idx" ON "cellar_item"("cellar_id", "wine_vintage_id");

-- CreateIndex
CREATE INDEX "note_cellar_id_cellar_item_id_created_at_idx" ON "note"("cellar_id", "cellar_item_id", "created_at");

-- CreateIndex
CREATE INDEX "note_cellar_id_note_type_idx" ON "note"("cellar_id", "note_type");

-- AddForeignKey
ALTER TABLE "wine_cellar" ADD CONSTRAINT "wine_cellar_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cellar_membership" ADD CONSTRAINT "cellar_membership_cellar_id_fkey" FOREIGN KEY ("cellar_id") REFERENCES "wine_cellar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cellar_membership" ADD CONSTRAINT "cellar_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cellar_item" ADD CONSTRAINT "cellar_item_cellar_id_fkey" FOREIGN KEY ("cellar_id") REFERENCES "wine_cellar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_cellar_id_fkey" FOREIGN KEY ("cellar_id") REFERENCES "wine_cellar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
