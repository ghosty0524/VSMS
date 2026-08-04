-- AlterTable
ALTER TABLE `calendar_config` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `notify_config` MODIFY `systemUrl` VARCHAR(200) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `schedules` ADD COLUMN `adminFlag` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `adminFlagNote` TEXT NULL,
    ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `device` VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN `isCancelled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `userFlag` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `userFlagNote` TEXT NULL,
    MODIFY `taskDescription` TEXT NOT NULL;

-- CreateTable
CREATE TABLE `devices` (
    `id` VARCHAR(191) NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL,

    UNIQUE INDEX `devices_value_key`(`value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `audit_logs_timestamp_idx` ON `audit_logs`(`timestamp`);

-- CreateIndex
CREATE INDEX `audit_logs_username_idx` ON `audit_logs`(`username`);

-- CreateIndex
CREATE UNIQUE INDEX `categories_value_key` ON `categories`(`value`);

-- CreateIndex
CREATE INDEX `schedules_testUnit_idx` ON `schedules`(`testUnit`);

-- CreateIndex
CREATE INDEX `schedules_isCompleted_isDelayed_idx` ON `schedules`(`isCompleted`, `isDelayed`);

-- CreateIndex
CREATE INDEX `schedules_startDate_endDate_idx` ON `schedules`(`startDate`, `endDate`);

-- CreateIndex
CREATE UNIQUE INDEX `test_units_value_key` ON `test_units`(`value`);
