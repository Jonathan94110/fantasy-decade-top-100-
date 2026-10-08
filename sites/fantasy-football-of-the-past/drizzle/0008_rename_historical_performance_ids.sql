-- One-time rename of saved historical game-log performance IDs to the
-- `historical:` prefix used by lib/historical-data.ts. Only quoted ID values
-- (`"prime-rushmore:...`) change; recorded source URLs and every statistic stay
-- as saved. Live rows get a new revision so open sessions reload instead of
-- writing the old IDs back; archives and backups keep their recorded revisions.
UPDATE `leagues` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:'), `revision` = `revision` + 1 WHERE `state` LIKE '%"prime-rushmore:%';
--> statement-breakpoint
UPDATE `season_leagues` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:'), `revision` = `revision` + 1 WHERE `state` LIKE '%"prime-rushmore:%';
--> statement-breakpoint
UPDATE `demo_drafts` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:'), `revision` = `revision` + 1 WHERE `state` LIKE '%"prime-rushmore:%';
--> statement-breakpoint
UPDATE `draft_preferences` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:'), `revision` = `revision` + 1 WHERE `state` LIKE '%"prime-rushmore:%';
--> statement-breakpoint
UPDATE `user_profiles` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:'), `revision` = `revision` + 1 WHERE `state` LIKE '%"prime-rushmore:%';
--> statement-breakpoint
UPDATE `demo_archives` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:') WHERE `state` LIKE '%"prime-rushmore:%';
--> statement-breakpoint
UPDATE `demo_scoring_backups` SET `state` = REPLACE(`state`, '"prime-rushmore:', '"historical:') WHERE `state` LIKE '%"prime-rushmore:%';
