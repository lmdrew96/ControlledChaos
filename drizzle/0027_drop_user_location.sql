DROP TABLE "commute_times" CASCADE;--> statement-breakpoint
DROP TABLE "locations" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "location_tags";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "travel_mode";