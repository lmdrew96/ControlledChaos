-- Normalize existing all-day calendar events onto the local-midnight convention.
--
-- All-day rows were written by parsing a naive "YYYY-MM-DDT00:00:00" string with
-- `new Date()`, which resolves in the RUNTIME's timezone: local on a dev machine,
-- UTC on Vercel. Production rows therefore sit at UTC midnight — 4-5 hours before
-- local midnight for a US user — which puts them inside the PREVIOUS day's range,
-- because every range boundary is built with startOfDayInTimezone().
--
-- Target convention (now shared by creation, editing, Canvas sync, the AI parser,
-- iCal export and all range queries):
--   start_time = the instant of LOCAL midnight on the event's day
--   end_time   = the instant of LOCAL midnight on the NEXT day (exclusive)
--
-- The intended calendar day is read from the stored value's UTC date. That is
-- correct for the rows this fixes: they were written AS UTC midnight, so their
-- UTC date is exactly the date the user picked.
--
-- Rows already sitting at local midnight are skipped by the WHERE clause, which
-- makes this idempotent and safe to re-run, and leaves dev-created rows (already
-- correct) alone.
--
-- The `AT TIME ZONE` pairs below are a deliberate naive -> zoned -> naive round
-- trip, not an accidental double conversion: the columns are `timestamp without
-- time zone` holding UTC wall-clock, so the value must be re-interpreted in the
-- user's zone and then rendered back as UTC.

UPDATE calendar_events ce
SET
  start_time = (
    ((ce.start_time::date)::timestamp
      AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))
      AT TIME ZONE 'UTC'
  ),
  end_time = (
    (((ce.start_time::date + 1)::timestamp
      AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))
      AT TIME ZONE 'UTC')
  )
FROM users u
WHERE ce.user_id = u.id
  AND ce.is_all_day = true
  -- Skip anything already stored at local midnight.
  AND ((ce.start_time AT TIME ZONE 'UTC')
        AT TIME ZONE COALESCE(u.timezone, 'America/New_York'))::time <> TIME '00:00:00';
