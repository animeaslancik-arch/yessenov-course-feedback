CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `role` text DEFAULT 'student' NOT NULL,
  `program` text DEFAULT '' NOT NULL,
  `language` text DEFAULT 'ru' NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `teacher_id` text REFERENCES `users`(`id`),
  `semester` text NOT NULL,
  `closes` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_semester` ON `courses` (`code`,`semester`);
--> statement-breakpoint
CREATE TABLE `enrollments` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `course_id` text NOT NULL REFERENCES `courses`(`id`),
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_user_course` ON `enrollments` (`user_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE `feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `course_id` text NOT NULL REFERENCES `courses`(`id`),
  `clarity` integer NOT NULL,
  `materials` integer NOT NULL,
  `support` integer NOT NULL,
  `comment` text DEFAULT '' NOT NULL,
  `anonymous` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'submitted' NOT NULL,
  `response` text DEFAULT '' NOT NULL,
  `created` integer NOT NULL,
  `updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_user_course` ON `feedback` (`user_id`,`course_id`);
--> statement-breakpoint
CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `kind` text NOT NULL,
  `course` text NOT NULL,
  `is_read` integer DEFAULT 0 NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `public_key` text NOT NULL,
  `counter` integer NOT NULL,
  `transports` text NOT NULL,
  `label` text NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `challenges` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `challenge` text NOT NULL,
  `kind` text NOT NULL,
  `expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unlocks` (
  `token` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `method` text NOT NULL,
  `expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
  `id` text PRIMARY KEY NOT NULL,
  `hits` integer NOT NULL,
  `expires` integer NOT NULL
);
