CREATE TABLE "crisis_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crisis_plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crisis_messages" ADD CONSTRAINT "crisis_messages_crisis_plan_id_crisis_plans_id_fk" FOREIGN KEY ("crisis_plan_id") REFERENCES "public"."crisis_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_messages" ADD CONSTRAINT "crisis_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_crisis_messages_plan" ON "crisis_messages" USING btree ("crisis_plan_id","created_at");
