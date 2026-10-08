CREATE TABLE `season_join_attempts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window_at` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `season_leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`invite_hash` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_leagues_invite_hash_unique` ON `season_leagues` (`invite_hash`);