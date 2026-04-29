CREATE TABLE "microtask_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"microtask_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"completed_date" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "microtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"emoji" text,
	"time_of_day" text DEFAULT 'anytime' NOT NULL,
	"days_of_week" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "microtask_completions" ADD CONSTRAINT "microtask_completions_microtask_id_microtasks_id_fk" FOREIGN KEY ("microtask_id") REFERENCES "public"."microtasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microtask_completions" ADD CONSTRAINT "microtask_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microtasks" ADD CONSTRAINT "microtasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mc_user_date" ON "microtask_completions" USING btree ("user_id","completed_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mc_microtask_date_unique" ON "microtask_completions" USING btree ("microtask_id","completed_date");--> statement-breakpoint
CREATE INDEX "idx_microtasks_user_active" ON "microtasks" USING btree ("user_id","active");