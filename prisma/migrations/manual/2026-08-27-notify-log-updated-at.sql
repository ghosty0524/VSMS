-- 通知記錄補上「最後處理時間」，作為記錄頁的排序依據。
--
-- 重試走的是 upsert-update，createdAt 停在第一次建立的時間。用 createdAt 排序
-- 會讓今天才重試成功的舊記錄永遠沉在下面，管理者看不到當天的處理結果 ——
-- 而畫面上顯示的又是預定寄信日（補寄時早於實際處理日），兩者不一致就會讓
-- 記錄頁看起來像是沒有更新。
--
-- 欄位由 Prisma 的 @updatedAt 維護；DB 端的 DEFAULT 只是讓既有列能通過
-- NOT NULL，不加 ON UPDATE 以免和 Prisma 寫入的值互相干擾。
--
-- 回填是必要的：新欄位的 DEFAULT 會把既有列全設成施作當下的時間，等於謊稱
-- 那些舊記錄剛剛才處理過，一上線就把歷史排序全打亂。
--
-- 不可用 prisma migrate dev（會要求 reset）；以 prisma db execute 施作。

ALTER TABLE `notification_logs`
  ADD COLUMN `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `notification_logs` SET `updatedAt` = `createdAt`;
