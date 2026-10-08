-- Rollback aid for migration 0008_bounded_week_records. Pause saves and take
-- a D1 Time Travel bookmark first; run it before serving app code older than
-- that migration.
-- It copies the weeks each split row lists back into that row, in order, and
-- drops the week list, giving the single-row format that older code reads.
-- A row is skipped if any listed week is missing or if the rebuilt state would
-- exceed D1's 2,000,000-byte row limit. Older code cannot use the rows it
-- skips: their `history` is null, so it returns an error for them.
-- Finally it deletes the week rows that no split row still lists, so a later
-- return to the new code saves those weeks afresh instead of colliding.
UPDATE season_leagues SET state = json_remove(json_set(state, '$.history', json((
  SELECT json_group_array(json(r.state) ORDER BY h.key)
  FROM json_each(season_leagues.state, '$.historyRecords') AS h
  JOIN season_league_rounds AS r ON r.league_id = season_leagues.id AND r.number = h.value
))), '$.historyRecords')
WHERE json_type(state, '$.historyRecords') = 'array' AND json_type(state, '$.history') = 'null'
  AND (SELECT COUNT(*) FROM json_each(season_leagues.state, '$.historyRecords') AS h
       JOIN season_league_rounds AS r ON r.league_id = season_leagues.id AND r.number = h.value) = json_array_length(state, '$.historyRecords')
  AND length(CAST(state AS BLOB)) + (SELECT COALESCE(SUM(length(CAST(r.state AS BLOB))) + COUNT(*), 0)
       FROM json_each(season_leagues.state, '$.historyRecords') AS h
       JOIN season_league_rounds AS r ON r.league_id = season_leagues.id AND r.number = h.value) < 2000000;

UPDATE demo_drafts SET state = json_remove(json_set(state, '$.season.history', json((
  SELECT json_group_array(json(r.state) ORDER BY h.key)
  FROM json_each(demo_drafts.state, '$.season.historyRecords') AS h
  JOIN demo_draft_rounds AS r ON r.draft_id = demo_drafts.id AND r.number = h.value
))), '$.season.historyRecords')
WHERE json_type(state, '$.season.historyRecords') = 'array' AND json_type(state, '$.season.history') = 'null'
  AND (SELECT COUNT(*) FROM json_each(demo_drafts.state, '$.season.historyRecords') AS h
       JOIN demo_draft_rounds AS r ON r.draft_id = demo_drafts.id AND r.number = h.value) = json_array_length(state, '$.season.historyRecords')
  AND length(CAST(state AS BLOB)) + (SELECT COALESCE(SUM(length(CAST(r.state AS BLOB))) + COUNT(*), 0)
       FROM json_each(demo_drafts.state, '$.season.historyRecords') AS h
       JOIN demo_draft_rounds AS r ON r.draft_id = demo_drafts.id AND r.number = h.value) < 2000000;

UPDATE demo_archives SET state = json_remove(json_set(state, '$.season.history', json((
  SELECT json_group_array(json(r.state) ORDER BY h.key)
  FROM json_each(demo_archives.state, '$.season.historyRecords') AS h
  JOIN demo_draft_rounds AS r ON r.draft_id = demo_archives.id AND r.number = h.value
))), '$.season.historyRecords')
WHERE json_type(state, '$.season.historyRecords') = 'array' AND json_type(state, '$.season.history') = 'null'
  AND (SELECT COUNT(*) FROM json_each(demo_archives.state, '$.season.historyRecords') AS h
       JOIN demo_draft_rounds AS r ON r.draft_id = demo_archives.id AND r.number = h.value) = json_array_length(state, '$.season.historyRecords')
  AND length(CAST(state AS BLOB)) + (SELECT COALESCE(SUM(length(CAST(r.state AS BLOB))) + COUNT(*), 0)
       FROM json_each(demo_archives.state, '$.season.historyRecords') AS h
       JOIN demo_draft_rounds AS r ON r.draft_id = demo_archives.id AND r.number = h.value) < 2000000;

DELETE FROM season_league_rounds WHERE NOT EXISTS (
  SELECT 1 FROM season_leagues AS l, json_each(l.state, '$.historyRecords') AS h
  WHERE l.id = season_league_rounds.league_id AND h.value = season_league_rounds.number);

DELETE FROM demo_draft_rounds WHERE NOT EXISTS (
  SELECT 1 FROM demo_drafts AS d, json_each(d.state, '$.season.historyRecords') AS h
  WHERE d.id = demo_draft_rounds.draft_id AND h.value = demo_draft_rounds.number)
 AND NOT EXISTS (
  SELECT 1 FROM demo_archives AS a, json_each(a.state, '$.season.historyRecords') AS h
  WHERE a.id = demo_draft_rounds.draft_id AND h.value = demo_draft_rounds.number);
