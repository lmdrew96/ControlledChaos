CREATE TABLE IF NOT EXISTS "reference_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL CONSTRAINT "reference_cards_user_id_users_id_fk" REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"days_of_week" jsonb,
	"show_from" text,
	"show_until" text,
	"checklist_reset" text DEFAULT 'daily' NOT NULL,
	"checked_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_on" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reference_cards_user" ON "reference_cards" USING btree ("user_id");
