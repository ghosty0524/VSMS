-- Add indexes to schedules table
CREATE INDEX `schedules_testUnit_idx` ON `schedules`(`testUnit`);
CREATE INDEX `schedules_isCompleted_isDelayed_idx` ON `schedules`(`isCompleted`, `isDelayed`);
CREATE INDEX `schedules_startDate_endDate_idx` ON `schedules`(`startDate`, `endDate`);

-- Add indexes to audit_logs table
CREATE INDEX `audit_logs_timestamp_idx` ON `audit_logs`(`timestamp`);
CREATE INDEX `audit_logs_username_idx` ON `audit_logs`(`username`);

-- Add unique constraints to categories and test_units
CREATE UNIQUE INDEX `categories_value_key` ON `categories`(`value`);
CREATE UNIQUE INDEX `test_units_value_key` ON `test_units`(`value`);

-- Change default for notify_config.systemUrl
ALTER TABLE `notify_config` ALTER COLUMN `systemUrl` SET DEFAULT '';
