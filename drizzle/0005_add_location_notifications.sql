-- User Locations: stores last known position for geofence notifications
CREATE TABLE IF NOT EXISTS "user_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "latitude" numeric(10, 8) NOT NULL,
  "longitude" numeric(11, 8) NOT NULL,
  "matched_location_id" uuid REFERENCES "locations"("id"),
  "matched_location_name" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_locations_user_id_unique" UNIQUE("user_id")
);

-- Location Notification Log: dedup for geofence arrival/departure triggers
CREATE TABLE IF NOT EXISTS "location_notification_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "location_id" uuid NOT NULL REFERENCES "locations"("id"),
  "task_id" uuid REFERENCES "tasks"("id"),
  "event" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_loc_notif_log_user_loc"
  ON "location_notification_log" ("user_id", "location_id", "created_at");
