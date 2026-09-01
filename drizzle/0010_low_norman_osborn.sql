ALTER TABLE "tasks" ADD COLUMN "target_date" timestamp;--> statement-breakpoint
CREATE INDEX "idx_tasks_user_target" ON "tasks" USING btree ("user_id","target_date");