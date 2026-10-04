ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "travel_mode" text DEFAULT 'driving' NOT NULL;
