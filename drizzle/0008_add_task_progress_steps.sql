ALTER TABLE "tasks" ADD COLUMN "progress_steps" jsonb;
ALTER TABLE "tasks" ADD COLUMN "current_step_index" integer DEFAULT 0;
