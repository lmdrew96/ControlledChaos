CREATE TABLE "snoozed_pushes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "payload" jsonb NOT NULL,
  "send_after" timestamp NOT NULL,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_snoozed_pushes_pending" ON "snoozed_pushes" ("user_id", "send_after");
