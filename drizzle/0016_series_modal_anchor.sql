-- Finish what 0015 started: re-anchor series whose EARLIEST instance is an outlier.
--
-- 0015 anchored every series on its earliest instance and only touched rows
-- sharing that instance's UTC time-of-day. That is wrong when the first
-- instance was individually moved: Dr. Nelson's office hours start with a
-- one-off Sep 9 slot at 3:00 PM while every other week is 2:30 PM, so 0015
-- matched nothing but the outlier and left Nov 4 onward at 1:30 PM EST.
--
-- Anchor on the series' MODAL UTC time-of-day instead (ties broken by the
-- earliest start), using the earliest row at that time as the anchor. The
-- rest is 0015 unchanged. For series 0015 already fixed this is a no-op: the
-- rows sharing the modal UTC time all already sit at the anchor's local time.

WITH tod_counts AS (
  SELECT
    series_id,
    start_time::time AS utc_tod,
    count(*) AS n,
    min(start_time) AS first_start
  FROM calendar_events
  WHERE series_id IS NOT NULL
  GROUP BY series_id, start_time::time
),
modal AS (
  SELECT DISTINCT ON (series_id) series_id, first_start
  FROM tod_counts
  ORDER BY series_id, n DESC, first_start
),
anchors AS (
  SELECT
    m.series_id,
    m.first_start AS anchor_start,
    COALESCE(u.timezone, 'America/New_York') AS tz,
    ((m.first_start AT TIME ZONE 'UTC')
      AT TIME ZONE COALESCE(u.timezone, 'America/New_York')) AS anchor_local
  FROM modal m
  JOIN users u ON u.id = (
    SELECT c.user_id FROM calendar_events c WHERE c.series_id = m.series_id LIMIT 1
  )
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
