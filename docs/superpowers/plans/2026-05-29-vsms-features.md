# VSMS Feature Batch 2026-05-29 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作雙旗標標記、User 全單位切換、移除 Teams 功能、設備欄位與設備視角、時間篩選隱藏功能，共 5 項需求。

**Architecture:** 後端 Prisma migration 加入 5 個 Schedule 欄位與 Device 資料表；前端新增 FlagPopover、DeviceManager 元件，改動 GanttChart、FilterSortBar、ScheduleFormModal、SettingsPage；移除 Teams/通知相關程式碼。

**Tech Stack:** React 18 + Zustand + Tailwind CSS、Express 5 + Prisma 7（MariaDB adapter）+ MySQL 8、TypeScript ESM

---

## File Map

### 新增
- `src/components/schedule/FlagPopover.tsx` — 旗標 popover（附註輸入 + 儲存/移除按鈕）
- `src/components/settings/DeviceManager.tsx` — 設備管理 UI（仿 CategoryManager）

### 刪除
- `src/store/teamsStore.ts`
- `src/components/settings/TeamsSettingsPage.tsx`
- `server/src/routes/notify.ts`

### 修改

| 檔案 | 影響的 Task |
|------|------------|
| `prisma/schema.prisma` | Task 4 |
| `server/src/types.ts` | Task 1, 5, 8 |
| `server/src/index.ts` | Task 1 |
| `server/src/lib/storage.ts` | Task 5 |
| `server/src/routes/schedules.ts` | Task 3, 5 |
| `server/src/routes/options.ts` | Task 8 |
| `src/types.ts` | Task 1, 5, 8, 9 |
| `src/constants.ts` | Task 8 |
| `src/lib/api.ts` | Task 1, 8 |
| `src/store/uiStore.ts` | Task 8 |
| `src/store/optionsStore.ts` | Task 8 |
| `src/store/scheduleStore.ts` | Task 6 |
| `src/App.tsx` | Task 1 |
| `src/components/layout/Header.tsx` | Task 1 |
| `src/components/schedule/FilterSortBar.tsx` | Task 3, 7, 10 |
| `src/components/schedule/GanttChart.tsx` | Task 2, 3, 6, 7, 10 |
| `src/components/schedule/ScheduleFormModal.tsx` | Task 9 |
| `src/components/settings/SettingsPage.tsx` | Task 8 |

---

## Task 1: 移除 Teams / 發佈功能（需求 3）

**Files:**
- Delete: `src/store/teamsStore.ts`
- Delete: `src/components/settings/TeamsSettingsPage.tsx`
- Delete: `server/src/routes/notify.ts`
- Modify: `server/src/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/types.ts`
- Modify: `server/src/types.ts`

- [ ] **Step 1.1: 刪除 Teams 相關檔案**

```bash
# In project root (f:\vsms\vsms-export)
del src\store\teamsStore.ts
del src\components\settings\TeamsSettingsPage.tsx
del server\src\routes\notify.ts
```

- [ ] **Step 1.2: 移除 server/src/index.ts 中的 notify 路由**

在 `server/src/index.ts`，刪除這兩行：
```typescript
// 刪除這一行（import）:
import notifyRouter from './routes/notify.js'

// 刪除這一行（掛載）:
app.use('/api/notify', notifyRouter)
```

結果（只保留）：
```typescript
import authRouter from './routes/auth.js'
import schedulesRouter from './routes/schedules.js'
import optionsRouter from './routes/options.js'
import usersRouter from './routes/users.js'
import auditRouter from './routes/audit.js'
import calendarRouter from './routes/calendar.js'
// ... （notifyRouter 已刪除）
app.use('/api/schedules', schedulesRouter)
app.use('/api/options', optionsRouter)
app.use('/api/users', usersRouter)
app.use('/api/audit', auditRouter)
app.use('/api/calendar', calendarRouter)
// （app.use('/api/notify', ...) 已刪除）
```

- [ ] **Step 1.3: 移除 src/App.tsx 中的 Teams 頁面**

在 `src/App.tsx`，刪除 import 與渲染：
```typescript
// 刪除 import：
import TeamsSettingsPage from './components/settings/TeamsSettingsPage'

// 刪除整個 teams view 區塊：
{view === 'teams' && role !== 'user' && (
  <div className="h-full overflow-y-auto">
    <TeamsSettingsPage />
  </div>
)}
```

- [ ] **Step 1.4: 移除 Header.tsx 中的 Teams tab、發佈按鈕**

在 `src/components/layout/Header.tsx`：

**a. import 行移除 `Bell` 和 `Send`：**
```typescript
// 原始：
import {
  LayoutList, BarChart2, Settings, Bell, ClipboardList,
  Upload, Download, Send, FileSpreadsheet, Plus, LogOut,
  ChevronDown
} from 'lucide-react'

// 改為：
import {
  LayoutList, BarChart2, Settings, ClipboardList,
  Upload, Download, FileSpreadsheet, Plus, LogOut,
  ChevronDown
} from 'lucide-react'
```

**b. NAV_TABS 陣列移除 teams 項目：**
```typescript
// 刪除這一項：
{ key: 'teams', label: 'Teams 設定', icon: <Bell size={15} />, userHidden: true },
```

**c. 刪除 `handleNotify` 函式（整個函式，約 10 行）：**
```typescript
// 刪除：
const handleNotify = async () => {
  const completed = schedules.filter(s => s.isCompleted).length
  const delayed   = schedules.filter(s => s.isDelayed && !s.isCompleted).length
  const summary   = `• 排程總數：${schedules.length} 筆\n• 已完成：${completed} 筆\n• 延遲中：${delayed} 筆`
  try {
    await api.sendNotification(summary)
    addToast('✅ Teams 通知已發送！', 'success')
  } catch (err) {
    addToast(`❌ 發送失敗：${String(err)}`, 'error')
  }
}
```

**d. JSX 中刪除「發佈通知」按鈕區塊（約 15 行）：**
```tsx
// 刪除：
{/* 發佈通知 */}
{role !== 'user' && (
<button
  type="button"
  onClick={handleNotify}
  title="發佈 Teams 通知"
  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
             bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
             border border-slate-600 transition-all duration-150"
>
  <Send size={14} />
  發佈
</button>
)}
```

- [ ] **Step 1.5: 移除 src/lib/api.ts 中的 notify 方法**

```typescript
// 刪除整個 Notify 區塊：
// ── Notify ────────────────────────────────────────────
sendNotification: (summary: string) =>
  req<{ ok: boolean }>('POST', '/notify', { summary }),
testTeamsWebhook: (webhookUrl: string) =>
  req<{ ok: boolean }>('POST', '/notify/test', { webhookUrl }),
```

- [ ] **Step 1.6: 更新 src/types.ts**

```typescript
// 刪除 NotifyConfig 介面：
export interface NotifyConfig {
  enabled: boolean
  teamsWebhookUrl: string
  systemUrl: string
  recipients: Recipient[]
}

// 刪除 Recipient 介面：
export interface Recipient {
  id: string
  name: string
  note: string
  isActive: boolean
}

// View 型別移除 'teams'（原始：'main' | 'analytics' | 'settings' | 'teams' | 'audit' | 'accounts'）：
export type View = 'main' | 'analytics' | 'settings' | 'audit' | 'accounts'

// AuditAction 移除 'SEND_NOTIFICATION'：
export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_SCHEDULE'
  | 'UPDATE_SCHEDULE'
  | 'DELETE_SCHEDULE'
  | 'IMPORT_SCHEDULES'
  | 'EXPORT_DASHBOARD'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DISABLE_USER'
  | 'UPDATE_SETTINGS'
```

- [ ] **Step 1.7: 更新 server/src/types.ts**

```typescript
// 刪除 NotifyConfig 介面：
export interface NotifyConfig {
  enabled: boolean
  teamsWebhookUrl: string
  systemUrl: string
  recipients: Recipient[]
}

// 刪除 Recipient 介面：
export interface Recipient {
  id: string
  name: string
  note: string
  isActive: boolean
}

// AuditAction 移除 'SEND_NOTIFICATION'：
export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_SCHEDULE'
  | 'UPDATE_SCHEDULE'
  | 'DELETE_SCHEDULE'
  | 'IMPORT_SCHEDULES'
  | 'EXPORT_DASHBOARD'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DISABLE_USER'
  | 'UPDATE_SETTINGS'
```

- [ ] **Step 1.8: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

Expected: 0 errors（若有殘留 import 錯誤，逐一修正）

- [ ] **Step 1.9: Commit**

```bash
git add -A
git commit -m "feat: remove Teams/notify features (req 3)"
```

---

## Task 2: 時間篩選隱藏範圍外排程（需求 5）

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`

- [ ] **Step 2.1: 在 applyFilter 中加入日期重疊判斷**

在 `src/components/schedule/GanttChart.tsx` 的 `applyFilter` 函式（約第 105 行），在 `let result = schedules.filter(s => {` 的區塊內，**在 `return true` 之前**加入：

```typescript
function applyFilter(schedules: Schedule[], fs: FilterSortState): Schedule[] {
  let result = schedules.filter(s => {
    if (fs.categories.length    && !fs.categories.includes(s.category))       return false
    if (fs.testUnits.length     && !fs.testUnits.includes(s.testUnit))         return false
    if (fs.testEngineers.length && !fs.testEngineers.includes(s.testEngineer)) return false
    if (fs.statuses.length      && !fs.statuses.includes(computeStatus(s)))    return false
    if (fs.keyword) {
      const kw     = fs.keyword.toLowerCase()
      const target = [s.projectName, s.taskDescription, s.requiredPersonnel, s.testReport]
        .join(' ').toLowerCase()
      if (!target.includes(kw)) return false
    }
    // ★ 時間篩選：移除與設定範圍無重疊的排程
    if (fs.ganttStart && s.endDate < fs.ganttStart) return false
    if (fs.ganttEnd   && s.startDate > fs.ganttEnd) return false
    return true
  })
  // ... （排序邏輯不變）
```

- [ ] **Step 2.2: 手動測試**

啟動前端，設定甘特圖開始日期為某個日期，確認日期之前的排程消失；設定結束日期，確認結束日後的排程消失。兩者都設時只剩有重疊的排程。清除後全部重新顯示。

- [ ] **Step 2.3: Commit**

```bash
git add src/components/schedule/GanttChart.tsx
git commit -m "feat: filter gantt rows outside time range (req 5)"
```

---

## Task 3: User 查看所有單位排程（需求 2）

**Files:**
- Modify: `server/src/routes/schedules.ts`
- Modify: `src/components/schedule/FilterSortBar.tsx`
- Modify: `src/components/schedule/GanttChart.tsx`

### 後端：移除 User 的 linkedEngineer 過濾

- [ ] **Step 3.1: 移除 schedules.ts GET 中的 User 過濾邏輯**

在 `server/src/routes/schedules.ts`，GET `/` 路由（約第 39 行），**刪除** User 角色的過濾區塊：

```typescript
// 刪除這段（約 5 行）：
if (req.session.role === 'user') {
  const user = await prisma.user.findUnique({ where: { username: req.session.username ?? '' } })
  const engineer = user?.linkedEngineer ?? ''
  res.json(mapped.filter(s => s.testEngineer === engineer))
  return
}
```

GET 路由修改後為：
```typescript
// GET /api/schedules
router.get('/', async (req, res) => {
  const schedules = await prisma.schedule.findMany({ orderBy: { createdAt: 'asc' } })
  const mapped = schedules.map(toSchedule)
  res.json(mapped)
})
```

### 前端：FilterSortState 新增 showAllUnits

- [ ] **Step 3.2: 更新 FilterSortBar.tsx 的 FilterSortState 型別**

在 `src/components/schedule/FilterSortBar.tsx`，`FilterSortState` 介面新增欄位：

```typescript
export interface FilterSortState {
  categories:    string[]
  testUnits:     string[]
  testEngineers: string[]
  statuses:      ScheduleStatus[]
  keyword:       string
  sortRules:     SortRule[]
  ganttStart:    string
  ganttEnd:      string
  showAllUnits:  boolean   // ★ 新增：User 角色是否顯示所有單位
}

export const EMPTY_FILTER: FilterSortState = {
  categories: [], testUnits: [], testEngineers: [], statuses: [],
  keyword: '',
  sortRules: [...DEFAULT_SORT_RULES],
  ganttStart: '', ganttEnd: '',
  showAllUnits: false,   // ★ 新增
}
```

- [ ] **Step 3.3: 在 FilterSortBar JSX 中新增「顯示所有單位」切換 chip**

在 `FilterSortBar` 元件中，找到「清除全部」按鈕（`RotateCcw` icon）附近，在其**前面**新增 User 專屬的 chip。

首先在 FilterSortBar props 介面增加 `role`：
```typescript
interface Props {
  value:            FilterSortState
  onChange:         (v: FilterSortState) => void
  collapsed:        boolean
  onToggleCollapse: () => void
  role:             'super_admin' | 'admin' | 'user' | null   // ★ 新增
}

export function FilterSortBar({ value, onChange, collapsed, onToggleCollapse, role }: Props) {
```

然後在 JSX 中（於「清除全部」按鈕前），加入：
```tsx
{/* 顯示所有單位切換（User 專屬） */}
{role === 'user' && (
  <button
    type="button"
    onClick={() => {
      const next = { ...value, showAllUnits: !value.showAllUnits }
      localStorage.setItem('vsms-show-all-units', String(next.showAllUnits))
      onChange(next)
    }}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors
      ${value.showAllUnits
        ? 'bg-blue-500 text-white border-blue-500'
        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
      }`}
  >
    <span>👁</span>
    {value.showAllUnits ? '所有單位 ✓' : '顯示所有單位'}
  </button>
)}
```

- [ ] **Step 3.4: 更新 GanttChart.tsx 使用 role + showAllUnits 過濾**

**a. GanttChart 初始化 filterSort 時從 localStorage 讀取 showAllUnits：**

```typescript
// 原始：
const [filterSort, setFilterSort] = useState<FilterSortState>(EMPTY_FILTER)

// 改為：
const [filterSort, setFilterSort] = useState<FilterSortState>(() => ({
  ...EMPTY_FILTER,
  showAllUnits: localStorage.getItem('vsms-show-all-units') === 'true',
}))
```

**b. 從 authStore 取得 allowedUnits：**

```typescript
// 原始（約第 149 行）：
const { role } = useAuthStore()

// 改為：
const { role, allowedUnits } = useAuthStore()
```

**c. 傳 role 給 FilterSortBar：**
```tsx
// 原始：
<FilterSortBar value={filterSort} onChange={setFilterSort}
  collapsed={filterCollapsed} onToggleCollapse={onToggleFilter} />

// 改為：
<FilterSortBar value={filterSort} onChange={setFilterSort}
  collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
  role={role} />
```

**d. 在 applyFilter 加入 allowedUnits 過濾邏輯：**

`applyFilter` 改為接受額外參數：
```typescript
function applyFilter(
  schedules: Schedule[],
  fs: FilterSortState,
  role: 'super_admin' | 'admin' | 'user' | null,
  allowedUnits: string[],
): Schedule[] {
  let result = schedules.filter(s => {
    // ★ User allowedUnits 過濾（showAllUnits = false 且 allowedUnits 非空時套用）
    if (role === 'user' && !fs.showAllUnits && allowedUnits.length > 0) {
      if (!allowedUnits.includes(s.testUnit)) return false
    }
    if (fs.categories.length    && !fs.categories.includes(s.category))       return false
    if (fs.testUnits.length     && !fs.testUnits.includes(s.testUnit))         return false
    if (fs.testEngineers.length && !fs.testEngineers.includes(s.testEngineer)) return false
    if (fs.statuses.length      && !fs.statuses.includes(computeStatus(s)))    return false
    if (fs.keyword) {
      const kw     = fs.keyword.toLowerCase()
      const target = [s.projectName, s.taskDescription, s.requiredPersonnel, s.testReport]
        .join(' ').toLowerCase()
      if (!target.includes(kw)) return false
    }
    if (fs.ganttStart && s.endDate < fs.ganttStart) return false
    if (fs.ganttEnd   && s.startDate > fs.ganttEnd) return false
    return true
  })

  const rules: SortRule[] = fs.sortRules.length > 0 ? fs.sortRules : DEFAULT_SORT_RULES
  result = result.slice().sort((a, b) => {
    for (const rule of rules) {
      const av = getSortValue(a, rule.field)
      const bv = getSortValue(b, rule.field)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp
    }
    return 0
  })
  return result
}
```

**e. 在 GanttChart 元件中更新 applyFilter 呼叫：**

```typescript
// 找到 filtered 的計算（useMemo 或直接呼叫），改為傳入 role 和 allowedUnits
const filtered = useMemo(
  () => applyFilter(schedules, filterSort, role, allowedUnits),
  [schedules, filterSort, role, allowedUnits]
)
```

注意：若原本不是 useMemo，要找到 `applyFilter(schedules, filterSort)` 的呼叫，改為 `applyFilter(schedules, filterSort, role, allowedUnits)`。

- [ ] **Step 3.5: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3.6: Commit**

```bash
git add -A
git commit -m "feat: user show-all-units toggle (req 2)"
```

---

## Task 4: DB Migration（Schedule 新欄位 + Device 資料表）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 4.1: 更新 prisma/schema.prisma**

在 `Schedule` model 的 `updatedAt` 欄位之後（`@@index` 之前），加入 5 個欄位：

```prisma
model Schedule {
  id                String   @id @default(uuid())
  category          String   @db.VarChar(100)
  projectName       String   @db.VarChar(100)
  taskDescription   String   @db.VarChar(500)
  testUnit          String   @db.VarChar(100)
  testEngineer      String   @db.VarChar(100)
  timeResource      Int
  startDate         String   @db.VarChar(10)
  endDate           String   @db.VarChar(10)
  requiredPersonnel String   @db.VarChar(200)
  testReport        String   @db.VarChar(500)
  isCompleted       Boolean  @default(false)
  isDelayed         Boolean  @default(false)
  delayReason       String   @db.VarChar(5000)
  createdBy         String   @db.VarChar(100)
  updatedBy         String   @db.VarChar(100)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  adminFlag         Boolean  @default(false)
  adminFlagNote     String   @db.VarChar(500) @default("")
  userFlag          Boolean  @default(false)
  userFlagNote      String   @db.VarChar(500) @default("")
  device            String   @db.VarChar(100) @default("")

  @@index([testUnit])
  @@index([isCompleted, isDelayed])
  @@index([startDate, endDate])
  @@map("schedules")
}
```

在 `CalendarConfig` model **之後**新增 `Device` model：

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

- [ ] **Step 4.2: 執行 Prisma migration**

```bash
npx prisma migrate dev --name "add_flags_and_device"
```

Expected output：
```
✔ Your database is now in sync with your schema.
```

如有錯誤先檢查 DATABASE_URL 環境變數是否正確設定（`.env` 檔案）。

- [ ] **Step 4.3: 產生 Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 4.4: Commit**

```bash
git add prisma/
git commit -m "feat: prisma migration - add flags and device fields"
```

---

## Task 5: 型別更新 + 雙旗標 API（需求 1 後端）

**Files:**
- Modify: `server/src/types.ts`
- Modify: `src/types.ts`
- Modify: `server/src/routes/schedules.ts`

### 型別更新

- [ ] **Step 5.1: 更新 server/src/types.ts**

在 `Schedule` 介面加入旗標與設備欄位（放在 `updatedAt` 之後）：

```typescript
export interface Schedule {
  id: string
  category: string
  projectName: string
  taskDescription: string
  testUnit: string
  testEngineer: string
  timeResource: number
  startDate: string
  endDate: string
  requiredPersonnel: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  delayReason: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  adminFlag:     boolean   // Admin/Super Admin 專屬
  adminFlagNote: string
  userFlag:      boolean
  userFlagNote:  string
  device:        string    // 設備 value，空字串表示未指定
}
```

在 `AuditAction` 型別加入 `'FLAG_SCHEDULE'`：
```typescript
export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_SCHEDULE'
  | 'UPDATE_SCHEDULE'
  | 'DELETE_SCHEDULE'
  | 'IMPORT_SCHEDULES'
  | 'EXPORT_DASHBOARD'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DISABLE_USER'
  | 'UPDATE_SETTINGS'
  | 'FLAG_SCHEDULE'
```

- [ ] **Step 5.2: 更新 src/types.ts**

同樣在 `Schedule` 介面的 `updatedAt` 之後加入：
```typescript
export interface Schedule {
  id: string
  category: string
  projectName: string
  taskDescription: string
  testUnit: string
  testEngineer: string
  timeResource: number
  startDate: string        // YYYY/MM/DD
  endDate: string          // YYYY/MM/DD
  requiredPersonnel: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  delayReason: string
  createdBy: string
  updatedBy: string
  createdAt: string        // ISO 8601
  updatedAt: string        // ISO 8601
  adminFlag:     boolean
  adminFlagNote: string
  userFlag:      boolean
  userFlagNote:  string
  device:        string
}
```

`AuditAction` 同樣加入 `'FLAG_SCHEDULE'`（同 Step 5.1）。

### schedules.ts 後端邏輯

- [ ] **Step 5.3: 更新 toSchedule helper（加入新欄位）**

在 `server/src/routes/schedules.ts`，`toSchedule` helper 函式的型別參數與回傳值更新：

```typescript
function toSchedule(s: {
  id: string; category: string; projectName: string; taskDescription: string;
  testUnit: string; testEngineer: string; timeResource: number;
  startDate: string; endDate: string; requiredPersonnel: string;
  testReport: string; isCompleted: boolean; isDelayed: boolean;
  delayReason: string; createdBy: string; updatedBy: string;
  createdAt: Date; updatedAt: Date;
  adminFlag: boolean; adminFlagNote: string;
  userFlag: boolean; userFlagNote: string;
  device: string;
}): Schedule {
  return { ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
}
```

- [ ] **Step 5.4: GET /api/schedules 對 User 角色遮罩 adminFlag**

在 `server/src/routes/schedules.ts` 的 GET 路由（Task 3 後已移除 linkedEngineer 過濾），加入 User 角色的 adminFlag 遮罩：

```typescript
// GET /api/schedules
router.get('/', async (req, res) => {
  const schedules = await prisma.schedule.findMany({ orderBy: { createdAt: 'asc' } })
  const mapped = schedules.map(toSchedule)

  // User 角色不可見 adminFlag / adminFlagNote
  if (req.session.role === 'user') {
    res.json(mapped.map(s => ({
      ...s,
      adminFlag: undefined,
      adminFlagNote: undefined,
    })))
    return
  }

  res.json(mapped)
})
```

- [ ] **Step 5.5: PUT /api/schedules/:id — User 忽略 adminFlag，Admin 可更新所有旗標，寫 FLAG_SCHEDULE audit**

在 `server/src/routes/schedules.ts` 的 User 分支 PUT（約第 148 行），在更新之前插入 adminFlag 的 strip 邏輯，並在旗標欄位有變動時寫 FLAG_SCHEDULE：

**User 分支（約第 148-174 行）修改：**
```typescript
if (req.session.role === 'user') {
  const user = await prisma.user.findUnique({ where: { username } })
  const engineer = user?.linkedEngineer ?? ''
  const displayName = user?.displayName ?? username

  if (existing.testEngineer !== engineer) {
    res.status(403).json({ ok: false, message: '您只能修改指派給自己的排程', code: 'NOT_OWN_SCHEDULE' })
    return
  }
  const body = req.body as Partial<Schedule>
  if (body.testEngineer !== undefined && body.testEngineer !== engineer) {
    res.status(403).json({ ok: false, message: '不可變更測試人員欄位', code: 'CANNOT_CHANGE_ENGINEER' })
    return
  }

  // ★ User 不可修改 adminFlag / adminFlagNote
  const safeBody = { ...body }
  delete (safeBody as Record<string, unknown>).adminFlag
  delete (safeBody as Record<string, unknown>).adminFlagNote

  const beforeRecord = existing as unknown as Record<string, unknown>
  const changedFields = Object.keys(safeBody).filter(
    k => JSON.stringify(beforeRecord[k]) !== JSON.stringify((safeBody as Record<string, unknown>)[k])
  )

  const updated = await prisma.schedule.update({
    where: { id: scheduleId },
    data: { ...safeBody, testEngineer: engineer, updatedBy: username, updatedAt: new Date() },
  })

  // ★ 若旗標欄位有變動，另寫 FLAG_SCHEDULE audit
  const flagChanged = changedFields.some(f => ['userFlag', 'userFlagNote'].includes(f))
  if (flagChanged) {
    await appendAudit(username, displayName, 'FLAG_SCHEDULE', existing.projectName,
      changedFields.filter(f => ['userFlag', 'userFlagNote'].includes(f)))
  } else {
    await appendAudit(username, displayName, 'UPDATE_SCHEDULE', scheduleId, changedFields)
  }
  res.json(toSchedule(updated))
  return
}
```

**Admin/Super Admin 分支（約第 177 行之後），同樣在旗標有變時寫 FLAG_SCHEDULE：**
在 Admin/SA PUT 分支最後，`appendAudit` 呼叫前插入：
```typescript
// ★ 旗標操作改用 FLAG_SCHEDULE action
const flagFields = ['adminFlag', 'adminFlagNote', 'userFlag', 'userFlagNote']
const isFlagOnly = changedFields.length > 0 && changedFields.every(f => flagFields.includes(f))

if (isFlagOnly) {
  await appendAudit(username, displayName, 'FLAG_SCHEDULE', existing.projectName, changedFields)
} else {
  await appendAudit(username, displayName, 'UPDATE_SCHEDULE', scheduleId, changedFields)
}
res.json(toSchedule(updated))
```

注意：移除原有 `res.json(toSchedule(updated))` 與 `appendAudit` 那兩行，改為上面的邏輯。

- [ ] **Step 5.6: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5.7: Commit**

```bash
git add -A
git commit -m "feat: flag fields in types and schedules API (req 1 backend)"
```

---

## Task 6: 旗標 Popover 與甘特圖列圖示（需求 1 前端）

**Files:**
- Create: `src/components/schedule/FlagPopover.tsx`
- Modify: `src/store/scheduleStore.ts`
- Modify: `src/components/schedule/GanttChart.tsx`

### FlagPopover 元件

- [ ] **Step 6.1: 新增 src/components/schedule/FlagPopover.tsx**

```tsx
// src/components/schedule/FlagPopover.tsx
import { useState, useRef, useEffect } from 'react'

interface Props {
  flagged:  boolean
  note:     string
  color:    'orange' | 'blue'
  onSave:   (note: string) => Promise<void>
  onRemove: () => Promise<void>
  onClose:  () => void
}

export function FlagPopover({ flagged, note, color, onSave, onRemove, onClose }: Props) {
  const [inputNote, setInputNote] = useState(note)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 點擊外部關閉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const borderColor = color === 'orange' ? 'border-orange-300' : 'border-blue-300'
  const btnColor    = color === 'orange'
    ? 'bg-orange-500 hover:bg-orange-600 text-white'
    : 'bg-blue-500 hover:bg-blue-600 text-white'

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(inputNote) }
    finally { setSaving(false) }
  }

  const handleRemove = async () => {
    setSaving(true)
    try { await onRemove() }
    finally { setSaving(false) }
  }

  return (
    <div ref={ref}
      className={`absolute z-50 bg-white rounded-lg shadow-xl border ${borderColor} p-3 w-56`}
      style={{ top: '100%', right: 0, marginTop: 4 }}
    >
      <textarea
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={3}
        maxLength={500}
        placeholder="附註（選填）"
        value={inputNote}
        onChange={e => setInputNote(e.target.value)}
        disabled={saving}
      />
      <div className="flex gap-1.5 mt-2 justify-end">
        {flagged ? (
          <>
            <button type="button" disabled={saving} onClick={handleSave}
              className={`text-xs px-2.5 py-1 rounded ${btnColor} disabled:opacity-50`}>
              更新
            </button>
            <button type="button" disabled={saving} onClick={handleRemove}
              className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
              移除標記
            </button>
          </>
        ) : (
          <button type="button" disabled={saving} onClick={handleSave}
            className={`text-xs px-2.5 py-1 rounded ${btnColor} disabled:opacity-50`}>
            標記
          </button>
        )}
        <button type="button" disabled={saving} onClick={onClose}
          className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
          取消
        </button>
      </div>
    </div>
  )
}
```

### scheduleStore 新增 updateFlag action

- [ ] **Step 6.2: 查看 src/store/scheduleStore.ts 的 update 方法**

確認 `scheduleStore.ts` 有 `update(id, data)` 方法可直接呼叫。若有，不需新增額外方法，GanttChart 可直接呼叫 `update(id, { userFlag: true, userFlagNote: note })`。

若無 update 方法，則在 scheduleStore 的 state interface 和 actions 中加入：
```typescript
// 在 interface ScheduleState 中加入：
update: (id: string, data: Partial<Schedule>) => Promise<void>

// 在 create 中加入（調用現有 api.updateSchedule）：
update: async (id, data) => {
  const updated = await api.updateSchedule(id, data)
  set(state => ({
    schedules: state.schedules.map(s => s.id === id ? updated : s)
  }))
},
```

### GanttChart 旗標圖示

- [ ] **Step 6.3: 在 GanttChart.tsx 加入旗標 state 與 import**

在 GanttChart.tsx 頂部 import 區新增：
```typescript
import { ShieldCheck, Bookmark } from 'lucide-react'
import { FlagPopover } from './FlagPopover'
```

在 GanttChart 元件內部，現有 state 宣告之後新增旗標 popover state：
```typescript
interface FlagPopoverState {
  scheduleId: string
  type: 'admin' | 'user'
}
const [flagPopover, setFlagPopover] = useState<FlagPopoverState | null>(null)
```

- [ ] **Step 6.4: 在左側列 JSX 中加入旗標圖示按鈕**

找到 GanttChart.tsx 左下區（約第 431 行），`filtered.map((s, i) => {...})` 的每列 JSX，在「操作按鈕」區（`absolute right-2 top-[10px]` 那個 div）**前面**插入旗標圖示。

修改後的左側列 row JSX：
```tsx
{filtered.map((s, i) => {
  const status      = computeStatus(s)
  const statusColor = STATUS_COLORS[status]
  const evenFill    = i % 2 === 0 ? '#ffffff' : '#f8fafc'
  return (
    <div key={s.id} className="relative border-b"
      style={{ height: ROW_H, background: evenFill }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
      onMouseLeave={() => setTooltip(null)}>
      <div className="flex items-center gap-2 px-2 pt-[6px]">
        <div className="flex-shrink-0 w-[72px] h-[24px] rounded-[5px] text-[11px] font-bold flex items-center justify-center"
          style={{ background: statusColor.bg, color: statusColor.text, letterSpacing: '0.02em' }}>
          {status}
        </div>
        <div className="min-w-0 text-[13px] font-semibold text-slate-800 truncate pr-14">
          {s.projectName}
        </div>
      </div>
      {s.taskDescription && <div className="text-[11px] text-slate-500 truncate pl-[86px] -mt-[2px]">{s.taskDescription}</div>}

      {/* ★ 旗標圖示 + 操作按鈕 */}
      <div className="absolute right-2 top-[10px] flex gap-1">
        {/* Admin 旗標（Admin/SA 限定） */}
        {role !== 'user' && (
          <div className="relative">
            <button
              type="button"
              title={s.adminFlag ? (s.adminFlagNote || 'Admin 旗標已標記') : '設定 Admin 旗標'}
              onClick={() => setFlagPopover(
                flagPopover?.scheduleId === s.id && flagPopover.type === 'admin'
                  ? null
                  : { scheduleId: s.id, type: 'admin' }
              )}
              className={`w-[22px] h-[22px] flex items-center justify-center rounded-md transition-colors duration-100
                ${s.adminFlag
                  ? 'bg-orange-100 text-orange-500 hover:bg-orange-200'
                  : 'bg-gray-50 text-gray-300 hover:text-orange-400 hover:bg-orange-50'
                }`}
            >
              <ShieldCheck size={12} strokeWidth={2} />
            </button>
            {flagPopover?.scheduleId === s.id && flagPopover.type === 'admin' && (
              <FlagPopover
                flagged={s.adminFlag}
                note={s.adminFlagNote}
                color="orange"
                onClose={() => setFlagPopover(null)}
                onSave={async (note) => {
                  await update(s.id, { adminFlag: true, adminFlagNote: note })
                  setFlagPopover(null)
                }}
                onRemove={async () => {
                  await update(s.id, { adminFlag: false, adminFlagNote: '' })
                  setFlagPopover(null)
                }}
              />
            )}
          </div>
        )}

        {/* 使用者旗標（全角色可見） */}
        <div className="relative">
          <button
            type="button"
            title={s.userFlag ? (s.userFlagNote || '旗標已標記') : '設定旗標'}
            onClick={() => setFlagPopover(
              flagPopover?.scheduleId === s.id && flagPopover.type === 'user'
                ? null
                : { scheduleId: s.id, type: 'user' }
            )}
            className={`w-[22px] h-[22px] flex items-center justify-center rounded-md transition-colors duration-100
              ${s.userFlag
                ? 'bg-blue-100 text-blue-500 hover:bg-blue-200'
                : 'bg-gray-50 text-gray-300 hover:text-blue-400 hover:bg-blue-50'
              }`}
          >
            <Bookmark size={12} strokeWidth={2} />
          </button>
          {flagPopover?.scheduleId === s.id && flagPopover.type === 'user' && (
            <FlagPopover
              flagged={s.userFlag}
              note={s.userFlagNote}
              color="blue"
              onClose={() => setFlagPopover(null)}
              onSave={async (note) => {
                await update(s.id, { userFlag: true, userFlagNote: note })
                setFlagPopover(null)
              }}
              onRemove={async () => {
                await update(s.id, { userFlag: false, userFlagNote: '' })
                setFlagPopover(null)
              }}
            />
          )}
        </div>

        {/* 現有編輯按鈕 */}
        <button type="button" title="編輯" onClick={() => setEditTarget(s)}
          className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors duration-100">
          <Pencil size={12} strokeWidth={2.5} />
        </button>
        {role !== 'user' && (
          <button type="button" title="刪除" onClick={() => setDeleteTarget(s)}
            className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors duration-100">
            <Trash2 size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  )
})}
```

注意：`update` 來自 `useScheduleStore()`。確認 GanttChart 已有 `const { schedules, remove, update } = useScheduleStore()`。

- [ ] **Step 6.5: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6.6: 手動測試**

啟動前後端，登入 Admin 帳號，在甘特圖中點擊 Shield 圖示，確認 popover 出現，輸入附註並儲存，圖示變為橘色實心；再次點擊，「移除標記」後圖示恢復半透明。User 角色只看到 Bookmark 圖示。

- [ ] **Step 6.7: Commit**

```bash
git add -A
git commit -m "feat: flag popover and gantt row icons (req 1 frontend)"
```

---

## Task 7: 旗標篩選 Chip（需求 1 篩選 UI）

**Files:**
- Modify: `src/components/schedule/FilterSortBar.tsx`
- Modify: `src/components/schedule/GanttChart.tsx`

- [ ] **Step 7.1: 在 FilterSortState 加入旗標篩選欄位**

在 `src/components/schedule/FilterSortBar.tsx`，`FilterSortState` 介面再新增：

```typescript
export interface FilterSortState {
  categories:     string[]
  testUnits:      string[]
  testEngineers:  string[]
  statuses:       ScheduleStatus[]
  keyword:        string
  sortRules:      SortRule[]
  ganttStart:     string
  ganttEnd:       string
  showAllUnits:   boolean
  showUserFlagged:  boolean   // ★ 只顯示有 userFlag 的排程
  showAdminFlagged: boolean   // ★ 只顯示有 adminFlag 的排程（Admin/SA 限定）
}

export const EMPTY_FILTER: FilterSortState = {
  categories: [], testUnits: [], testEngineers: [], statuses: [],
  keyword: '',
  sortRules: [...DEFAULT_SORT_RULES],
  ganttStart: '', ganttEnd: '',
  showAllUnits: false,
  showUserFlagged: false,
  showAdminFlagged: false,
}
```

- [ ] **Step 7.2: 在 FilterSortBar JSX 中加入旗標篩選 chip**

在 FilterSortBar 的 chip 列（「顯示所有單位」chip 附近），加入旗標篩選 chip：

```tsx
{/* 使用者旗標篩選（全角色） */}
<button
  type="button"
  onClick={() => onChange({ ...value, showUserFlagged: !value.showUserFlagged })}
  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors
    ${value.showUserFlagged
      ? 'bg-blue-500 text-white border-blue-500'
      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
    }`}
>
  <Bookmark size={13} />
  只顯示已標記
</button>

{/* Admin 旗標篩選（Admin/SA 限定） */}
{role !== 'user' && (
  <button
    type="button"
    onClick={() => onChange({ ...value, showAdminFlagged: !value.showAdminFlagged })}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors
      ${value.showAdminFlagged
        ? 'bg-orange-500 text-white border-orange-500'
        : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
      }`}
  >
    <ShieldCheck size={13} />
    只顯示 Admin 標記
  </button>
)}
```

在 FilterSortBar 的 import 行加入 `Bookmark, ShieldCheck`：
```typescript
import { ..., Bookmark, ShieldCheck } from 'lucide-react'
```

確保「清除全部」（RotateCcw）按鈕的 onClick 會重置這兩個新欄位（`EMPTY_FILTER` 已包含預設值，若清除是設回 EMPTY_FILTER 則自動涵蓋）。

- [ ] **Step 7.3: 在 GanttChart.tsx applyFilter 加入旗標過濾**

```typescript
// 在 applyFilter 的 filter 條件中加入（在 ganttStart/ganttEnd 後）：
if (fs.showUserFlagged  && !s.userFlag)  return false
if (fs.showAdminFlagged && !s.adminFlag) return false
```

- [ ] **Step 7.4: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

- [ ] **Step 7.5: Commit**

```bash
git add -A
git commit -m "feat: flag filter chips in FilterSortBar (req 1)"
```

---

## Task 8: 設備管理後端 + DeviceManager 設定頁面（需求 4 設定）

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/routes/options.ts`
- Modify: `src/types.ts`
- Modify: `src/constants.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/store/uiStore.ts`
- Modify: `src/store/optionsStore.ts`
- Create: `src/components/settings/DeviceManager.tsx`
- Modify: `src/components/settings/SettingsPage.tsx`

### 後端

- [ ] **Step 8.1: 更新 server/src/types.ts — OptionsMap 加入 devices**

```typescript
export interface OptionsMap {
  categories: Option[]
  testUnits:  TestUnitOption[]
  restDays:   RestDaysConfig
  devices:    Option[]          // ★ 新增
}
```

- [ ] **Step 8.2: 更新 server/src/routes/options.ts — GET 回傳 devices，新增 CRUD 端點**

**更新 GET /api/options 加入 devices：**

```typescript
// GET /api/options
router.get('/', async (_req, res) => {
  const [categories, testUnits, restDays, devices] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.testUnit.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { engineers: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
    prisma.device.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  const result: OptionsMap = {
    categories: categories.map(({ id, value, label, isActive, sortOrder }) => ({
      id, value, label, isActive, sortOrder,
    })),
    testUnits: testUnits.map(({ id, value, label, isActive, sortOrder, engineers }) => ({
      id, value, label, isActive, sortOrder,
      engineers: engineers.map(({ id, value, label, isActive, sortOrder }) => ({
        id, value, label, isActive, sortOrder,
      })),
    })),
    restDays: {
      weekends: restDays?.weekends ?? true,
      specificDates: (restDays?.specificDates as string[]) ?? [],
    },
    devices: devices.map(({ id, value, label, isActive, sortOrder }) => ({
      id, value, label, isActive, sortOrder,
    })),
  }

  res.json(result)
})
```

**新增 POST /api/options/devices：**

```typescript
// POST /api/options/devices — 新增設備（Admin / Super Admin only）
router.post('/devices', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const { value, label, sortOrder } = req.body as { value: string; label: string; sortOrder: number }
  if (!value?.trim() || !label?.trim()) {
    res.status(400).json({ ok: false, message: '名稱不可空白' })
    return
  }
  const { v4: uuidv4 } = await import('uuid')
  const device = await prisma.device.create({
    data: { id: uuidv4(), value: value.trim(), label: label.trim(), isActive: true, sortOrder: sortOrder ?? 0 },
  })
  res.status(201).json({ id: device.id, value: device.value, label: device.label, isActive: device.isActive, sortOrder: device.sortOrder })
})
```

注意：`uuid` 已在 schedules.ts 中使用，可在 options.ts 頂部直接 `import { v4 as uuidv4 } from 'uuid'`。

**新增 PUT /api/options/devices/:id：**

```typescript
// PUT /api/options/devices/:id — 編輯設備
router.put('/devices/:id', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const { id } = req.params as { id: string }
  const { label, isActive, sortOrder } = req.body as { label?: string; isActive?: boolean; sortOrder?: number }
  const updated = await prisma.device.update({
    where: { id },
    data: {
      ...(label !== undefined && { label: label.trim(), value: label.trim() }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })
  res.json({ id: updated.id, value: updated.value, label: updated.label, isActive: updated.isActive, sortOrder: updated.sortOrder })
})
```

**新增 DELETE /api/options/devices/:id：**

```typescript
// DELETE /api/options/devices/:id — 刪除設備
router.delete('/devices/:id', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const { id } = req.params as { id: string }
  // 檢查是否有排程使用此設備
  const device = await prisma.device.findUnique({ where: { id } })
  if (!device) { res.status(404).json({ ok: false, message: '設備不存在' }); return }

  const inUse = await prisma.schedule.count({ where: { device: device.value } })
  if (inUse > 0) {
    res.status(400).json({
      ok: false,
      message: `此設備目前有 ${inUse} 筆排程使用中，無法刪除`,
      code: 'DEVICE_IN_USE',
    })
    return
  }
  await prisma.device.delete({ where: { id } })
  res.json({ ok: true })
})
```

在 options.ts 頂部加入：
```typescript
import { v4 as uuidv4 } from 'uuid'
```

### 前端型別與 API

- [ ] **Step 8.3: 更新 src/types.ts — OptionsMap 加入 devices**

```typescript
export interface OptionsMap {
  categories: Option[]
  testUnits:  TestUnitOption[]
  restDays:   RestDaysConfig
  devices:    Option[]   // ★ 新增
}
```

- [ ] **Step 8.4: 更新 src/constants.ts — DEFAULT_OPTIONS 加入 devices**

```typescript
export const DEFAULT_OPTIONS: OptionsMap = {
  categories: [...],
  testUnits: [...],
  restDays: { weekends: true, specificDates: [] },
  devices: [],   // ★ 新增
}
```

- [ ] **Step 8.5: 更新 src/lib/api.ts — 新增 device CRUD 方法**

```typescript
// 在 api 物件末尾加入：
// ── Devices ───────────────────────────────────────────
createDevice: (data: { value: string; label: string; sortOrder: number }) =>
  req<Option>('POST', '/options/devices', data),
updateDevice: (id: string, data: { label?: string; isActive?: boolean; sortOrder?: number }) =>
  req<Option>('PUT', `/options/devices/${id}`, data),
deleteDevice: (id: string) =>
  req<{ ok: boolean }>('DELETE', `/options/devices/${id}`),
```

### 前端 Store

- [ ] **Step 8.6: 更新 src/store/uiStore.ts — SettingsTab 加入 'devices'**

```typescript
// 原始：
type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users'

// 改為：
type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices'
```

注意：`SettingsTab` 型別在 `uiStore.ts` 和 `SettingsPage.tsx` 都有定義，要同步更新兩個檔案。

- [ ] **Step 8.7: 更新 src/store/optionsStore.ts — 加入 device CRUD actions**

在 `OptionsState` interface 加入：
```typescript
addDevice:    (value: string) => Promise<void>
updateDevice: (id: string, label: string) => Promise<void>
toggleDevice: (id: string, isActive: boolean) => Promise<void>
deleteDevice: (id: string) => Promise<void>
```

在 `create<OptionsState>()` 的 actions 中加入：

```typescript
addDevice: async (value) => {
  const devices = get().options.devices
  const newDevice = await api.createDevice({ value, label: value, sortOrder: devices.length })
  set({ options: { ...get().options, devices: [...devices, newDevice] } })
},

updateDevice: async (id, label) => {
  const updated = await api.updateDevice(id, { label })
  set({
    options: {
      ...get().options,
      devices: get().options.devices.map(d => d.id === id ? { ...d, label, value: label } : d),
    },
  })
},

toggleDevice: async (id, isActive) => {
  await api.updateDevice(id, { isActive })
  set({
    options: {
      ...get().options,
      devices: get().options.devices.map(d => d.id === id ? { ...d, isActive } : d),
    },
  })
},

deleteDevice: async (id) => {
  await api.deleteDevice(id)
  set({
    options: {
      ...get().options,
      devices: get().options.devices.filter(d => d.id !== id),
    },
  })
},
```

### DeviceManager 元件

- [ ] **Step 8.8: 新增 src/components/settings/DeviceManager.tsx**

```tsx
// src/components/settings/DeviceManager.tsx
import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'

export function DeviceManager() {
  const { options, addDevice, updateDevice, toggleDevice, deleteDevice } = useOptionsStore()
  const [newValue, setNewValue] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleAdd = async () => {
    const v = newValue.trim()
    if (!v) return
    await addDevice(v)
    setNewValue("")
  }

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    try {
      await deleteDevice(id)
      setDeletingId(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setDeleteError(msg)
    }
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">設備管理</h3>
      <div className="space-y-2 mb-3">
        {options.devices.map(d => (
          <div key={d.id} className="flex items-center gap-2 py-1">
            {editId === d.id ? (
              <>
                <input className="border rounded px-2 py-1 text-sm flex-1"
                  value={editValue} onChange={e => setEditValue(e.target.value)} />
                <button type="button"
                  onClick={async () => { await updateDevice(d.id, editValue.trim()); setEditId(null) }}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded">確認</button>
                <button type="button" onClick={() => setEditId(null)}
                  className="text-xs px-2 py-1 border rounded">取消</button>
              </>
            ) : deletingId === d.id ? (
              <>
                <span className="flex-1 text-sm text-red-600">確定刪除「{d.label}」？</span>
                {deleteError && <span className="text-xs text-red-500">{deleteError}</span>}
                <button type="button" onClick={() => handleDelete(d.id)}
                  className="text-xs px-2 py-1 bg-red-500 text-white rounded">刪除</button>
                <button type="button" onClick={() => { setDeletingId(null); setDeleteError(null) }}
                  className="text-xs px-2 py-1 border rounded">取消</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${!d.isActive ? "line-through text-gray-400" : ""}`}>
                  {d.label}
                </span>
                <button type="button" onClick={() => { setEditId(d.id); setEditValue(d.label) }}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50">編輯</button>
                <button type="button" onClick={() => toggleDevice(d.id, !d.isActive)}
                  className={`text-xs px-2 py-1 rounded ${d.isActive ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                  {d.isActive ? '停用' : '啟用'}
                </button>
                <button type="button" onClick={() => setDeletingId(d.id)}
                  className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">刪除</button>
              </>
            )}
          </div>
        ))}
        {options.devices.length === 0 && (
          <p className="text-sm text-gray-400">尚未建立任何設備</p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text" placeholder="新增設備名稱"
          value={newValue} onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button type="button" onClick={handleAdd}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
          新增
        </button>
      </div>
    </div>
  )
}
```

### SettingsPage 更新

- [ ] **Step 8.9: 更新 src/components/settings/SettingsPage.tsx — 加入設備 tab**

**a. 更新型別與 tabs 陣列：**
```typescript
// 修改 SettingsTab 型別（此檔案也有定義）：
type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices'

// tabs 陣列加入 devices：
const tabs: { key: SettingsTab; label: string; superAdminOnly?: boolean; adminHidden?: boolean }[] = [
  { key: 'categories', label: '工作類別' },
  { key: 'units',      label: '測試單位' },
  { key: 'engineers',  label: '測試人員' },
  { key: 'restdays',   label: '休息日設定' },
  { key: 'devices',    label: '設備管理' },   // ★ Admin + SA 可見
  { key: 'users',      label: '帳號管理', superAdminOnly: true },
]
```

**b. import DeviceManager：**
```typescript
import { DeviceManager } from './DeviceManager'
```

**c. tab 內容加入 devices：**
```tsx
{activeTab === 'devices' && <DeviceManager />}
```

- [ ] **Step 8.10: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

- [ ] **Step 8.11: Commit**

```bash
git add -A
git commit -m "feat: device settings - backend endpoints and DeviceManager UI (req 4)"
```

---

## Task 9: 設備欄位於排程表單（需求 4 表單）

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/schedule/ScheduleFormModal.tsx`

- [ ] **Step 9.1: 更新 src/types.ts — ScheduleFormValues 加入 device**

```typescript
export interface ScheduleFormValues {
  category: string
  projectName: string
  taskDescription: string
  testUnit: string
  testEngineer: string
  timeResource: string
  startDate: Date | null
  endDate: Date | null
  requiredPersonnel: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  delayReason: string
  device: string          // ★ 新增，空字串表示未指定
}
```

- [ ] **Step 9.2: 更新 ScheduleFormModal.tsx — 表單加入設備下拉**

**a. EMPTY 初始值加入 device：**
```typescript
const EMPTY: ScheduleFormValues = {
  category: '', projectName: '', taskDescription: '',
  testUnit: '', testEngineer: '', timeResource: '',
  startDate: null, endDate: null,
  requiredPersonnel: '', testReport: '',
  isCompleted: false, isDelayed: false, delayReason: '',
  device: '',   // ★ 新增
}
```

**b. useEffect 編輯模式加入 device：**
```typescript
useEffect(() => {
  if (schedule) {
    setForm({
      category: schedule.category, projectName: schedule.projectName,
      taskDescription: schedule.taskDescription, testUnit: schedule.testUnit,
      testEngineer: schedule.testEngineer, timeResource: String(schedule.timeResource),
      startDate: parseDate(schedule.startDate), endDate: parseDate(schedule.endDate),
      requiredPersonnel: schedule.requiredPersonnel, testReport: schedule.testReport,
      isCompleted: schedule.isCompleted, isDelayed: schedule.isDelayed,
      delayReason: schedule.delayReason,
      device: schedule.device ?? '',   // ★ 新增
    })
  } else { setForm(EMPTY) }
  setErrors({})
}, [schedule, isOpen])
```

**c. handleSave 加入 device 欄位（Admin/SA 才儲存）：**
```typescript
const handleSave = async () => {
  if (!validate()) return
  setSubmitting(true)
  const data = {
    category: form.category, projectName: form.projectName.trim(),
    taskDescription: form.taskDescription.trim(), testUnit: form.testUnit,
    testEngineer: form.testEngineer, timeResource: Number(form.timeResource),
    startDate: formatDate(form.startDate!), endDate: formatDate(form.endDate!),
    requiredPersonnel: form.requiredPersonnel.trim(), testReport: form.testReport.trim(),
    isCompleted: form.isCompleted, isDelayed: form.isDelayed,
    delayReason: form.isDelayed ? form.delayReason.trim() : '',
    device: isUser ? undefined : form.device,   // ★ User 不修改 device
  }
  try {
    if (schedule) await update(schedule.id, data)
    else await add(data)
    onClose()
  } finally { setSubmitting(false) }
}
```

**d. JSX 加入設備下拉（在 `delayReason` 欄位後、submit 按鈕前，只在有設備時顯示）：**

先取得啟用設備清單：
```typescript
const activeDevices = options.devices?.filter(d => d.isActive) ?? []
```

然後在 JSX 中加入（`isUser` 時以 disabled 顯示，或直接隱藏）：
```tsx
{/* 設備欄位：只在系統中有設備時顯示 */}
{activeDevices.length > 0 && (
  field('設備', 'device', (
    <select
      value={form.device}
      onChange={e => setForm(f => ({ ...f, device: e.target.value }))}
      disabled={isUser}
      className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
        ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
    >
      <option value="">（無）</option>
      {activeDevices.map(d => <option key={d.id} value={d.value}>{d.label}</option>)}
    </select>
  ))
)}
```

- [ ] **Step 9.3: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

- [ ] **Step 9.4: 手動測試**

在設定頁新增一個設備，回到排程管理，點擊「新增排程」確認設備下拉出現。選擇設備後儲存，再次編輯確認設備已保存。若系統沒有設備，欄位不顯示。

- [ ] **Step 9.5: Commit**

```bash
git add -A
git commit -m "feat: device field in schedule form (req 4)"
```

---

## Task 10: 設備視角甘特圖（需求 4 視角）

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`
- Modify: `src/components/schedule/FilterSortBar.tsx`

### FilterSortBar 加入 devices 篩選欄位

- [ ] **Step 10.1: FilterSortState 加入 devices 篩選**

```typescript
export interface FilterSortState {
  // ...（現有欄位）...
  showAllUnits:     boolean
  showUserFlagged:  boolean
  showAdminFlagged: boolean
  devices:          string[]  // ★ 設備視角的設備篩選（未勾選 = 顯示全部）
}

export const EMPTY_FILTER: FilterSortState = {
  // ...（現有預設值）...
  showAllUnits: false,
  showUserFlagged: false,
  showAdminFlagged: false,
  devices: [],   // ★ 新增
}
```

- [ ] **Step 10.2: FilterSortBar JSX 加入設備多選篩選（設備視角時才顯示）**

FilterSortBar props 加入 `groupBy`：
```typescript
interface Props {
  value:            FilterSortState
  onChange:         (v: FilterSortState) => void
  collapsed:        boolean
  onToggleCollapse: () => void
  role:             'super_admin' | 'admin' | 'user' | null
  groupBy:          'engineer' | 'device'   // ★ 新增
}

export function FilterSortBar({ value, onChange, collapsed, onToggleCollapse, role, groupBy }: Props) {
```

在 FilterSortBar JSX 內（與其他多選篩選器並列），只在 `groupBy === 'device'` 時顯示設備篩選：
```tsx
{groupBy === 'device' && (
  <MultiSelectDropdown
    label="設備"
    options={(options.devices ?? []).filter(d => d.isActive).map(d => ({ value: d.value, label: d.label }))}
    selected={value.devices}
    onChange={selected => onChange({ ...value, devices: selected })}
  />
)}
```

（`MultiSelectDropdown` 已存在於 `src/components/shared/MultiSelectDropdown.tsx`，pattern 同工程師篩選）

### GanttChart 設備視角

- [ ] **Step 10.3: GanttChart 加入 groupBy state**

```typescript
// 在 GanttChart 元件內，現有 state 宣告後加入：
const [groupBy, setGroupBy] = useState<'engineer' | 'device'>(() =>
  (localStorage.getItem('vsms-gantt-group-by') as 'engineer' | 'device') ?? 'engineer'
)
```

- [ ] **Step 10.4: 在甘特圖收合控制列加入分組切換按鈕**

找到「甘特圖收合控制列」（約第 343 行），在 `onClick={onToggleGantt}` 的 div 內，**右側**加入分組切換按鈕（防止 click 事件冒泡到 toggle）：

```tsx
{/* ── 甘特圖收合控制列 ── */}
<div
  className="flex-shrink-0 flex items-center justify-between px-4 py-2
             bg-slate-50 border-b cursor-pointer
             hover:bg-slate-100 transition-colors duration-150 select-none"
  onClick={onToggleGantt}
>
  <div className="flex items-center gap-2">
    <span className="text-sm font-semibold text-slate-600">甘特圖</span>
    {hasGanttRange && (
      <span className="flex items-center gap-1 text-xs text-blue-600
                       bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
        <CalendarRange size={11} />
        {filterSort.ganttStart || '最早'} ～ {filterSort.ganttEnd || '最晚'}
      </span>
    )}
  </div>
  <div className="flex items-center gap-2">
    {/* ★ 分組切換按鈕 */}
    <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium"
      onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setGroupBy('engineer')
          localStorage.setItem('vsms-gantt-group-by', 'engineer')
        }}
        className={`px-2.5 py-1 transition-colors ${
          groupBy === 'engineer'
            ? 'bg-slate-600 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        按工程師
      </button>
      <button
        type="button"
        onClick={() => {
          setGroupBy('device')
          localStorage.setItem('vsms-gantt-group-by', 'device')
        }}
        className={`px-2.5 py-1 transition-colors border-l border-slate-300 ${
          groupBy === 'device'
            ? 'bg-slate-600 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        按設備
      </button>
    </div>
    <span className="text-slate-400 text-sm">
      {ganttCollapsed ? '▼ 展開' : '▲ 收合'}
    </span>
  </div>
</div>
```

- [ ] **Step 10.5: 傳 groupBy 給 FilterSortBar**

```tsx
// 原始：
<FilterSortBar value={filterSort} onChange={setFilterSort}
  collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
  role={role} />

// 改為：
<FilterSortBar value={filterSort} onChange={setFilterSort}
  collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
  role={role} groupBy={groupBy} />
```

- [ ] **Step 10.6: 實作設備視角渲染邏輯**

在 GanttChart 元件內，`filtered` 計算之後，新增設備視角的 rows 計算：

```typescript
// 設備視角的 rows（只在 groupBy === 'device' 時使用）
const deviceRows = useMemo(() => {
  if (groupBy !== 'device') return []
  const allDevices = (options.devices ?? [])
    .filter(d => d.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // 若有設備篩選，只顯示勾選的設備（未勾選 = 顯示全部）
  const activeDeviceValues = filterSort.devices.length > 0
    ? filterSort.devices
    : allDevices.map(d => d.value)

  return allDevices
    .filter(d => activeDeviceValues.includes(d.value))
    .map(d => ({
      device: d,
      // filtered 中指定此設備的排程
      schedules: filtered.filter(s => s.device === d.value),
    }))
}, [groupBy, options.devices, filtered, filterSort.devices])
```

- [ ] **Step 10.7: 在甘特圖主體加入設備視角分支**

找到 `{!ganttCollapsed && (` 的判斷區塊，在「無排程」的空狀態判斷和主體渲染中，加入設備視角分支：

```tsx
{!ganttCollapsed && (
  groupBy === 'device' ? (
    // ── 設備視角 ──────────────────────────────────────────
    deviceRows.length === 0 ? (
      <div className="p-10 text-center text-gray-400 text-sm">尚無設備，請至設定頁新增</div>
    ) : (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {/* 上排 Header（與工程師視角相同） */}
        <div className="flex-shrink-0 flex" style={{ height: HEADER_H }}>
          {/* ... 複製工程師視角 header SVG ... */}
          <div className="shrink-0 border-r relative"
            style={{ width: leftWidth, height: HEADER_H }} onWheel={forwardWheelToBody}>
            <svg width={leftWidth} height={HEADER_H} className="block">
              <rect x={0} y={0} width={leftWidth} height={HEADER_H} fill="#e2e8f0" />
              <text x={12} y={HEADER_MONTH / 2 + 6} fontSize={13} fill="#334155" fontWeight="700">設備視角</text>
              <line x1={0} y1={HEADER_MONTH} x2={leftWidth} y2={HEADER_MONTH} stroke="#cbd5e1" strokeWidth={1} />
              <line x1={0} y1={HEADER_MONTH + HEADER_WEEK} x2={leftWidth} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
              <line x1={0} y1={HEADER_H - 1} x2={leftWidth} y2={HEADER_H - 1} stroke="#cbd5e1" strokeWidth={1.5} />
            </svg>
          </div>
          <div ref={rightHeaderRef} className="flex-1 overflow-hidden" onWheel={forwardWheelToBody}>
            {/* 與工程師視角完全相同的時間軸 SVG */}
            <svg width={svgWidth} height={HEADER_H} className="block">
              <rect x={0} y={0} width={svgWidth} height={HEADER_H} fill="#f1f5f9" />
              <line x1={0} y1={HEADER_MONTH} x2={svgWidth} y2={HEADER_MONTH} stroke="#cbd5e1" strokeWidth={1} />
              <line x1={0} y1={HEADER_MONTH + HEADER_WEEK} x2={svgWidth} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
              <line x1={0} y1={HEADER_H - 1} x2={svgWidth} y2={HEADER_H - 1} stroke="#cbd5e1" strokeWidth={1.5} />
              {monthLabels.map((ml, i) => (
                <g key={i}>
                  <line x1={ml.x} y1={0} x2={ml.x} y2={HEADER_H} stroke="#cbd5e1" strokeWidth={1} />
                  <text x={ml.x + 5} y={HEADER_MONTH / 2 + 6} fontSize={12} fill="#334155" fontWeight="700">{ml.label}</text>
                </g>
              ))}
              {weekTicks.map((t, i) => (
                <g key={i}>
                  <line x1={t.x} y1={HEADER_MONTH} x2={t.x} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
                  <text x={t.x + 2} y={HEADER_MONTH + HEADER_WEEK / 2 + 5} fontSize={10} fill="#64748b" fontWeight="600">{t.label}</text>
                </g>
              ))}
              {dayLabelItems.map((d, i) => (
                <g key={i}>
                  <line x1={d.x} y1={HEADER_MONTH + HEADER_WEEK} x2={d.x} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={0.5} />
                  {PX_PER_DAY >= 16 && (
                    <text x={d.x + PX_PER_DAY / 2} y={HEADER_MONTH + HEADER_WEEK + HEADER_DAY / 2 + 5}
                      fontSize={10} fill={d.isRest ? '#ef4444' : '#64748b'} textAnchor="middle"
                      fontWeight={d.isRest ? '700' : '400'}>{d.label}</text>
                  )}
                </g>
              ))}
              {today >= timelineStart && today <= timelineEnd && (
                <>
                  <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                  <rect x={todayX - 1} y={4} width={28} height={14} rx={3} fill="#ef4444" />
                  <text x={todayX + 3} y={14} fontSize={10} fill="#ffffff" fontWeight="600">今日</text>
                </>
              )}
            </svg>
          </div>
        </div>

        {/* 下排 */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* 左下：設備名稱列 */}
          <div className="shrink-0 border-r bg-white overflow-hidden"
            style={{ width: leftWidth }} onWheel={forwardWheelToBody}>
            <div ref={leftBodyRef} style={{ willChange: 'transform' }}>
              {deviceRows.map(({ device: dev, schedules: devSchedules }, i) => {
                const evenFill = i % 2 === 0 ? '#ffffff' : '#f8fafc'
                return (
                  <div key={dev.id} className="relative border-b flex items-center px-3"
                    style={{ height: ROW_H, background: evenFill }}>
                    <span className={`text-[13px] font-semibold ${!dev.isActive ? 'text-gray-400' : 'text-slate-800'}`}>
                      {dev.label}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {devSchedules.length > 0 ? `${devSchedules.length} 筆` : '（空）'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右下：Bar 區 */}
          <div ref={rightBodyRef} className="flex-1 overflow-auto" onScroll={handleRightBodyScroll}>
            <svg width={svgWidth} height={deviceRows.length * ROW_H} className="block">
              <rect x={0} y={0} width={svgWidth} height={deviceRows.length * ROW_H} fill="#ffffff" />

              {restDayBgs.map(({ x }, i) => (
                <rect key={`rd-${i}`} x={x} y={0} width={PX_PER_DAY} height={deviceRows.length * ROW_H} fill="rgba(0,0,0,0.085)" />
              ))}
              {monthLabels.map((ml, i) => (
                <line key={`ml-${i}`} x1={ml.x} y1={0} x2={ml.x} y2={deviceRows.length * ROW_H} stroke="#cbd5e1" strokeWidth={1} />
              ))}

              {deviceRows.map(({ device: dev, schedules: devSchedules }, rowIdx) => {
                const y = rowIdx * ROW_H
                const evenFillAlpha = rowIdx % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(248,250,252,0.5)'
                return (
                  <g key={dev.id}>
                    <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={evenFillAlpha} />
                    <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#e2e8f0" strokeWidth={1} />

                    {devSchedules.map((s) => {
                      const sDate = parseDate(s.startDate)
                      const eDate = parseDate(s.endDate)
                      const barX = daysBetween(timelineStart, sDate) * PX_PER_DAY
                      const totalBarDays = daysBetween(sDate, eDate) + 1
                      const barW = Math.max(totalBarDays * PX_PER_DAY, 6)
                      const color = getUnitColor(s.testUnit, allUnits)
                      const barY = y + Math.floor((ROW_H - 22) / 2)

                      const workDayOffset = getWorkDayOffset(sDate, s.timeResource, restDayConfig)
                      const hasOverflow = totalBarDays > workDayOffset && workDayOffset > 0
                      const overflowX = barX + workDayOffset * PX_PER_DAY

                      return (
                        <g key={s.id}>
                          {hasOverflow ? (
                            <>
                              <rect x={barX} y={barY} width={workDayOffset * PX_PER_DAY} height={22} rx={4} fill={color} opacity={0.85} />
                              <rect x={overflowX} y={barY} width={barW - workDayOffset * PX_PER_DAY} height={22} rx={4} fill={OVERFLOW_COLOR} opacity={0.85} />
                            </>
                          ) : (
                            <rect x={barX} y={barY} width={barW} height={22} rx={4} fill={color} opacity={0.85} />
                          )}
                          {barW > 30 && (
                            <text x={barX + 5} y={barY + 15} fontSize={10} fill="#ffffff" fontWeight="600"
                              style={{ pointerEvents: 'none' }}>
                              {s.testEngineer}
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {today >= timelineStart && today <= timelineEnd && (
                      <line x1={todayX} y1={y} x2={todayX} y2={y + ROW_H}
                        stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    )
  ) : (
    // ── 工程師視角（現有渲染，不動） ──────────────────────
    filtered.length === 0 ? (
      <div className="p-10 text-center text-gray-400 text-sm">無符合篩選條件的排程</div>
    ) : (
      // ... 現有甘特圖主體 JSX（保持不變）...
    )
  )
)}
```

注意：`getWorkDayOffset` 和 `OVERFLOW_COLOR` 在 GanttChart.tsx 中已有定義，直接沿用。設備視角的 bar 顯示工程師名稱（用以區分多筆排程），若 bar 寬度不足 30px 則不顯示文字。

- [ ] **Step 10.8: 驗證 TypeScript 編譯無錯誤**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 10.9: 手動測試**

1. 先在設定頁新增 2-3 個設備
2. 新增排程時選擇設備
3. 回到甘特圖，點擊「按設備」切換
4. 確認各設備顯示對應排程 bar
5. 確認無設備的排程不顯示
6. 確認無排程的設備行有空行（顯示名稱但無 bar）
7. FilterSortBar 出現設備多選篩選欄位
8. 切回「按工程師」正常

- [ ] **Step 10.10: Commit**

```bash
git add -A
git commit -m "feat: device view in gantt chart with group-by toggle (req 4)"
```

---

## 完成後驗收清單

- [ ] `npx tsc --noEmit` 零錯誤
- [ ] 前後端可正常啟動（`npm run dev` in root）
- [ ] Teams tab 與發佈按鈕已消失
- [ ] 時間篩選正確隱藏範圍外排程
- [ ] User 角色預設只看自己單位，切換後可看全部
- [ ] Admin/SA 旗標（Shield）在左側列操作正常
- [ ] User 旗標（Bookmark）在左側列操作正常
- [ ] FilterSortBar 旗標篩選 chip 正確過濾
- [ ] 設定頁「設備管理」Tab 可新增/停用/刪除設備
- [ ] 新增排程表單有設備下拉（有設備時）
- [ ] 切換「按設備」分組，設備視角正常渲染
- [ ] 刪除有排程使用中的設備時顯示錯誤

---

## Self-Review Notes

- **Task 5.5 (PUT flag audit)**：當 Admin 送出的 body 同時包含旗標欄位與其他欄位（例如同時改 `projectName` 和 `adminFlag`），當前邏輯用 `isFlagOnly` 判斷。若是混合修改，寫 UPDATE_SCHEDULE 稽核，不寫 FLAG_SCHEDULE。這符合實際使用情境。
- **Task 10.7 (設備視角 scrollSync)**：設備視角的 `leftBodyRef` 和 `rightBodyRef` 沿用工程師視角的 ref，捲動同步邏輯不需改動，因為兩個視角共用同一個 ref binding。
- **Task 6.4 (旗標 popover z-index)**：FlagPopover 使用 `z-50`，需確認不會被其他 overlay 遮蓋。如有問題可提升至 `z-[9999]`。
- **Task 3 (User PUT allowedUnits)**：User 角色的 PUT 限制（只能改自己的排程、不能改工程師）在 Task 5.5 中保留。`device` 欄位被設計為 Admin 才能改（Task 9 中 `device: isUser ? undefined : form.device`），如需 User 也可改設備，移除此限制即可。
