-- CreateEnum
CREATE TYPE "AiTaskScope" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "ai_provider" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "key_instructions" TEXT NOT NULL,
    "key_console_url" TEXT NOT NULL,
    "free_tier_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_model" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capabilities" TEXT[],
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_provider_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "AiTaskScope" NOT NULL,
    "required_capability" TEXT NOT NULL,
    "default_prompt" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL DEFAULT 1,
    "prompt_editable" BOOLEAN NOT NULL DEFAULT false,
    "recommended_model" TEXT,
    "trial_limit" INTEGER NOT NULL DEFAULT 10,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_provider_key" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "enc_key" BYTEA NOT NULL,
    "key_last4" TEXT NOT NULL,
    "is_valid" BOOLEAN,
    "checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_provider_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_task_setting" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_code" TEXT NOT NULL,
    "model_id" UUID NOT NULL,
    "custom_prompt" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_task_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_trial_usage" (
    "user_id" UUID NOT NULL,
    "task_code" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_trial_usage_pkey" PRIMARY KEY ("user_id","task_code")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_code_key" ON "ai_provider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_model_provider_id_code_key" ON "ai_provider_model"("provider_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ai_task_code_key" ON "ai_task"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_provider_key_user_id_provider_id_key" ON "user_provider_key"("user_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_task_setting_user_id_task_code_key" ON "user_task_setting"("user_id", "task_code");

-- AddForeignKey
ALTER TABLE "ai_provider_model" ADD CONSTRAINT "ai_provider_model_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_provider_key" ADD CONSTRAINT "user_provider_key_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_provider_key" ADD CONSTRAINT "user_provider_key_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_setting" ADD CONSTRAINT "user_task_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_setting" ADD CONSTRAINT "user_task_setting_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_provider_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trial_usage" ADD CONSTRAINT "ai_trial_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
