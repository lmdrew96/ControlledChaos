CREATE TABLE "medication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"medication_id" uuid NOT NULL,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"taken_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"dosage" text NOT NULL,
	"notes" text,
	"reminder_times" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_med_logs_user_med_date" ON "medication_logs" USING btree ("user_id","medication_id","scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_med_logs_unique_slot" ON "medication_logs" USING btree ("medication_id","scheduled_date","scheduled_time");--> statement-breakpoint
CREATE INDEX "idx_medications_user_active" ON "medications" USING btree ("user_id","is_active");