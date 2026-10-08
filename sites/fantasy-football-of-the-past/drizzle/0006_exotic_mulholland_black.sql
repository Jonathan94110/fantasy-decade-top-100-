CREATE TABLE `demo_scoring_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`draft_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`state` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `demo_scoring_backups_owner_draft` ON `demo_scoring_backups` (`owner_id`,`draft_id`);
--> statement-breakpoint
CREATE TRIGGER `backup_demo_before_scoring_unification` BEFORE UPDATE OF state ON `demo_drafts`
WHEN json_extract(OLD.state,'$.scoring.version') = 5
 AND json_extract(OLD.state,'$.scoring.mode') = 'strict'
 AND json_extract(NEW.state,'$.scoring.mode') = 'historical'
 AND json_extract(OLD.state,'$.status') = 'draft'
 AND json_extract(OLD.state,'$.season') IS NULL
BEGIN
 INSERT INTO `demo_scoring_backups` (`id`,`owner_id`,`draft_id`,`source_revision`,`state`,`source_updated_at`,`created_at`)
 VALUES (lower(hex(randomblob(16))),OLD.owner_id,OLD.id,OLD.revision,OLD.state,OLD.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
