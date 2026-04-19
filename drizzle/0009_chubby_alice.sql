ALTER TABLE "tasks" ADD COLUMN "source_event_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tasks_user_source_event" ON "tasks" USING btree ("user_id","source_event_id");