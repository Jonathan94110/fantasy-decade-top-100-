-- One-time rename for saved games, matching lib/historical-data.ts:
--  * historical performance IDs: `"prime-rushmore:...` -> `"historical:...`
--  * historical "View source" links from the old source repository ->
--    `/historical-coverage.json#<revision>/<file>:L<line>`, and its validation
--    report link -> `/historical-coverage.json`.
-- Only tables that store game state are touched; statistics and everything else
-- in the saved state stay exactly as saved. Revisions are left alone: the
-- server rebuilds each next state from the stored row (open sessions never send
-- performance IDs back), and the column must keep matching `state.revision`.
UPDATE `leagues` SET `state` = REPLACE(REPLACE(REPLACE(REPLACE(`state`, '"prime-rushmore:', '"historical:'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/VALIDATION_REPORT.md', '/historical-coverage.json'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/data/sheets/', '/historical-coverage.json#bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/'), '.csv#L', '.csv:L') WHERE `state` LIKE '%prime-rushmore%';
--> statement-breakpoint
UPDATE `season_leagues` SET `state` = REPLACE(REPLACE(REPLACE(REPLACE(`state`, '"prime-rushmore:', '"historical:'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/VALIDATION_REPORT.md', '/historical-coverage.json'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/data/sheets/', '/historical-coverage.json#bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/'), '.csv#L', '.csv:L') WHERE `state` LIKE '%prime-rushmore%';
--> statement-breakpoint
UPDATE `demo_drafts` SET `state` = REPLACE(REPLACE(REPLACE(REPLACE(`state`, '"prime-rushmore:', '"historical:'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/VALIDATION_REPORT.md', '/historical-coverage.json'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/data/sheets/', '/historical-coverage.json#bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/'), '.csv#L', '.csv:L') WHERE `state` LIKE '%prime-rushmore%';
--> statement-breakpoint
UPDATE `demo_archives` SET `state` = REPLACE(REPLACE(REPLACE(REPLACE(`state`, '"prime-rushmore:', '"historical:'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/VALIDATION_REPORT.md', '/historical-coverage.json'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/data/sheets/', '/historical-coverage.json#bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/'), '.csv#L', '.csv:L') WHERE `state` LIKE '%prime-rushmore%';
--> statement-breakpoint
UPDATE `demo_scoring_backups` SET `state` = REPLACE(REPLACE(REPLACE(REPLACE(`state`, '"prime-rushmore:', '"historical:'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/VALIDATION_REPORT.md', '/historical-coverage.json'), 'https://github.com/Jonathan94110/prime-rushmore/blob/bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/fantasy-legends/data/sheets/', '/historical-coverage.json#bbfc22cc51b0f0a80aff2c1d6d7f4d32b219d356/'), '.csv#L', '.csv:L') WHERE `state` LIKE '%prime-rushmore%';
