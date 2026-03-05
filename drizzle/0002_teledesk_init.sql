CREATE TABLE IF NOT EXISTS `telegram_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int,
	`phone` varchar(32),
	`username` varchar(128),
	`firstName` varchar(255),
	`lastName` varchar(255),
	`telegramId` varchar(64),
	`sessionString` text,
	`status` enum('pending','active','disconnected','banned') NOT NULL DEFAULT 'pending',
	`avatarUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_accounts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramId` varchar(64) NOT NULL,
	`username` varchar(128),
	`firstName` varchar(255),
	`lastName` varchar(255),
	`phone` varchar(32),
	`avatarUrl` text,
	`bitrixContactId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(7) NOT NULL DEFAULT '#6366f1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `dialogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramAccountId` int,
	`contactId` int,
	`assigneeId` int,
	`status` enum('open','in_progress','waiting','resolved','closed') NOT NULL DEFAULT 'open',
	`lastMessageAt` timestamp,
	`lastMessageText` text,
	`unreadCount` int NOT NULL DEFAULT 0,
	`bitrixDealId` varchar(64),
	`aiSummary` text,
	`sentiment` enum('positive','neutral','negative'),
	`tagIds` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dialogs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dialogId` int NOT NULL,
	`telegramMessageId` varchar(64),
	`direction` enum('incoming','outgoing') NOT NULL,
	`senderId` int,
	`text` text,
	`mediaUrl` text,
	`mediaType` enum('photo','video','audio','document','voice','sticker'),
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `quick_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(128) NOT NULL,
	`text` text NOT NULL,
	`shortcut` varchar(32),
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quick_replies_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `auto_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`trigger` enum('first_message','outside_hours','keyword') NOT NULL,
	`keyword` varchar(128),
	`text` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`telegramAccountId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auto_replies_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `bitrix_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`domain` varchar(255) NOT NULL,
	`webhookUrl` text NOT NULL,
	`pipelineId` varchar(64),
	`pipelineName` varchar(255),
	`stageId` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bitrix_settings_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `working_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dayOfWeek` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`startTime` varchar(5) NOT NULL DEFAULT '09:00',
	`endTime` varchar(5) NOT NULL DEFAULT '18:00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `working_hours_id` PRIMARY KEY(`id`)
);

ALTER TABLE `telegram_accounts` ADD CONSTRAINT `telegram_accounts_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `dialogs` ADD CONSTRAINT `dialogs_telegramAccountId_telegram_accounts_id_fk` FOREIGN KEY (`telegramAccountId`) REFERENCES `telegram_accounts`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `dialogs` ADD CONSTRAINT `dialogs_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `dialogs` ADD CONSTRAINT `dialogs_assigneeId_users_id_fk` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `messages` ADD CONSTRAINT `messages_dialogId_dialogs_id_fk` FOREIGN KEY (`dialogId`) REFERENCES `dialogs`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `quick_replies` ADD CONSTRAINT `quick_replies_createdById_users_id_fk` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `auto_replies` ADD CONSTRAINT `auto_replies_telegramAccountId_telegram_accounts_id_fk` FOREIGN KEY (`telegramAccountId`) REFERENCES `telegram_accounts`(`id`) ON DELETE no action ON UPDATE no action;
