ALTER TABLE "crisis_plans" ALTER COLUMN "deadline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crisis_plans" ADD COLUMN "target_date" timestamp;