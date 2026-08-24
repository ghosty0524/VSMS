-- 通知記錄補上寄件伺服器的回應，供事後追查投遞狀況。
--
-- smtpResponse 存的是 SMTP 的原始 250 字串。M365 會把 InternalId 放在裡面，
-- 那是 message trace 的查詢鍵 —— 有了它，追查一封信的實際處置是一次查詢，
-- 沒有的話只能靠時間範圍去撈。
--
-- 純新增欄位且可為 NULL，既有列不受影響；MCP_API 的 Dapper 查詢不受影響。
-- 不可用 prisma migrate dev（會要求 reset）；以 prisma db execute 施作。

ALTER TABLE `notification_logs`
  ADD COLUMN `messageId` VARCHAR(255) NULL,
  ADD COLUMN `smtpResponse` TEXT NULL;
