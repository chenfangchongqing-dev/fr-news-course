CREATE TABLE `corpus_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`actor` text NOT NULL,
	`status` text NOT NULL,
	`evidence` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corpus_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`type` text NOT NULL,
	`verification` text NOT NULL,
	`published` text NOT NULL,
	`theme` text NOT NULL,
	`publisher` text NOT NULL,
	`search_text` text NOT NULL,
	`data` text NOT NULL,
	`original` text NOT NULL,
	`original_hash` text NOT NULL,
	`origin` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corpus_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corpus_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created` text NOT NULL
);
