# Guest 唯讀角色設計（方案 A）

日期：2026-07-09
狀態：已與需求方確認方向與四項決策點

## 需求

新增訪客帳號類別：帳號統一為 `Guest`、免密碼登入、僅能讀取專案（排程）資訊。

已確認決策：
- Guest **不可**進入統計分析頁
- Guest **不可**匯出（Excel / Dashboard）
- Guest 同時在線上限 **10** 人
- 審計僅記 **LOGIN + 來源 IP**（不記 LOGOUT）

## 架構

### 後端

1. **新增角色 `guest`**：`Role = 'super_admin' | 'admin' | 'user' | 'guest'`。
   Guest 為**虛擬帳號**，不寫入 users 表，不會出現在帳號管理頁，也不可被停用/改密碼。
   同時禁止建立 username 為 `guest`（不分大小寫）的實體帳號，避免混淆。

2. **`POST /api/guest-login`**（新端點，無密碼）：
   - per-IP 頻率限制（15 分鐘 20 次），防止灌爆 in-memory session 表
   - Guest 併發上限 10（獨立於 MAX_SESSIONS=30；同一 username 多 session 並存）
   - **豁免** duplicate-session 互踢邏輯（一般登入路徑完全不變）
   - 寫入 audit：`LOGIN`，displayName 帶來源 IP
   - 回傳與 /api/login 相同形狀（role='guest'、displayName='訪客'）

3. **寫入防護（預設拒絕）**：新 middleware `guestReadOnly` 掛在 `/api` 全域：
   session（含 X-Vsms-Session header token）解析為 `guest` 且 HTTP method 非 GET → 403，
   僅放行 `POST /api/logout`。未來新增任何寫入 API，Guest 自動被擋。

4. **讀取面收斂**：
   - `GET /api/schedules`：比照 `user` 角色剝除 `adminFlag`/`adminFlagNote`
   - `GET /api/schedules/vtms-plans`：guest 403
   - `GET /api/schedules/:id/vtms-progress`：既有 canViewVtmsProgress 檢查已天然擋下（無 DB user）
   - `GET /api/me`：guest 不查 DB，直接回虛擬帳號資料
   - audit / users / sessions：既有 super_admin 限制已涵蓋
   - `POST /api/logout`：guest 可登出，但不寫 LOGOUT audit

### 前端

- `LoginPage` 加「以訪客身分瀏覽（唯讀）」按鈕（不需輸入帳密）
- `authStore.guestLogin()` 呼叫新 API
- Guest 僅見「排程管理」分頁（沿用 `userHidden` 機制）；App 層強制 view='main'
- 隱藏所有寫入 UI：新增/匯入/匯出/範本、編輯/刪除/旗標（admin 與 user 旗標皆隱藏）
- Header 顯示琥珀色 `G` 徽章

## 錯誤處理

- Guest 上限滿：403 + 訊息「訪客人數已達上限（10 人），請稍後再試」
- 頻率限制：429
- Guest session 逾時（30 分鐘閒置）：與一般帳號相同，回登入頁

## 資安前提（已知並接受）

Guest 免密碼 = 任何可連線到伺服器的人都能檢視全部排程資料。本系統部署於內網；
若未來暴露面改變，需補 IP allowlist。

## 測試

- `guestReadOnly` middleware 單元測試（vitest）：GET 放行、非 GET 403、logout 放行、
  非 guest 不受影響、header-token 解析路徑
- 手動驗證：訪客登入 → 只見唯讀主畫面；直接打寫入 API 收到 403
