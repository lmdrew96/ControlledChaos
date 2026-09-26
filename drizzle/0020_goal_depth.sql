ALTER TABLE "goals" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "reflection" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "sort_order" integer;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;