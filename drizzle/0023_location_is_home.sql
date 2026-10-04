ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_home" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- A saved location already named "Home" becomes home, one per user, unless
-- that user already has one (keeps this safe to run twice).
UPDATE "locations" SET "is_home" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("user_id") "id" FROM "locations"
  WHERE lower(trim("name")) = 'home'
    AND "user_id" NOT IN (SELECT "user_id" FROM "locations" WHERE "is_home")
  ORDER BY "user_id", "created_at"
);
