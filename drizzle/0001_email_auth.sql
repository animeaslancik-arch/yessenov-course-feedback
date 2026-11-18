CREATE TABLE `auth_accounts` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `salt` text NOT NULL,
  `iterations` integer NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_email` ON `auth_accounts` (`email`);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
  `token` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires` integer NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user` ON `auth_sessions` (`user_id`);
