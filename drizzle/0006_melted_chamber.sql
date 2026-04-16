ALTER TABLE "location_notification_log" DROP CONSTRAINT "location_notification_log_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "task_activity" DROP CONSTRAINT "task_activity_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "location_notification_log" ADD CONSTRAINT "location_notification_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
