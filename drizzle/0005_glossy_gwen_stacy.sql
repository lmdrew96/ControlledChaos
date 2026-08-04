DROP TABLE "friendships" CASCADE;--> statement-breakpoint
DROP TABLE "nudges" CASCADE;--> statement-breakpoint
DROP TABLE "room_members" CASCADE;--> statement-breakpoint
DROP TABLE "rooms" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "room_visibility";