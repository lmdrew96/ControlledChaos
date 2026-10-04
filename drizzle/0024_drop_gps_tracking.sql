DROP TABLE IF EXISTS "location_notification_log" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "user_locations" CASCADE;--> statement-breakpoint
ALTER TABLE "locations" DROP COLUMN IF EXISTS "radius_meters";
