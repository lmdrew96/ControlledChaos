-- Goal target dates are calendar days stored as UTC midnight (v2.79.1).
-- Rows written earlier by the MCP hold a full instant instead (e.g. local
-- end-of-day converted to UTC, 2027-05-16 03:59), which now reads a day late.
-- Rewrite each to the day it fell on in its owner's timezone — the day the old
-- code displayed. Rows already at UTC midnight are left alone.
UPDATE "goals" AS g
SET "target_date" = (((g."target_date" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(u."timezone", 'America/New_York'))::date)::timestamp
FROM "users" AS u
WHERE u."id" = g."user_id"
  AND g."target_date" IS NOT NULL
  AND g."target_date"::time <> '00:00:00';
