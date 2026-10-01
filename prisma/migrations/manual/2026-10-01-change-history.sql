-- 變動歷程（2026-10-01）：小P+ 查排程「誰、何時、從什麼改成什麼」。
-- 設計：F:\copilot-agent\specs\2026-10-01-change-history-design.md
--
-- 純新增一張表，既有表不動；MCP_API 的 Dapper 查詢不受影響。
-- 不可用 prisma migrate dev（會要求 reset）；以 prisma db execute 施作：
--   npx prisma db execute --file prisma/migrations/manual/2026-10-01-change-history.sql
-- （Prisma 7 的 db execute 不接受 --schema，連線取自 prisma.config.ts。）
-- 部署順序：先在正式 DB 建表，再 prisma generate、build、pm2 restart vsms。
-- changes 只存顯示值；手填欄位只記 {"changed": true}，不存內容。

CREATE TABLE IF NOT EXISTS `change_history` (
  `id`           VARCHAR(36)  NOT NULL,
  `at`           DATETIME(3)  NOT NULL,
  `pdn`          VARCHAR(20)  NULL,
  `projectLabel` VARCHAR(500) NOT NULL,
  `entityType`   VARCHAR(20)  NOT NULL,
  `entityId`     VARCHAR(36)  NOT NULL,
  `entityLabel`  VARCHAR(500) NOT NULL,
  `planId`       VARCHAR(36)  NULL,
  `action`       VARCHAR(30)  NOT NULL,
  `actor`        VARCHAR(100) NOT NULL,
  `actorSource`  VARCHAR(20)  NOT NULL,
  `changes`      JSON         NOT NULL,
  PRIMARY KEY (`id`),
  KEY `change_history_pdn_at_idx` (`pdn`, `at`),
  KEY `change_history_entityType_entityId_at_idx` (`entityType`, `entityId`, `at`),
  KEY `change_history_at_idx` (`at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
