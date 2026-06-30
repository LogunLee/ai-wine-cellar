-- AlterTable
ALTER TABLE "ai_task" ADD COLUMN     "requires_model" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user_task_setting" ALTER COLUMN "model_id" DROP NOT NULL;
