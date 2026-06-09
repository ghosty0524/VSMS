-- AlterTable: add vtmsPlanId to schedules
ALTER TABLE `schedules` ADD COLUMN `vtmsPlanId` VARCHAR(36) NULL;

-- AlterTable: add VTMS permission flags to users
ALTER TABLE `users` ADD COLUMN `canLinkVtms` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN `canViewVtmsProgress` BOOLEAN NOT NULL DEFAULT false;
