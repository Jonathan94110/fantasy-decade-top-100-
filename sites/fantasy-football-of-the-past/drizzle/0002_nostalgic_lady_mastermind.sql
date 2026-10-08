CREATE TABLE `demo_drafts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_drafts_id_unique` ON `demo_drafts` (`id`);