-- CreateTable
CREATE TABLE `schedules` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `projectName` VARCHAR(100) NOT NULL,
    `taskDescription` VARCHAR(500) NOT NULL,
    `testUnit` VARCHAR(100) NOT NULL,
    `testEngineer` VARCHAR(100) NOT NULL,
    `timeResource` INTEGER NOT NULL,
    `startDate` VARCHAR(10) NOT NULL,
    `endDate` VARCHAR(10) NOT NULL,
    `requiredPersonnel` VARCHAR(200) NOT NULL,
    `testReport` VARCHAR(500) NOT NULL,
    `isCompleted` BOOLEAN NOT NULL DEFAULT false,
    `isDelayed` BOOLEAN NOT NULL DEFAULT false,
    `delayReason` VARCHAR(5000) NOT NULL,
    `createdBy` VARCHAR(100) NOT NULL,
    `updatedBy` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `displayName` VARCHAR(50) NOT NULL,
    `passwordHash` VARCHAR(64) NOT NULL,
    `role` ENUM('super_admin', 'admin', 'user') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allowedUnits` JSON NOT NULL,
    `linkedEngineer` VARCHAR(100) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_units` (
    `id` VARCHAR(191) NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `engineers` (
    `id` VARCHAR(191) NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,
    `testUnitId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rest_days_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `weekends` BOOLEAN NOT NULL DEFAULT true,
    `specificDates` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `username` VARCHAR(100) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target` VARCHAR(200) NOT NULL,
    `fields` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notify_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `teamsWebhookUrl` VARCHAR(500) NOT NULL DEFAULT '',
    `systemUrl` VARCHAR(200) NOT NULL DEFAULT 'http://localhost:3001',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipients` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `note` VARCHAR(200) NOT NULL DEFAULT '',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notifyConfigId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_config` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `year` INTEGER NOT NULL,
    `nonWeekendHolidays` JSON NOT NULL,
    `sourceName` VARCHAR(200) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `engineers` ADD CONSTRAINT `engineers_testUnitId_fkey` FOREIGN KEY (`testUnitId`) REFERENCES `test_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recipients` ADD CONSTRAINT `recipients_notifyConfigId_fkey` FOREIGN KEY (`notifyConfigId`) REFERENCES `notify_config`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
