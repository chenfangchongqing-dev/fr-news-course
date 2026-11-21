CREATE INDEX `corpus_check_entry` ON `corpus_checks` (`entry_id`,`created`);--> statement-breakpoint
CREATE INDEX `corpus_type_status_date` ON `corpus_entries` (`type`,`verification`,`published`);--> statement-breakpoint
CREATE INDEX `corpus_source` ON `corpus_entries` (`source_id`);