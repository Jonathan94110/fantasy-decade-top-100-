CREATE TABLE `demo_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`archived_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `demo_archives_owner_archived` ON `demo_archives` (`owner_id`,`archived_at`);
--> statement-breakpoint
CREATE TRIGGER `archive_demo_before_reset` BEFORE DELETE ON `demo_drafts`
BEGIN
  INSERT INTO `demo_archives` (`id`,`owner_id`,`state`,`revision`,`archived_at`)
  VALUES (OLD.id,OLD.owner_id,OLD.state,OLD.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(id) DO UPDATE SET state=excluded.state,revision=excluded.revision,archived_at=excluded.archived_at;
END;
