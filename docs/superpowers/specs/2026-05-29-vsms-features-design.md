# VSMS Feature Batch 2026-05-29 — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 新增雙旗標標記、User 全單位切換、移除 Teams 功能、設備欄位與設備視角、時間篩選隱藏功能，共 5 項需求。

**Architecture:** 前後端全端變更。需兩次 Prisma migration（新增 Schedule 欄位、新增 Device 資料表）。前端改動集中於 GanttChart、FilterSortBar、ScheduleFormModal、SettingsPage。

**Tech Stack:** React 18 + Zustand + Tailwind CSS、Express 5 + Prisma 7 + MySQL 8、TypeScript ESM

---

## 需求總覽

| # | 需求 | 類型 | 影響範圍 |
|---|------|------|---------|
| 1 | 雙旗標標記（Admin 旗標 + 使用者旗標） | 新功能 | DB + API + 前端 |
| 2 | User 可切換查看所有單位排程 | 新功能 | 前端 |
| 3 | 移除 Teams / 發佈功能 | 移除 | 前端 + API |
| 4 | 設備欄位 + 設備視角甘特圖 | 新功能 | DB + API + 前端 |
| 5 | 時間篩選隱藏範圍外排程 | 行為修正 | 前端 |

**建議實作順序：** 需求 3（移除，無風險）→ 需求 5（純前端）→ 需求 2（純前端）→ 需求 1（DB + 前端）→ 需求 4（DB + 前端）

---

## Part 1：資料庫與 API 基礎

### Schema 變更

#### `schedules` 資料表新增欄位

```prisma
adminFlag     Boolean  @default(false)
adminFlagNote String   @db.VarChar(500) @default("")
userFlag      Boolean  @default(false)
userFlagNote  String   @db.VarChar(500) @default("")
device        String   @db.VarChar(100) @default("")
```

#### 新增 `devices` 資料表

```prisma
model Device {
  id        String  @id @default(uuid())
  value     String  @db.VarChar(100) @unique
  label     String  @db.VarChar(100)
  isActive  Boolean @default(true)
  sortOrder Int

  @@map("devices")
}
```

### API 行為

| 端點 | 變更 |
|------|------|
| `GET /api/schedules` | User 角色回傳物件**移除** `adminFlag`、`adminFlagNote`；移除 server 端 `allowedUnits` 過濾（改由前端控制） |
| `PUT /api/schedules/:id` | 接受 `adminFlag`、`adminFlagNote`（User 呼叫時 server 端忽略）；接受 `userFlag`、`userFlagNote`、`device` |
| `GET /api/options` | 回傳值新增 `devices` 陣列 |
| `POST /api/options/devices` | 新增設備（Admin / Super Admin 限定） |
| `PUT /api/options/devices/:id` | 編輯設備（Admin / Super Admin 限定） |
| `DELETE /api/options/devices/:id` | 刪除設備（Admin / Super Admin 限定） |
| `/api/notify/*` | **整條路由移除** |

### 前端 `types.ts` 變更

**`Schedule` 介面新增：**
```typescript
adminFlag:     boolean   // Admin/Super Admin 專屬，User 看不到此欄位
adminFlagNote: string
userFlag:      boolean
userFlagNote:  string
device:        string    // 設備 value，空字串表示未指定
```

**`OptionsMap` 新增：**
```typescript
devices: Option[]
```

**移除：**
- `NotifyConfig` 介面
- `Recipient` 介面
- `View` 中的 `'teams'`
- `AuditAction` 中的 `'SEND_NOTIFICATION'`

**新增 AuditAction：**
- `'FLAG_SCHEDULE'`

---

## Part 2：雙旗標標記系統（需求 1）

### 旗標定義

| 旗標 | 圖示 | 顏色 | 可見角色 | 可操作角色 |
|------|------|------|---------|-----------|
| Admin 旗標 | 🛡（Shield icon） | 橘色 | Admin、Super Admin | Admin、Super Admin |
| 使用者旗標 | 🔖（Bookmark icon） | 藍色 | 全角色 | 全角色 |

### 甘特圖左側列

每行排程列在操作按鈕區（現有鉛筆 / 垃圾桶按鈕旁）顯示旗標圖示：

- **Admin / Super Admin：** 顯示兩個圖示（Shield + Bookmark）
- **User：** 只顯示一個圖示（Bookmark）

圖示狀態：
- 未標記：半透明（opacity-30），hover 時加深（opacity-60）
- 已標記：實心顯色，hover 顯示 tooltip 預覽附註內容

### Popover 操作

點擊旗標圖示開啟小型 popover（浮動於圖示旁）：

**未標記狀態：**
```
[附註輸入框（選填）]
[標記] [取消]
```

**已標記狀態：**
```
[附註輸入框（可修改）]
[更新] [移除標記] [取消]
```

空白附註亦可標記（允許僅設旗標而不加附註）。

### FilterSortBar 篩選

篩選列新增切換 chip：

- **User：** 顯示 `[🔖 只顯示已標記]`
- **Admin / Super Admin：** 顯示 `[🔖 只顯示已標記]` 和 `[🛡 只顯示 Admin 標記]`

兩個 chip 可各自獨立切換，可與其他篩選條件疊加。

### 稽核紀錄

設定或移除任一旗標時，寫入 audit log：
- `action: 'FLAG_SCHEDULE'`
- `target: schedule.projectName`
- `fields: ['adminFlag'] | ['userFlag']`（標示是哪種旗標）

---

## Part 3：User 查看所有單位排程（需求 2）

### 行為邏輯

Server 統一回傳全部排程給所有已登入角色。前端依角色套用預設過濾：

| 角色 | 預設行為 | 切換按鈕 |
|------|---------|---------|
| Admin / Super Admin | 顯示全部排程 | 無 |
| User | 僅顯示 `allowedUnits` 內的排程 | ✅ 有 |

User 的 `allowedUnits` 為空陣列時，預設不過濾（等同顯示全部）。

### 切換按鈕 UI

FilterSortBar 中，靠近「清除全部」按鈕旁，User 角色看到：

- 關閉（預設）：`[👁 顯示所有單位]`（灰色外框）
- 開啟：`[👁 所有單位 ✓]`（藍色背景）

切換狀態以 `localStorage` key `vsms-show-all-units` 持久化。

### 連動行為

- 開啟「顯示所有單位」後，`allowedUnits` 的前端過濾解除
- 若使用者同時手動設了「測試單位」多選篩選，兩者獨立運作（不衝突）

---

## Part 4：移除 Teams / 發佈功能（需求 3）

### 刪除的檔案

| 檔案路徑 | 說明 |
|---------|------|
| `src/store/teamsStore.ts` | Teams 狀態管理 |
| `src/components/settings/TeamsSettingsPage.tsx` | Teams 設定頁面 |
| `server/src/routes/notify.ts` | Teams 通知 API |

### 修改的檔案

| 檔案 | 變更內容 |
|------|---------|
| `src/types.ts` | 移除 `NotifyConfig`、`Recipient`；移除 `'teams'` from View；移除 `'SEND_NOTIFICATION'` from AuditAction |
| `src/App.tsx` | 移除 teams view 渲染與 import |
| `src/components/layout/Header.tsx` | 移除 Teams 導覽按鈕與發佈按鈕 |
| `src/components/schedule/ExportExcelModal.tsx` | 移除發佈相關按鈕（若有） |
| `server/src/index.ts` | 移除 notify 路由 import 與掛載 |

### 資料庫

`notify_config` 與 `recipients` 資料表**保留不動**（避免 migration 風險，不影響系統運作），日後若確認永不使用再以獨立 migration 清除。

---

## Part 5：設備欄位與設備視角（需求 4）

### 設定頁面

`SettingsPage` 新增「**設備管理**」Tab（`key: 'devices'`），Admin / Super Admin 可見。

新增 `DeviceManager.tsx` 元件，操作介面與 `CategoryManager.tsx` 完全相同：
- 新增設備（輸入名稱）
- 啟用 / 停用
- 拖曳排序
- 刪除（有排程使用中時顯示警告）

### 排程表單

`ScheduleFormModal` 新增選填「**設備**」下拉選單：
- 列出所有 `isActive` 的設備（加上首選項「（無）」清除用）
- 若系統中尚未建立任何設備，欄位**整行隱藏**不顯示
- 送出時若選「（無）」，`device` 欄位儲存空字串 `""`

### 甘特圖分組切換

甘特圖標題列右側加分組切換按鈕：

```
[按工程師分組]  [按設備分組]
```

切換狀態存入 `localStorage` key `vsms-gantt-group-by`，預設為 `'engineer'`。

### 設備視角行為

| 情況 | 顯示方式 |
|------|---------|
| 有指定設備的排程 | 依設備 sortOrder 排列，每台設備一行 |
| 未指定設備的排程（device = ""） | **不顯示** |
| 無排程的設備行 | **預設顯示**（顯示設備名稱，bar 區留空） |

### 設備篩選欄位

切換至設備視角後，FilterSortBar 顯示獨立的「設備」多選篩選欄位（未勾選 = 顯示全部設備，包含空行）。切換回工程師視角時此欄位隱藏。

### 現有功能相容

設備視角下以下功能完整保留：
- 排序、關鍵字、類別 / 單位 / 工程師 / 狀態篩選
- 旗標顯示與操作
- 時間範圍篩選（需求 5 的新行為）
- 編輯 / 刪除排程

---

## Part 6：時間篩選隱藏範圍外排程（需求 5）

### 現狀

`ganttStart` / `ganttEnd` 僅控制甘特圖 X 軸可視窗格，不影響列表顯示的排程數量。

### 新行為

`GanttChart.tsx` 的 `applyFilter` 函式加入日期重疊判斷：

```typescript
// 保留條件：與所設範圍有任何重疊
if (fs.ganttStart && s.endDate < fs.ganttStart) return false
if (fs.ganttEnd   && s.startDate > fs.ganttEnd) return false
```

| 篩選狀態 | 行為 |
|---------|------|
| 只設 `ganttStart` | 移除 `endDate < ganttStart` 的排程 |
| 只設 `ganttEnd` | 移除 `startDate > ganttEnd` 的排程 |
| 兩者都設 | 保留與範圍有重疊的排程 |
| 都未設 | 不過濾（現有行為不變） |

修改範圍：僅 `GanttChart.tsx` 的 `applyFilter` 函式，約 3 行，無 API 或 DB 變動。

---

## 影響檔案清單

### 新增檔案
- `src/components/settings/DeviceManager.tsx`

### 刪除檔案
- `src/store/teamsStore.ts`
- `src/components/settings/TeamsSettingsPage.tsx`
- `server/src/routes/notify.ts`

### 修改檔案

**前端**
- `src/types.ts`
- `src/App.tsx`
- `src/components/layout/Header.tsx`
- `src/components/schedule/GanttChart.tsx`
- `src/components/schedule/FilterSortBar.tsx`
- `src/components/schedule/ScheduleFormModal.tsx`
- `src/components/schedule/ExportExcelModal.tsx`
- `src/components/settings/SettingsPage.tsx`
- `src/store/scheduleStore.ts`
- `src/store/optionsStore.ts`
- `src/lib/api.ts`
- `src/constants.ts`（設備顏色等）

**後端**
- `server/src/index.ts`
- `server/src/routes/schedules.ts`
- `server/src/routes/options.ts`
- `server/src/lib/storage.ts`（新增 FLAG_SCHEDULE audit action）
- `server/src/types.ts`（若有獨立型別定義）
- `prisma/schema.prisma`

**Prisma**
- Migration（一次完成）：Schedule 新增 5 欄位 + 新增 Device 資料表
