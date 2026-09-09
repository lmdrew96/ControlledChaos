CREATE TABLE "task_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_sessions" ADD CONSTRAINT "task_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sessions" ADD CONSTRAINT "task_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_sessions_user_start" ON "task_sessions" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_task_sessions_task" ON "task_sessions" USING btree ("task_id");--> statement-breakpoint
-- Backfill: every task that currently carries a planned start becomes its
-- first session. tasks.scheduled_for stays populated as the derived mirror of
-- the earliest session, so nothing that reads it changes behaviour here — this
-- only gives those same plans a row in the new source of truth.
--
-- `minutes` is left NULL deliberately: these blocks were always drawn at the
-- task's estimatedMinutes, and NULL means exactly that. Writing the estimate
-- in would freeze a copy that stops tracking edits to the task.
INSERT INTO task_sessions (task_id, user_id, starts_at, minutes)
SELECT t.id, t.user_id, t.scheduled_for, NULL
FROM tasks t
WHERE t.scheduled_for IS NOT NULL
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_sessions s
    WHERE s.task_id = t.id AND s.starts_at = t.scheduled_for
  );
