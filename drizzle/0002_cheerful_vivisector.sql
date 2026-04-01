CREATE TABLE "crisis_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"task_name" text NOT NULL,
	"deadline" timestamp NOT NULL,
	"completion_pct" integer NOT NULL,
	"panic_level" text NOT NULL,
	"panic_label" text NOT NULL,
	"summary" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"current_task_index" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys_p256dh" text NOT NULL,
	"keys_auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "source_dump_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "location_tags" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "personality_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "calendar_start_hour" integer DEFAULT 7;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "calendar_end_hour" integer DEFAULT 22;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "week_start_day" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "calendar_export_token" text;--> statement-breakpoint
ALTER TABLE "crisis_plans" ADD CONSTRAINT "crisis_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_crisis_plans_user" ON "crisis_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_push_sub_user_endpoint" ON "push_subscriptions" USING btree ("user_id","endpoint");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_source_dump_id_brain_dumps_id_fk" FOREIGN KEY ("source_dump_id") REFERENCES "public"."brain_dumps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "location_tag";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "google_cal_connected";