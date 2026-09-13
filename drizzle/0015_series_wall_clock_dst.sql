-- Re-anchor recurring series to wall-clock time so they survive DST.
--
-- Series created from the web dialog and the brain-dump routes were expanded
-- WITHOUT a timeZone, so expandRecurrence ran in server-local time — UTC on
-- Vercel. Every instance got the same UTC time-of-day, which is the right
-- LOCAL time only on one side of a DST transition: a 10:20 EDT class became
-- 9:20 EST after Nov 1. All-day series have the same defect (local midnight
-- EDT is 23:00 the previous day in EST). The MCP path already passed the zone
-- and is unaffected.
--
-- Fix, per series: take the earliest instance as the anchor, keep its LOCAL
-- wall-clock time, and place every other instance on its own day at that
-- local time. The day offset is measured in UTC dates, which is exact for the
-- broken rows because they all share one UTC time-of-day.
--   timed:   end = new start + the row's existing duration
--   all-day: end = the next local midnight (exclusive), per v2.53.0
--
-- Only rows sharing the anchor's UTC time-of-day are touched — that is the
-- signature of the bad expansion, and it leaves individually edited instances
-- alone. Rows already at the computed time are skipped, so this is idempotent:
-- after one run, post-DST rows no longer share the anchor's UTC time.

WITH anchors AS (
  SELECT DISTINCT ON (ce.series_id)
    ce.series_id,
    ce.start_time AS anchor_start,
    COALESCE(u.timezone, 'America/New_York') AS tz,
    ((ce.start_time AT TIME ZONE 'UTC')
      AT TIME ZONE COALESCE(u.timezone, 'America/New_York')) AS anchor_local
  FROM calendar_events ce
  JOIN users u ON u.id = ce.user_id
  WHERE ce.series_id IS NOT NULL
  ORDER BY ce.series_id, ce.start_time
),
locals AS (
  SELECT
    ce.id,
    ce.is_all_day,
    ce.start_time,
    ce.end_time,
    a.tz,
    a.anchor_local
      + ((ce.start_time::date - a.anchor_start::date) * interval '1 day') AS new_local
  FROM calendar_events ce
  JOIN anchors a ON a.series_id = ce.series_id
  WHERE ce.start_time::time = a.anchor_start::time
),
targets AS (
  SELECT
    l.id,
    (l.new_local AT TIME ZONE l.tz) AT TIME ZONE 'UTC' AS new_start,
    CASE
      WHEN l.is_all_day THEN
        ((l.new_local + interval '1 day') AT TIME ZONE l.tz) AT TIME ZONE 'UTC'
      ELSE
        ((l.new_local AT TIME ZONE l.tz) AT TIME ZONE 'UTC') + (l.end_time - l.start_time)
    END AS new_end
  FROM locals l
)
-- Compare BOTH columns: an all-day instance ON the fall-back day already has
-- the right start but a 24h end that stops at 23:00 local.
UPDATE calendar_events ce
SET
  start_time = t.new_start,
  end_time = t.new_end
FROM targets t
WHERE ce.id = t.id
  AND (
    ce.start_time IS DISTINCT FROM t.new_start
    OR ce.end_time IS DISTINCT FROM t.new_end
  );
