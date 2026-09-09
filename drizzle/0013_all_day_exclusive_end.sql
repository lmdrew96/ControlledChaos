-- Finish what 0012 started: normalize all-day END times too.
--
-- 0012 assumed the rows it needed to fix were the ones written AS UTC midnight
-- by the create-event-dialog path, and used "start is already local midnight"
-- as its skip condition. Against the real data that assumption was wrong in a
-- way that made it a no-op: every existing all-day row already had a correct
-- local-midnight START (they came through the AI brain-dump path, which ran
-- startTime through toUTC and was accidentally right), but an END of 23:59:59
-- local — the old convention. 0012 skipped all of them on the start check and
-- therefore never touched the ends.
--
-- A stale end is not cosmetic after v2.53.0. The iCal export now formats
-- DTEND straight from end_time, and DTEND for VALUE=DATE is EXCLUSIVE, so an
-- end of 23:59 local on day D resolves to day D and the event renders as
-- zero-length — it disappears from subscribed calendars.
--
-- This migration keys off the LOCAL date of start_time and rewrites both
-- columns to the canonical pair, so it is correct whatever shape a row is in:
--   start_time = instant of local midnight on that date
--   end_time   = instant of local midnight the NEXT day (exclusive)
--
-- The WHERE clause updates only rows that are not already exactly that, which
-- makes it idempotent at any UTC offset (0012's guard was only idempotent at
-- non-positive offsets).

UPDATE calendar_events ce
SET
  start_time = (
    (
      (((ce.start_time AT TIME ZONE 'UTC')
        AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))::date)::timestamp
      AT TIME ZONE COALESCE(u.timezone, 'America/New_York')
    ) AT TIME ZONE 'UTC'
  ),
  end_time = (
    (
      (((ce.start_time AT TIME ZONE 'UTC')
        AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))::date + 1)::timestamp
      AT TIME ZONE COALESCE(u.timezone, 'America/New_York')
    ) AT TIME ZONE 'UTC'
  )
FROM users u
WHERE ce.user_id = u.id
  AND ce.is_all_day = true
  AND (
    ce.start_time IS DISTINCT FROM (
      (
        (((ce.start_time AT TIME ZONE 'UTC')
          AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))::date)::timestamp
        AT TIME ZONE COALESCE(u.timezone, 'America/New_York')
      ) AT TIME ZONE 'UTC'
    )
    OR ce.end_time IS DISTINCT FROM (
      (
        (((ce.start_time AT TIME ZONE 'UTC')
          AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))::date + 1)::timestamp
        AT TIME ZONE COALESCE(u.timezone, 'America/New_York')
      ) AT TIME ZONE 'UTC'
    )
  );
