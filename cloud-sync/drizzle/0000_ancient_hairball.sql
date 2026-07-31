CREATE TABLE `shared_state` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`sha` text NOT NULL,
	`updated_at` text NOT NULL
);
