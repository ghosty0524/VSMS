# 匯出視窗、人員分頁、PDN 對 VTMS 檢查 — 設計文件

日期：2026-09-09
狀態：已與使用者確認，待實作

三項需求彼此獨立，各自一個 commit，可以分開部署與退版。

| # | 需求 | 動到的系統 | 部署方式 |
|---|------|-----------|---------|
| 一 | 匯出改成獨立視窗 | VSMS 前端 | `npx vite build` |
| 二 | 「測試人員」與「帳號管理」合併成「人員」分頁 | VSMS 前端 | `npx vite build` |
| 三 | 排程表單填 PDN 後檢查 VTMS 是否已建專案，並修好關聯存不進去的 bug | VTMS server、VSMS server、VSMS 前端 | 三段式，見文末 |

---

## 一、匯出改成視窗

### 問題

工具列的「匯出」是一個 `absolute` 定位的下拉選單，掛在 `ScheduleToolbar` 的根容器內。第一階段改版為了窄畫面在該容器加了 `overflow-x-auto`，CSS 規定一軸不是 `visible` 另一軸就跟著不是，所以往下彈的選單被容器裁掉；外層 `GanttChart` 又有一層 `overflow-hidden`。`z-50` 對 overflow 裁切無效。

### 設計

- 「匯出」按鈕改為單純開啟 `ExportModal`；下拉選單、`showExportMenu`、`exportRef` 與外部點擊關閉的 `useEffect` 全部刪除。`ChevronDown` 若無他處使用一併移除 import。
- `ExportModal` 是全螢幕覆蓋層（沿用 `ExportExcelModal` 的 `fixed inset-0 z-50` 結構），內容分兩層：
  1. **類型選擇**：兩張可點的選項卡，`FileSpreadsheet` 圖示「排程 Excel」、`LayoutList` 圖示「Dashboard + Agent Excel」。後者的說明文字沿用現在下拉裡的註腳「同時產生 Agent Excel 供上傳 SharePoint」。
  2. **排程 Excel 的單位勾選**：選了「排程 Excel」後在同一個視窗內展開，內容與行為完全照搬 `ExportExcelModal`（全選＝不過濾、點單一項目時先展開為全選再取消該項、已選提示）。
- 頁尾按鈕：「取消」與「確認匯出」。未選類型時「確認匯出」disabled 並顯示「請先選擇匯出類型」（與匯入視窗「請先選擇匯入方式」同一個做法，不給預設值）。
- 確認後依類型呼叫既有函式：`exportSchedules(schedules, selectedUnits)` 或 `handleExportDashboard()`（含 `generateAgentExcel` 與 toast，邏輯不變）。
- `ExportExcelModal.tsx` 刪除，其邏輯併入 `ExportModal.tsx`。
- 匯入範本下載的小圖示按鈕維持不動。

### 元件介面

```ts
interface ExportModalProps {
  isOpen: boolean
  allUnits: string[]
  onExportExcel: (selectedUnits: string[]) => void
  onExportDashboard: () => Promise<void>
  onClose: () => void
}
```

### 測試

純版面，不加新的自動化測試。以 dev server 實機驗證：1440 與 375 寬度下按「匯出」都能看到完整視窗；選排程 Excel 展開單位勾選；未選類型時按鈕 disabled。

---

## 二、系統設定的「人員」分頁

### 背景與決定

- **測試人員**是名冊（`engineers` 表，掛在 `test_units` 下，欄位 `value/label/isActive/sortOrder/color`），沒有登入身分。排程表單、篩選列、甘特圖顏色、Copilot agent 的人名解析都靠它。
- **帳號**是登入身分（`users` 表）。只有 `user` 角色透過純文字欄位 `linkedEngineer`（存 engineer 的 `value`）對應到一位測試人員；後端在建立與更新時強制 admin / super_admin 的 `linkedEngineer` 為空字串。
- C# `Merged.Api` 用 Dapper 直接 `SELECT ... FROM engineers e JOIN test_units u`（`vsms_Csharp/Services/IntegrationRepository.cs`），線上 Copilot agent 走的是那份實作。

**因此資料層完全不動**：`engineers`、`users` 兩張表、`PUT /api/options`、`/api/users/*` 全部照舊。合併只發生在畫面。

使用者決定：一人一列、帳號是人員的附屬欄位、**整個分頁只有 super_admin 看得到**。admin 從此不再維護名冊。

### 分頁結構

`SettingsPage` 的分頁陣列移除 `engineers` 與 `users`，新增 `{ key: 'people', label: '人員', superAdminOnly: true }`，放在原「測試人員」的位置。`SettingsTab` 型別同步。`uiStore` 若存到已不存在的 `engineers` / `users` 鍵，既有的「回到第一個可見分頁」邏輯會處理，不需遷移。

新元件 `src/components/settings/PeopleManager.tsx`，取代 `EngineerManager.tsx` 與 `UserManager.tsx`（兩檔刪除）。

### 畫面

**上半：依測試單位分組的人員清單**（沿用 `EngineerManager` 的分組框）。每位人員一列：

| 區域 | 內容 | 來源與行為 |
|------|------|-----------|
| 左 | 顏色選擇器、「還原」、姓名（停用時刪除線）、「編輯」「停用/啟用」「刪除」 | 完全沿用 `EngineerManager` 的處理函式與錯誤顯示（`deleteErrors` / `actionErrors` / `addErrors`），透過 `useOptionsStore` 走 `PUT /api/options` |
| 右 | 帳號欄 | 有帳號：帳號名、角色徽章（User）、「已停用」徽章、上次登入日期，以及「編輯帳號」「停用/啟用」「永久刪除」。沒有帳號：「建立帳號」按鈕 |

每個單位框底部保留「新增人員姓名」輸入與「新增」按鈕。

**下半：「管理帳號」區塊**。列出 `role` 為 `admin` 或 `super_admin` 的帳號，內容與操作與現在 `UserManager` 的列完全相同（管轄單位、VTMS 權限、編輯、停用、永久刪除）。區塊標題右側放「＋ 新增管理帳號」。

**孤兒帳號**：`role === 'user'` 但 `linkedEngineer` 對不到任何 engineer（含已刪除的人員）的帳號，也列在「管理帳號」區塊之後、獨立一個小區塊「未對應人員的帳號」，附紅字「對應人員不存在」，可編輯（重選對應人員）、停用、永久刪除。不能讓它們消失。

### 對應邏輯（純函式，可測）

`src/lib/peopleRows.ts`：

```ts
export interface PersonRow {
  unitId: string
  unitLabel: string
  engineer: EngineerOption
  account: SafeUser | null   // role === 'user' && linkedEngineer === engineer.value
}
export interface PeopleView {
  units: { unitId: string; unitLabel: string; unitValue: string; rows: PersonRow[] }[]
  adminAccounts: SafeUser[]       // admin / super_admin，依 createdAt
  orphanAccounts: SafeUser[]      // user 但對不到人員
}
export function buildPeopleView(testUnits: TestUnitOption[], users: SafeUser[]): PeopleView
```

比對用 `linkedEngineer === engineer.value` 精確相等（這是後端「我的排程」判斷用的同一條件，不做模糊比對）。同一個 engineer 若被兩個帳號指到（資料上可能），第一個帳號進 `account`，其餘進 `orphanAccounts` 並在畫面標示「重複對應」。

### 帳號表單

沿用 `UserManager` 現有的新增／編輯表單（含 `UnitSelector`、`EngineerSelector`、`RoleSelector`、密碼、VTMS 權限），抽成 `AccountForm` 子元件放在同一檔案。

- 從人員列按「建立帳號」：表單以 `role: 'user'`、`linkedEngineer: engineer.value` 預填，角色與對應人員欄位唯讀顯示（不給改，避免建錯）。
- 從「管理帳號」按「新增管理帳號」：與現在相同，角色可選 admin / user。
- 新增表單維持現狀，**不加** VTMS 權限勾選。後端 `POST /api/users` 不讀那兩個欄位，要加就得重啟 VSMS server，會讓第二項失去「純前端、不重啟」的部署優勢；建立後在編輯表單勾選即可。列在文末「不做的事」。

### 權限

分頁 `superAdminOnly`，`SettingsPage` 維持雙重把關（分頁列過濾 + 內容區 `isSuperAdmin &&`）。後端 `/api/users/*` 本來就是 super_admin 限定；`PUT /api/options` 仍允許 admin（其他分頁要用），不改。

### 測試

- `src/__tests__/peopleRows.test.ts`：正常對應、無帳號人員、admin 不進人員列、孤兒帳號（對應人員已刪除）、重複對應、停用人員仍列出且帶帳號。
- 既有 `optionsStore-*.test.ts` 不受影響。
- 畫面以 dev server 實機驗證：super_admin 看得到「人員」分頁而 admin 看不到；從人員列建立帳號時角色與對應人員唯讀；孤兒帳號出現在獨立區塊。

### 三系統檢查

- Schema：無變動。
- `/api/integration/*`：無變動。
- 共用欄位語意：無變動。
- C# / MCP：無影響。

---

## 三、PDN 對 VTMS 檢查，與關聯 bug 修正

### 事實

- VTMS 專案的 `name` 欄位就是 PDN Number（`ProjectEditor.tsx` 的欄位標籤），自由文字，長度 500。
- VSMS `schedules.projectName` 就是 PDN，沒有獨立欄位。
- VSMS 已有 `server/src/lib/vtmsClient.ts`（HTTP + `X-Api-Key`），以及 `GET /api/schedules/vtms-plans` 代理，但那支只列**有計畫的專案**，且擋 guest、前端只在 `canLinkVtms` 時才抓。
- 排程只有 admin 與 super_admin 能建立（`POST /api/schedules` 擋 user）。使用者決定：檢查結果只給這兩個角色看。

### 既有 bug

`ScheduleFormModal` 儲存時把 `vtmsPlanId` 放進 body，但 `server/src/routes/schedules.ts` 自 2026-07-06（`f8f0780`）起以 `SCHEDULE_WRITABLE_FIELDS` 白名單過濾，`vtmsPlanId` 刻意不在其中，只能透過 `PATCH /api/schedules/:id/vtms-link` 寫入；而前端從未呼叫過該端點（`src/` 內無 `vtms-link`）。結果：表單選了計畫、畫面立刻鎖住，儲存後重開就沒了。正式資料的關聯全是從 VTMS 那邊建的。

### 設計

#### VTMS 端：新端點

`GET /api/integration/projects`（`requireApiKey`）

回傳未刪除專案：

```ts
{ id: string; name: string; productName: string; planCount: number }[]
```

`planCount` 為該專案未刪除的 `test_plans` 數，用一次 `GROUP BY projectId` 查出來再合併，不在迴圈裡查。放在 `integration.ts` 的 `/test-plans` 之前或之後皆可，沒有 `/:id` 衝突。additive、不動 schema。

#### VSMS 後端：檢查端點

`GET /api/schedules/vtms-project-check?pdn=<string>`，掛在 `/vtms-plans` 旁邊（同樣要在 `/:id` 路由之前）。

- 角色不是 admin / super_admin → 403 `ROLE_NOT_ALLOWED`。
- `pdn` trim 後為空 → 400。
- 呼叫 `vtmsClient.listProjects()`（新函式，打 VTMS 的 `/api/integration/projects`）。
- 比對邏輯抽成純函式 `server/src/lib/pdnMatch.ts`：

```ts
export type PdnCheck =
  | { status: 'found'; name: string; planCount: number }
  | { status: 'not_found'; similar: string[] }
export function matchPdn(pdn: string, projects: { name: string; planCount: number }[]): PdnCheck
```

  - 正規化：`trim()` + `toLowerCase()`；相等即 `found`。多筆相等時取第一筆（VTMS 沒有唯一約束，實務上不該發生）。
  - `not_found` 時 `similar` 為「正規化後互相包含」的名稱，最多 5 筆，依名稱排序。例如輸入 `PDN-9999` 會列出 `PDN-99990`；輸入 `pdn-99990` 也會列出 `PDN-9999`。
- VTMS 打不到或非 2xx → 回 200 `{ status: 'unavailable' }`，**不是 502**。理由：這是提示不是資料，前端不該把它當錯誤處理；VTMS 停機時表單仍要能正常用。
- 快取：不做。每次失焦一次請求，VTMS 專案數量在百筆等級。

#### VSMS 前端：表單提示

- `api.ts` 新增 `checkVtmsProject(pdn)` 與 `setVtmsLink(id, planId | null)`。
- PDN 欄位 `onBlur` 且值非空且與上次查詢值不同時呼叫檢查；顯示於欄位下方一行小字（放在 `field()` 的錯誤訊息位置之下，不是取代）：
  - `found`：「VTMS 已建立此專案（N 個測試計畫）」，綠色。
  - `not_found`：「VTMS 尚未建立此專案」，琥珀色；有 `similar` 時接「相近：A、B、C」。
  - `unavailable`：「目前無法查詢 VTMS」，灰色。
  - 查詢中：「查詢 VTMS 中…」，灰色。
- **只提示，不影響 `validate()`，不擋儲存。**
- 只在 `!isUser` 分支渲染（user 看到的是唯讀摘要卡，本來就沒有 PDN 輸入框）。
- 編輯既有排程開啟時，也對現有 PDN 查一次。

#### VSMS 前端：修關聯 bug

- `scheduleStore.add` 改為回傳建立後的 `Schedule`（型別 `Promise<Schedule>`），`update` 同樣回傳更新後的 `Schedule`。
- `handleSave` 流程：
  1. 從 body 移除 `vtmsPlanId`（後端本來就會丟掉，留著只會誤導）。
  2. `add` / `update` 成功後，若 `canLinkVtms` 且 `vtmsPlanId !== (schedule?.vtmsPlanId ?? '')`，呼叫 `api.setVtmsLink(saved.id, vtmsPlanId || null)`，成功後把回傳的 schedule 寫回 store（`update` 的 set 邏輯抽成 `replaceInStore(schedule)`）。
  3. 關聯失敗：排程已儲存，`toast.error('排程已儲存，但 VTMS 關聯失敗，請重新開啟排程再試')`，仍關閉表單。
- 後端 `PATCH /:id/vtms-link` 不改。

### 測試

- VTMS `server/src/routes/integration.projects.test.ts`：mock `db.select`（比照 `integration.stats.test.ts` 用表物件分辨查詢），驗證排除 `deletedAt` 專案、`planCount` 正確、無計畫的專案 `planCount: 0`。
- VSMS `server/src/__tests__/pdnMatch.test.ts`：精確相等、大小寫與空白、`similar` 雙向包含、上限 5 筆、空清單。
- VSMS `server/src/__tests__/vtmsProjectCheckRoute.test.ts`：user 角色 403、空 pdn 400、`vtmsClient` mock 拋錯時回 `unavailable`。
- VSMS 前端 `src/__tests__/scheduleStore-returnsSaved.test.ts`：`add` / `update` 回傳 schedule、`replaceInStore` 以 id 取代；`src/__tests__/vtmsLinkAfterSave.test.ts`：儲存後的關聯流程抽成純函式 `syncVtmsLink`，涵蓋無權限跳過、未變動跳過、關聯、取消關聯、失敗不外拋。

### 三系統檢查

- Schema：無變動。
- `/api/integration/*`：VTMS 新增一支 GET，additive。C# `Merged.Api` 不呼叫 VTMS 的 Node integration API，MCP server（已停用）亦無。
- 共用欄位語意：`vtmsPlanId` 語意不變，只是修好 VSMS 端本來就該有的寫入路徑；VTMS 端 `linked-schedule` 讀法不變。
- Node / C#：只動 Node。

---

## 部署順序與風險

1. **第一、二項**：`xcopy /E /I /Y dist dist.stable-<日期>` 備份後 `npx vite build`。不重啟。
2. **第三項**：
   1. VTMS：`npm run typecheck`、測試全過、`npm run check:releases`（server-only 變更，預期不需公告）、`tsc -p server/tsconfig.json` 後 `pm2 restart vtms`。**避開工作日 09:00–09:35**（通知排程窗口，重啟會觸發補跑寄信）。時間用 PowerShell `Get-Date` 確認，不用 bash 的 `TZ`。
   2. VSMS server：`tsc -p server/tsconfig.json` 後 `pm2 restart vsms`。
   3. VSMS 前端：`npx vite build`。在 2 與 3 之間，舊前端配新後端沒有問題；若順序顛倒，新前端打不存在的端點會得到 404，前端把非 2xx 一律當 `unavailable`，不會壞。
3. **必須先處理的障礙**：VSMS `server/src/routes/auth.ts`、`server/src/lib/crypto.ts` 與 `server/src/__tests__/loginPasswordValidation.test.ts` 有別人未提交的登入驗證修改。第三項一旦編譯並重啟 VSMS server，那份程式碼就會一起上線。動工前先與使用者確認：一起上、或先 `git stash` 再做。
4. 每一項獨立 commit，訊息英文，結尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。commit 到目前分支 `feat/guest-role-and-uiux`（VSMS）與 `master`（VTMS），推 GitHub 前要問。

## 不做的事

- 不把測試人員變成帳號、不動 `engineers` 表。
- 不做 PDN 模糊比對的自動修正，只列相近名稱給人看。
- 不在 VTMS 端反向提示「VSMS 有沒有排程」（VTMS 的計畫頁已有 linked-schedule 功能）。
- 不改 `PUT /api/options` 的權限。
- 不在新增帳號表單加 VTMS 權限勾選（需改 `POST /api/users` 並重啟 server；建立後在編輯表單勾選即可）。之後若有 VSMS server 的部署機會再一併補。
