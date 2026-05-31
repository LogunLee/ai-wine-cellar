-- CreateEnum
CREATE TYPE "AiModelPurpose" AS ENUM ('IMAGE_RECOGNITION', 'TEXT_PROCESSING', 'AUDIO_PROCESSING');

-- CreateTable
CREATE TABLE "ai_model" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "purpose" "AiModelPurpose" NOT NULL,
    "api_key" TEXT NOT NULL,
    "base_url" TEXT,
    "prompt_config" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_model_purpose_is_default_idx" ON "ai_model"("purpose", "is_default");
