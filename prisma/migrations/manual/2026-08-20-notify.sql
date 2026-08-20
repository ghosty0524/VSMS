-- 排程啟動前預告通知。全部為 additive：新表 + 既有表加欄位。
-- MCP_API 用 Dapper，缺欄位是靜默失敗，因此絕不改動或移除既有欄位。
-- 不可用 prisma migrate dev（會要求 reset）；以 prisma db execute 施作。

ALTER TABLE `notify_config`
  ADD COLUMN `leadDays` INT NOT NULL DEFAULT 3,
  ADD COLUMN `catchUpDays` INT NOT NULL DEFAULT 3,
  ADD COLUMN `mailDomain` VARCHAR(100) NOT NULL DEFAULT '';

CREATE TABLE `notification_logs` (
  `id`           VARCHAR(191) NOT NULL,
  `scheduleId`   VARCHAR(36)  NOT NULL,
  `sendDate`     VARCHAR(10)  NOT NULL,
  `status`       VARCHAR(20)  NOT NULL,
  `recipients`   TEXT         NOT NULL,
  `errorMessage` TEXT         NULL,
  `attempts`     INT          NOT NULL DEFAULT 0,
  `sentAt`       DATETIME(3)  NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_logs_scheduleId_sendDate_key` (`scheduleId`, `sendDate`),
  KEY `notification_logs_sendDate_idx` (`sendDate`)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE `notify_rules` (
  `id`              VARCHAR(191) NOT NULL,
  `testUnit`        VARCHAR(100) NULL,
  `enabled`         TINYINT(1)   NOT NULL DEFAULT 1,
  `subjectTemplate` TEXT         NULL,
  `introTemplate`   TEXT         NULL,
  `outroTemplate`   TEXT         NULL,
  `ccRecipients`    TEXT         NOT NULL,
  `updatedAt`       DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notify_rules_testUnit_key` (`testUnit`)
) DEFAULT CHARSET=utf8mb4;
