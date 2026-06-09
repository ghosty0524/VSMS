# VTMS × VSMS 整合設計規格

**日期：** 2026-06-09
**狀態：** 已核准，待實作

---

## 背景與目標

VSMS（驗證排程管理系統）管理工作排程與資源配置；VTMS（驗證測試管理系統）管理測試計畫與執行結果。兩個系統目前完全獨立，無法互相參照進度與排程資訊。

**整合目標：**
1. 有 `canLinkVtms` 權限的 VSMS 使用者可手動將排程連結到 VTMS TestPlan（1:1）
2. 有 `canViewVtmsProgress` 權限的 VSMS 使用者可在排程列表 / 甘特圖上看到 VTMS 測試進度
3. VTMS 使用者可在 TestPlan 詳細頁看到對應的 VSMS 排程資訊
4. 建立正式的 Integration REST API 層（API Key 認證），為 Microsoft Copilot Studio Agent 整合提供完整能力：
   - **A：跨系統整合查詢** — 單一 API call 取得排程 + VTMS 進度（解決 N+1 查詢問題）
   - **B：摘要統計** — 排程健康狀況與測試品質整體摘要，供 Agent 回答管理層問題
   - **C：失敗案例明細** — 具體哪些測試案例在失敗，供 Agent 提供可行動的建議
5. VTMS `MyTasksPage` 測試計畫列表新增 Product Name 欄位
6. VTMS 每個測試計畫擁有專屬的**執行日誌**，紀錄過程中的特殊事件，並與 VSMS 狀態雙向連動

---

## 系統現況

| 項目 | VSMS | VTMS |
|------|------|------|
| 執行 port | 3001 | 4000 |
| 資料庫 | MySQL（Prisma ORM） | MySQL（Drizzle ORM） |
| DB 名稱 | 來自 `DATABASE_URL` | `vtms` |
| 部署位置 | 同一台機器 | 同一台機器 |

兩個系統均已完成 MySQL 遷移，無 JSON 殘留。

---

## 架構決策

### 整合方式：REST API + API Key（方案 B）

排除方案：
- **跨 DB 直接查詢**：雖然技術可行（同一 MySQL server），但未來若系統分開部署需大幅重構，且無法服務 Copilot Studio Agent
- **共用橋接表**：對此規模過度設計，增加維護負擔

選擇 REST API 的理由：
- Copilot Studio Agent 無法直連 MySQL，必須透過 REST API
- 相同 API 同時服務前端整合與 Agent，避免重複邏輯
- 鬆耦合，兩系統可獨立演進 schema

### 連結儲存

VSMS `Schedule` 新增 nullable `vtmsPlanId VARCHAR(36)`，指向 VTMS `test_plans.id`。
- 1:1 關係（一筆排程對應一個 TestPlan）
- 連結操作在 VSMS 側管理
- VTMS 側只讀，不儲存任何 VSMS 參照

### 認證

每個系統各自設定 `INTEGRATION_API_KEY`，跨系統呼叫時帶 `X-Api-Key` header。
API key 僅存在後端環境變數，前端永遠透過後端代理，不接觸 key。

---

## 權限設計

VSMS `User` 新增兩個細粒度 permission flag（參考既有 `allowedUnits` 模式）：

| 欄位 | 預設 | 說明 |
|------|------|------|
| `canLinkVtms` | `false` | 可在排程上建立 / 修改 / 清除 VTMS TestPlan 連結 |
| `canViewVtmsProgress` | `false` | 可查看 VTMS 測試進度統計（完成率、pass/fail 分佈） |

這兩個權限在 VSMS `AccountManagePage`（人員設定）逐人設定，不綁定於角色（role），允許細粒度控制。

---

## 環境變數

**VTMS `.env` 新增：**
```
INTEGRATION_API_KEY=<secret>        # 驗證進來的 integration 請求
VSMS_API_URL=http://localhost:3001  # 呼叫 VSMS 的位址
VSMS_API_KEY=<vsms-key>             # 呼叫 VSMS 時使用的 key
```

**VSMS `.env` 新增：**
```
INTEGRATION_API_KEY=<secret>        # 驗證進來的 integration 請求
VTMS_API_URL=http://localhost:4000  # 呼叫 VTMS 的位址
VTMS_API_KEY=<vtms-key>             # 呼叫 VTMS 時使用的 key
```

---

## API 端點規格

### VTMS — Integration API（`X-Api-Key` 認證）

#### `GET /api/integration/test-plans`
供 VSMS 排程表單下拉選擇器使用，也供 Copilot Studio Agent 查詢。

**Response：**
```json
[
  {
    "id": "uuid",
    "name": "BMC Full Validation",
    "projectId": "uuid",
    "projectName": "DVT-001",
    "status": "in_progress",
    "plannedStartDate": "2026-06-01",
    "plannedEndDate": "2026-06-30"
  }
]
```

#### `GET /api/integration/test-plans/:id/progress`
供 VSMS 顯示測試進度摘要。

**Response：**
```json
{
  "planId": "uuid",
  "planName": "BMC Full Validation",
  "planStatus": "in_progress",
  "totalItems": 49,
  "latestRunStatus": "in_progress",
  "results": {
    "pass": 30,
    "fail": 2,
    "conditional_pass": 5,
    "blocked": 1,
    "not_tested": 11,
    "not_applicable": 0
  },
  "completionPct": 77
}
```
- `totalItems`：`test_plans.items` JSON 陣列長度
- `latestRunStatus`：`test_runs` 中 `testPlanId` 符合、`deletedAt IS NULL`，依 `createdAt DESC` 取第一筆的 `status`；無 TestRun 時為 `null`
- `results`：取上述最新 TestRun 的 `test_results`（`deletedAt IS NULL`），按 `overallResult` 分組統計；無 TestRun 時全為 0
- `completionPct`：`(pass + fail + conditional_pass + blocked) / totalItems * 100`（四捨五入）；`not_applicable` 不計入分母

#### `GET /api/integration/test-plans/progress-batch` 【新增 — 支援 A 功能】
供 VSMS `schedules-with-progress` 端點批量查詢，避免 N+1 呼叫。

**Query params：** `ids=uuid1,uuid2,uuid3`（逗號分隔，上限 100 筆）

**Response：** 以 planId 為 key 的 map
```json
{
  "uuid1": { "planId": "uuid1", "planName": "...", "completionPct": 77, "results": {...}, "latestRunStatus": "in_progress" },
  "uuid2": { "planId": "uuid2", "planName": "...", "completionPct": 40, "results": {...}, "latestRunStatus": "not_started" }
}
```
- 內部以單一 SQL `WHERE id IN (...)` 查詢，再批量聚合 test_results

#### `GET /api/integration/test-plans/summary` 【新增 — B 功能】
供 Copilot Studio Agent 回答「整體測試品質如何？」。

**Response：**
```json
{
  "totalPlans": 8,
  "byStatus": {
    "draft": 1,
    "approved": 1,
    "in_progress": 4,
    "completed": 2,
    "archived": 0
  },
  "overallPassRate": 85.2,
  "plansAtRisk": [
    {
      "planId": "uuid",
      "planName": "OpenBMC Validation",
      "completionPct": 20,
      "failCount": 5,
      "blockedCount": 2
    }
  ]
}
```
- `overallPassRate`：所有 in_progress / completed TestPlan 中，pass / (pass + fail + conditional_pass + blocked) × 100
- `plansAtRisk`：status 為 `in_progress` 且 `(fail + blocked) >= 3` 或 `completionPct < 30` 的計畫

#### `GET /api/integration/test-plans/:id/failures` 【新增 — C 功能】
供 Copilot Studio Agent 回答「哪些測試案例在失敗？」。

**Response：**
```json
{
  "planId": "uuid",
  "planName": "BMC Full Validation",
  "runId": "uuid",
  "runName": "Run-001",
  "failures": [
    {
      "testCaseId": "uuid",
      "caseNo": "BMC-TC-012",
      "testCaseTitle": "Fan Speed Control",
      "overallResult": "fail",
      "testerName": "Eric",
      "testDate": "2026-06-05",
      "notes": "風扇轉速超出規格 ±5%"
    }
  ]
}
```
- 取最新 TestRun（`createdAt DESC`），回傳 `overallResult` 為 `fail` 或 `blocked` 的結果
- 若無 TestRun 或無失敗項目，`failures` 為空陣列

---

### VTMS — Session-auth 代理端點

#### `GET /api/integration/linked-schedule/:planId`
供 VTMS 前端查詢對應 VSMS 排程（session auth，後端呼叫 vsmsClient）。

**Response：**
```json
{
  "id": "uuid",
  "projectName": "DVT-001",
  "taskDescription": "BMC Full Validation",
  "testEngineer": "Eric",
  "startDate": "2026/06/01",
  "endDate": "2026/06/30",
  "isCompleted": false,
  "isDelayed": true,
  "delayReason": "等待測試板到位"
}
```
若無連結的排程，回傳 `404`。

---

### VSMS — Integration API（`X-Api-Key` 認證）

#### `GET /api/integration/schedules`
供 Copilot Studio Agent 查詢，支援過濾。

**Query params：** `testUnit`, `isCompleted`, `isDelayed`, `dateFrom`, `dateTo`

**Response：** 排程陣列（含 `vtmsPlanId`）

#### `GET /api/integration/schedules-with-progress` 【新增 — A 功能】
供 Copilot Studio Agent 一次取得排程 + VTMS 進度，不需多次呼叫。

**Query params：** 同 `/api/integration/schedules`（`testUnit`, `isCompleted`, `isDelayed`, `dateFrom`, `dateTo`）

**Response：**
```json
[
  {
    "id": "uuid",
    "projectName": "DVT-001",
    "taskDescription": "BMC Full Validation",
    "testEngineer": "Eric",
    "startDate": "2026/06/01",
    "endDate": "2026/06/30",
    "isCompleted": false,
    "isDelayed": false,
    "vtmsPlanId": "uuid",
    "vtmsProgress": {
      "planName": "BMC Full Validation",
      "planStatus": "in_progress",
      "totalItems": 49,
      "completionPct": 77,
      "latestRunStatus": "in_progress",
      "results": { "pass": 30, "fail": 2, "conditional_pass": 5, "blocked": 1, "not_tested": 11, "not_applicable": 0 }
    }
  },
  {
    "id": "uuid2",
    ...
    "vtmsPlanId": null,
    "vtmsProgress": null
  }
]
```
- 內部流程：查出所有符合排程 → 收集 unique vtmsPlanIds → 呼叫 VTMS `progress-batch` → 合併後回傳
- 無 `vtmsPlanId` 的排程：`vtmsProgress` 為 `null`

#### `GET /api/integration/schedules/summary` 【新增 — B 功能】
供 Copilot Studio Agent 回答「排程健康狀況如何？」。

**Response：**
```json
{
  "total": 42,
  "completed": 15,
  "delayed": 5,
  "inProgress": 22,
  "notStarted": 5,
  "byUnit": {
    "SIT-HW": { "total": 20, "completed": 8, "delayed": 2, "inProgress": 10 },
    "SIT-SW": { "total": 12, "completed": 5, "delayed": 1, "inProgress": 6 }
  }
}
```
- `inProgress`：`isCompleted = false AND isDelayed = false AND startDate <= today <= endDate`
- `notStarted`：`isCompleted = false AND startDate > today`

#### `GET /api/integration/schedules/by-plan/:planId`
供 VTMS `vsmsClient` 查詢連結排程。

**Response：**
```json
{
  "id": "uuid",
  "projectName": "DVT-001",
  "taskDescription": "BMC Full Validation",
  "testEngineer": "Eric",
  "startDate": "2026/06/01",
  "endDate": "2026/06/30",
  "isCompleted": false,
  "isDelayed": true,
  "delayReason": "等待測試板到位"
}
```
若無連結，回傳 `404`。

---

### VSMS — Session-auth 代理端點

#### `GET /api/schedules/vtms-plans`
供 VSMS 排程表單下拉清單（後端代理呼叫 VTMS）。

#### `GET /api/schedules/:id/vtms-progress`
供 VSMS 前端取得進度資料（後端代理呼叫 VTMS）。
若排程無 `vtmsPlanId`，回傳 `{ data: null }`。

---

## 資料流

### A 方向：VSMS 顯示 VTMS 進度

```
VSMS frontend (canViewVtmsProgress)
  └─ GET /api/schedules/:id/vtms-progress  [session]
       └─ VSMS backend: vtmsClient.getTestPlanProgress(vtmsPlanId)
            └─ GET /api/integration/test-plans/:id/progress  [API key]
                 └─ VTMS: query test_plans + test_results
```

### B 方向：VTMS 顯示 VSMS 排程

```
VTMS frontend
  └─ GET /api/integration/linked-schedule/:planId  [session]
       └─ VTMS backend: vsmsClient.getScheduleByPlanId(planId)
            └─ GET /api/integration/schedules/by-plan/:planId  [API key]
                 └─ VSMS: query schedules WHERE vtmsPlanId = planId
```

### 連結建立

```
VSMS frontend (canLinkVtms) — ScheduleFormModal 下拉選單
  └─ GET /api/schedules/vtms-plans  [session]
       └─ VSMS backend: vtmsClient.listTestPlans()
            └─ GET /api/integration/test-plans  [API key]
                 └─ VTMS: query test_plans + test_projects
  └─ PATCH /api/schedules/:id  { vtmsPlanId: "..." }  [session]
       └─ VSMS: UPDATE schedules SET vtmsPlanId = ?
```

---

## UI 設計

### VSMS — 排程表單（ScheduleFormModal）

新增選填欄位「關聯 VTMS 測試計畫」，僅 `canLinkVtms` 使用者可見：
- 下拉選單，選項格式：`ProjectName / PlanName [status]`
- 支援清除連結
- 表單開啟時非同步載入 TestPlan 清單（載入中顯示 skeleton）

### VSMS — 排程列表（GanttLayout）

新增進度欄，僅 `canViewVtmsProgress` 使用者可見：
- 有連結且 API 回傳資料：進度條 + `✓{pass} ✗{fail} ⊘{blocked}` 小計
- 有連結但 API 失敗：顯示 `—`（不阻擋主要功能）
- 無連結：灰色「未連結」文字

### VSMS — 甘特圖（GanttChart）

有連結的排程 bar 右側加 `{completionPct}%` 徽章，僅 `canViewVtmsProgress` 使用者可見。
Hover 時 tooltip 顯示 pass/fail/blocked 分佈。

### VSMS — 人員設定（AccountManagePage / UserManager）

使用者編輯表單新增「VTMS 整合權限」區塊（位於現有欄位下方）：
- ☐ 可連結 VSMS 排程至 VTMS 測試計畫（`canLinkVtms`）
- ☐ 可檢視 VTMS 測試進度統計（`canViewVtmsProgress`）

### VTMS — TestPlan 詳細頁（TestPlanDetail）

新增「關聯 VSMS 排程」資訊卡：
- 顯示：projectName、taskDescription、testEngineer、startDate～endDate、isCompleted 狀態、isDelayed 警示（含 delayReason）
- 未連結：灰色提示「此測試計畫尚未關聯 VSMS 排程」
- VTMS 側僅顯示，不提供連結管理操作

---

## 新增檔案清單

### VSMS
- `server/src/middleware/requireApiKey.ts`
- `server/src/routes/integration.ts`
- `server/src/lib/vtmsClient.ts`
- `openapi-integration.yaml`

### VTMS
- `server/src/middleware/requireApiKey.ts`
- `server/src/routes/integration.ts`
- `server/src/lib/vsmsClient.ts`
- `openapi-integration.yaml`

---

## 修改檔案清單

### VSMS
| 檔案 | 變更摘要 |
|------|---------|
| `prisma/schema.prisma` | Schedule 加 `vtmsPlanId?`；User 加 `canLinkVtms`、`canViewVtmsProgress` |
| `server/src/routes/schedules.ts` | 新增 vtms-plans 代理、vtms-progress 代理、PATCH 支援 vtmsPlanId |
| `server/src/routes/users.ts` | User CRUD 支援新 permission 欄位 |
| `server/src/index.ts` | 註冊 integration router |
| `src/types.ts` | Schedule 加 `vtmsPlanId?`；User 加 permission flags |
| `src/components/schedule/ScheduleFormModal.tsx` | 新增 VTMS TestPlan 選擇器 |
| `src/components/schedule/GanttLayout.tsx` | 新增進度欄（canViewVtmsProgress） |
| `src/components/schedule/GanttChart.tsx` | 新增進度徽章 tooltip |
| `src/components/settings/AccountManagePage.tsx` | 新增 VTMS 整合權限 checkboxes |
| `src/components/settings/UserManager.tsx` | 同上（視元件職責分工） |

### VTMS
| 檔案 | 變更摘要 |
|------|---------|
| `server/src/config/env.ts` | 新增 vsmsApiUrl、vsmsApiKey、integrationApiKey |
| `server/src/index.ts` | 註冊 integration router；新增 linked-schedule 代理端點 |
| `src/components/test-plan/TestPlanDetail.tsx` | 新增關聯 VSMS 排程資訊卡 |

---

## OpenAPI Spec

兩個系統各自在專案根目錄產出 `openapi-integration.yaml`：
- info：title、version（`1.0.0`）
- securitySchemes：`apiKey`（`in: header`，`name: X-Api-Key`）
- paths：僅涵蓋 `/api/integration/*` 端點
- 供日後匯入 Power Automate 自訂連接器使用

---

---

## 需求 5：MyTasksPage 產品名稱欄位

**位置：** `src/components/testing/MyTasksPage.tsx`

在個人任務計畫列表（line 617）的`專案`欄位後新增`產品名稱`欄位：
- 資料來源：`TestProject.metadata.productName`
- 修改 projects 查詢：將 `{ id, name }[]` 型別擴充為 `{ id, name, metadata: { productName: string } }[]`
- 建立 `productNameMap: Map<string, string>`（projectId → productName）
- 管理者視圖（admin plan list，line 758）同步新增此欄位

---

## 需求 6：TestPlan 執行日誌

### 資料模型（VTMS 新增兩張表）

**`log_categories`**
```
id          VARCHAR(36) PK
name        VARCHAR(100) NOT NULL UNIQUE
isBuiltIn   TINYINT(1) NOT NULL DEFAULT 0   -- 1 = "Delay"（不可刪除）
isActive    TINYINT(1) NOT NULL DEFAULT 1
sortOrder   INT NOT NULL DEFAULT 0
createdAt   VARCHAR(30) NOT NULL
updatedAt   VARCHAR(30) NOT NULL
```
初始資料（seed）：`{ name: 'Delay', isBuiltIn: 1, sortOrder: 0 }`

**`test_plan_logs`**
```
id           VARCHAR(36) PK
testPlanId   VARCHAR(36) NOT NULL  (FK → test_plans.id)
date         VARCHAR(10) NOT NULL  (YYYY-MM-DD，系統帶入建立當天)
item         VARCHAR(500) NOT NULL
categoryId   VARCHAR(36) NOT NULL  (FK → log_categories.id)
categoryName VARCHAR(100) NOT NULL (冗餘存入，避免類別改名後影響歷史)
content      TEXT NOT NULL
authorId     VARCHAR(36) NOT NULL
authorName   VARCHAR(255) NOT NULL
createdAt    VARCHAR(30) NOT NULL
updatedAt    VARCHAR(30) NOT NULL
deletedAt    VARCHAR(30)           (軟刪除)
```

### 權限規則

| 操作 | 條件 |
|------|------|
| 新增日誌 | 必須是該 TestPlan 所屬 TestRun 的 TaskAssignment assignee（任一 task 被指派即可） |
| 編輯日誌 | 本人建立 + `date == 今天`（以 `date` 欄位判斷，非 `createdAt`） |
| 刪除日誌（本人） | 本人建立 + `date == 今天` |
| 刪除日誌（admin） | 無時間限制 |
| 讀取日誌 | 所有已登入 VTMS 使用者 |

### 類別管理（VTMS Settings）

- VTMS `SettingsPage` 新增「日誌類別」管理區塊（admin only）
- 新元件：`src/components/settings/LogCategoryManager.tsx`
- 「Delay」顯示鎖定圖示，不提供刪除按鈕
- 其他類別可新增、停用、刪除

### UI — 日誌面板（PlanLogPanel）

**觸發方式：** 在 `MyTasksPage` 個人計畫列表每個 row 新增「📋 日誌」按鈕，點擊後在 side panel 顯示 `PlanLogPanel`（不需要進入 task 列表）。

**新元件：** `src/components/testing/PlanLogPanel.tsx`

```
┌─────────────────────────────────────────┐
│  執行日誌 — DVT TestPlan-001             │
│  ─────────────────────────────────────  │
│  [+ 新增記錄]（有寫入權限才顯示）          │
│                                         │
│  2026-06-09  Delay                      │
│  項目：板件到位延遲                        │
│  內容：供應商通知延遲 2 週                 │
│  — Eric                          [編輯] [刪]│
│                                         │
│  2026-06-05  Hardware Issue             │
│  項目：Fan 轉速異常                       │
│  內容：…                                │
│  — Eric                                 │
└─────────────────────────────────────────┘
```

- 日誌以時間倒序顯示（最新在上）
- 編輯 / 刪除按鈕：本人 + 當天建立才顯示；admin 刪除按鈕不受時間限制
- 新增表單：日期（唯讀，今天）、項目（文字）、類別（下拉）、內容（textarea）

### VSMS 連動邏輯

**Delay 連動（VTMS → VSMS，server-side）：**

觸發：VTMS 後端儲存日誌時，若 `categoryName === 'Delay'` 且該 TestPlan 有連結的 VSMS 排程：
1. 呼叫 VSMS `PATCH /api/integration/schedules/:id/delay`
2. VSMS：`isDelayed = true`，`delayReason` 附加 `\n[YYYY-MM-DD] {content}`（不覆蓋）

**Completed 連動（VTMS → VSMS，server-side）：**

觸發：VTMS 後端儲存 TestResult 後，檢查：
- 該 TestRun 的所有 `task_assignments`（`deletedAt IS NULL`，`flaggedForDeletion != 1`）
- 是否每一筆都有對應的 `test_results`（`deletedAt IS NULL`）
- 若全部完成 → 呼叫 VSMS `PATCH /api/integration/schedules/:id/complete`
- VSMS：`isCompleted = true`

**VSMS 鎖定行為：**

當 `vtmsPlanId` 不為 null（已連結）：
- `isCompleted` checkbox：disabled，顯示 🔒「由 VTMS 控制」tooltip
- `isDelayed` checkbox：disabled，顯示 🔒「由 VTMS 控制」tooltip
- `delayReason` 文字欄位：read-only
- 未連結：維持現有手動操作行為

### 新增 VSMS Integration 端點（API Key 認證，供 VTMS server 呼叫）

```
PATCH /api/integration/schedules/:id/delay
  Body: { date: "YYYY-MM-DD", content: "..." }
  動作：isDelayed = true，delayReason += "\n[{date}] {content}"（trim 後附加）
  回傳：{ id, isDelayed, delayReason }

PATCH /api/integration/schedules/:id/complete
  動作：isCompleted = true
  回傳：{ id, isCompleted }
```

### 新增 VTMS Integration 端點（API Key 認證，供 Copilot Agent）

```
GET /api/integration/test-plans/:id/logs
  回傳（deletedAt IS NULL，createdAt DESC）：
  [{ id, date, item, categoryName, content, authorName, createdAt }]
```

### 新增 VTMS Session-auth 端點

```
GET  /api/test-plans/:id/logs              讀取（所有已登入使用者）
POST /api/test-plans/:id/logs              新增（需 assignee 身份）
PATCH  /api/test-plans/:planId/logs/:logId 編輯（本人 + 當天）
DELETE /api/test-plans/:planId/logs/:logId 刪除（本人當天 或 admin）

GET  /api/log-categories                   讀取類別（所有已登入使用者）
POST /api/log-categories                   新增類別（admin）
DELETE /api/log-categories/:id             刪除類別（admin，非 built-in）
```

---

## 修改檔案清單（完整版）

### VTMS 新增檔案
| 檔案 | 說明 |
|------|------|
| `server/src/middleware/requireApiKey.ts` | 驗證 X-Api-Key |
| `server/src/routes/integration.ts` | Integration API 端點（含 logs） |
| `server/src/routes/testPlanLogs.ts` | TestPlan 日誌 CRUD |
| `server/src/routes/logCategories.ts` | 日誌類別 CRUD |
| `server/src/lib/vsmsClient.ts` | 呼叫 VSMS 的 HTTP client |
| `src/components/testing/PlanLogPanel.tsx` | 日誌面板元件 |
| `src/components/settings/LogCategoryManager.tsx` | 日誌類別設定元件 |
| `openapi-integration.yaml` | Integration API 規格（供 Copilot Studio） |

### VTMS 修改檔案
| 檔案 | 變更摘要 |
|------|---------|
| `server/src/db/schema.ts` | 新增 `log_categories`、`test_plan_logs` 表定義 |
| `server/src/lib/seed.ts` | 新增 "Delay" built-in 類別 seed |
| `server/src/config/env.ts` | 新增 vsmsApiUrl、vsmsApiKey、integrationApiKey |
| `server/src/index.ts` | 註冊 integration / logs / logCategories router |
| `server/src/routes/results.ts` | 儲存 TestResult 後觸發 completed 連動檢查 |
| `src/components/testing/MyTasksPage.tsx` | 新增產品名稱欄；計畫列表行新增日誌按鈕；side panel 加 PlanLogPanel |
| `src/components/settings/SettingsPage.tsx` | 新增「日誌類別」管理區塊（admin） |

### VSMS 新增檔案
| 檔案 | 說明 |
|------|------|
| `server/src/middleware/requireApiKey.ts` | 驗證 X-Api-Key |
| `server/src/routes/integration.ts` | Integration API 端點（含 delay/complete 寫入） |
| `server/src/lib/vtmsClient.ts` | 呼叫 VTMS 的 HTTP client |
| `openapi-integration.yaml` | Integration API 規格 |

### VSMS 修改檔案
| 檔案 | 變更摘要 |
|------|---------|
| `prisma/schema.prisma` | Schedule 加 `vtmsPlanId?`；User 加 `canLinkVtms`、`canViewVtmsProgress` |
| `server/src/routes/schedules.ts` | 新增代理端點；PATCH 支援 vtmsPlanId；連動保護邏輯 |
| `server/src/routes/users.ts` | User CRUD 支援 permission 欄位 |
| `server/src/index.ts` | 註冊 integration router |
| `src/types.ts` | Schedule 加 `vtmsPlanId?`；User 加 permission flags |
| `src/components/schedule/ScheduleFormModal.tsx` | VTMS TestPlan 選擇器；linked 時鎖定 isDelayed/isCompleted |
| `src/components/schedule/GanttLayout.tsx` | 進度欄（canViewVtmsProgress） |
| `src/components/schedule/GanttChart.tsx` | 進度徽章 tooltip |
| `src/components/settings/AccountManagePage.tsx` | VTMS 整合權限 checkboxes |
| `src/components/settings/UserManager.tsx` | 同上 |

---

## 實作順序

1. VSMS Prisma schema 變更 + migration
2. VTMS DB schema 新增 `log_categories`、`test_plan_logs`（Drizzle schema + migration）
3. `requireApiKey` middleware（VSMS、VTMS 各一）
4. `vtmsClient.ts`（VSMS 呼叫 VTMS，含 batch 支援）
5. `vsmsClient.ts`（VTMS 呼叫 VSMS，含 delay/complete 呼叫）
6. VTMS integration routes — 基本：`/test-plans`、`/test-plans/:id/progress`
7. VTMS integration routes — Agent：`/test-plans/progress-batch`、`/test-plans/summary`、`/test-plans/:id/failures`、`/test-plans/:id/logs`
8. VSMS integration routes — 基本：`/schedules`、`/schedules/by-plan/:planId`
9. VSMS integration routes — 寫入：`/schedules/:id/delay`、`/schedules/:id/complete`
10. VSMS integration routes — Agent：`/schedules-with-progress`、`/schedules/summary`
11. VTMS `logCategories` routes + seed（含 Delay built-in）
12. VTMS `testPlanLogs` routes（含 Delay → VSMS 連動、completed 連動）
13. VTMS `results.ts` 新增 completed 觸發檢查
14. VSMS `schedules.ts` 代理端點 + PATCH vtmsPlanId + 連動保護邏輯
15. VTMS env.ts + index.ts 更新
16. VSMS users.ts permission 欄位 CRUD
17. VSMS 前端：AccountManagePage / UserManager permission UI
18. VSMS 前端：ScheduleFormModal 連結選擇器 + 鎖定行為
19. VSMS 前端：GanttLayout / GanttChart 進度顯示
20. VTMS 前端：TestPlanDetail 排程資訊卡
21. VTMS 前端：MyTasksPage 產品名稱欄 + 日誌按鈕
22. VTMS 前端：PlanLogPanel 元件
23. VTMS 前端：SettingsPage 日誌類別管理（LogCategoryManager）
24. openapi-integration.yaml（兩個系統）

---

## 驗收條件

| 項目 | 預期結果 |
|------|---------|
| Prisma migration | `npx prisma migrate status` 無 pending |
| API Key 缺失 / 錯誤 | 回傳 401 |
| 連結建立 | DB `vtmsPlanId` 欄位有值，表單顯示已選 TestPlan 名稱 |
| A 方向進度 | `canViewVtmsProgress` 使用者看到進度欄；其他使用者看不到 |
| B 方向排程 | VTMS TestPlanDetail 顯示 VSMS 排程日期 / 工程師 / 狀態 |
| 無連結排程 | VSMS 顯示「未連結」；VTMS 顯示灰色提示 |
| 權限隔離 | 無 `canLinkVtms` 者，ScheduleFormModal 無連結欄位 |
| Copilot Studio — A 跨系統查詢 | `GET /api/integration/schedules-with-progress` 回傳排程含 `vtmsProgress` 物件；無連結者 `vtmsProgress` 為 `null` |
| Copilot Studio — B 摘要統計 | `GET /api/integration/schedules/summary` 回傳各單位統計；`GET /api/integration/test-plans/summary` 回傳 `plansAtRisk` 清單 |
| Copilot Studio — C 失敗明細 | `GET /api/integration/test-plans/:id/failures` 回傳 fail/blocked 的測試案例清單 |
| Copilot Studio — 日誌讀取 | `GET /api/integration/test-plans/:id/logs` 回傳日誌列表 |
| openapi.yaml | 語法正確可匯入 Swagger Editor / Power Automate |
| 產品名稱欄位 | MyTasksPage 個人 / 管理員計畫列表顯示 productName 欄位 |
| 日誌新增 | assignee 可新增日誌；非 assignee 無法新增 |
| 日誌 Delay 連動 | 新增 Delay 日誌 → VSMS `isDelayed=true`，`delayReason` 累加不覆蓋 |
| 日誌 Completed 連動 | 所有 TaskAssignment 都有 TestResult → VSMS `isCompleted=true` |
| 日誌編輯/刪除時間限制 | 本人只能操作當天（`date == 今天`）的記錄；admin 不受限 |
| VSMS 鎖定 | 已連結排程的 `isDelayed`、`isCompleted` checkbox 為 disabled；顯示「由 VTMS 控制」 |
| 未連結排程 | VSMS `isDelayed`、`isCompleted` 維持手動操作，不受限制 |
| 日誌類別管理 | Admin 可在 VTMS 設定頁新增/刪除類別；「Delay」顯示鎖定無法刪除 |
