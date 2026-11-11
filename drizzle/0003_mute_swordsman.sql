CREATE TABLE IF NOT EXISTS `status_daily` (
	`monitor_id` text NOT NULL,
	`day` text NOT NULL,
	`ups` integer NOT NULL,
	`total` integer NOT NULL,
	PRIMARY KEY(`monitor_id`, `day`),
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
