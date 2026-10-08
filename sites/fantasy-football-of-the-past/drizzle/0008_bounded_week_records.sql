CREATE TABLE `demo_draft_rounds` (
	`draft_id` text NOT NULL,
	`number` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`draft_id`, `number`)
);
--> statement-breakpoint
CREATE TABLE `season_league_rounds` (
	`league_id` text NOT NULL,
	`number` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`league_id`, `number`)
);
