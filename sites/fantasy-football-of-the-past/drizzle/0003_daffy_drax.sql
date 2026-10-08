CREATE TABLE `draft_preferences` (
	`owner_id` text NOT NULL,
	`scope` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `scope`)
);
