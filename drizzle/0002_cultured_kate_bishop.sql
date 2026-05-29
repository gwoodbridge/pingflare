ALTER TABLE `monitors` ADD `dns_hostname` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `dns_record_type` text DEFAULT 'A';--> statement-breakpoint
ALTER TABLE `monitors` ADD `dns_resolver_url` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `dns_expected_ip` text;