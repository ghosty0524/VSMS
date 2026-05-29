# Permission Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 Level 3 User 角色、將同時登入上限提升至 30 人、稽核紀錄改為讀取後端資料以顯示所有使用者操作。

**Architecture:** 後端 types + routes 先行，確保 API 合約確定後再動前端。新角色 `user` 的資料過濾在後端 routes 強制執行；前端 Header / App 依角色隱藏 UI 元素作為第二道防線。稽核頁面改為直接查詢 `GET /api/audit`，捨棄 localStorage auditStore 的舊做法。

**Tech Stack:** Express 5 / TypeScript (後端)、React 19 + Zustand (前端)、JSON 檔案儲存

---

## 受影響的檔案一覽

| 操作 | 檔案 | 原因 |
|------|------|------|
| Modify | `server/src/types.ts` | role union 加 `'user'`、User 加 `linkedEngineer` |
| Modify | `server/src/types/session.d.ts` | session.role 加 `'user'` |
| Modify | `server/src/routes/auth.ts` | MAX_SESSIONS 30、/api/me 回傳 linkedEngineer |
| Modify | `server/src/routes/schedules.ts` | user role 過濾 + 操作限制 |
| Modify | `server/src/routes/users.ts` | 建立/編輯支援 role + linkedEngineer |
| Modify | `src/types.ts` | 同 server/src/types.ts 的 User 變更 |
| Modify | `src/store/authStore.ts` | Account / AuthState 加 linkedEngineer + user role |
| Modify | `src/lib/api.ts` | createUser/updateUser 加新欄位、新增 getAuditLogs |
| Modify | `src/components/settings/UserManager.tsx` | role 選擇器 + linkedEngineer 下拉 |
| Modify | `src/components/layout/Header.tsx` | 依角色隱藏 Nav Tab + 操作按鈕 |
| Modify | `src/App.tsx` | user role 不可進入 analytics/settings/teams/audit |
| Modify | `src/components/schedule/ScheduleFormModal.tsx` | user role 的 testEngineer 欄位唯讀 |
| Modify | `src/components/schedule/GanttChart.tsx` | user role 隱藏刪除按鈕 |
| Modify | `src/components/audit/AuditPage.tsx` | 改查後端 /api/audit |

---

## Task 1：後端 Types — 加入 user role 與 linkedEngineer

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/types/session.d.ts`

- [ ] **Step 1：更新 `server/src/types.ts`**

```typescript
export interface User {
  id: string
  username: string
  displayName: string
  passwordHash: string
  role: 'super_admin' | 'admin' | 'user'   // ← 加 'user'
  isActive: boolean
  allowedUnits: string[]
  linkedEngineer: string                     // ← 新增（user role 用，其他角色填 ''）
  createdAt: string
  lastLoginAt: string
}
```

- [ ] **Step 2：更新 session type**

讀取 `server/src/types/session.d.ts`，將 `role` 欄位改為：

```typescript
role?: 'super_admin' | 'admin' | 'user'
```

- [ ] **Step 3：同步前端 `src/types.ts`**

```typescript
export interface User {
  id: string
  username: string
  displayName: string
  passwordHash: string
  role: 'super_admin' | 'admin' | 'user'   // ← 加 'user'
  isActive: boolean
  allowedUnits: string[]
  linkedEngineer: string                     // ← 新增
  createdAt: string
  lastLoginAt: string
}
```

- [ ] **Step 4：確認 TypeScript 無編譯錯誤**

```bash
cd "d:/AI Project/Project/vsms/server"
npx tsc --noEmit
```

Expected: 0 errors（允許尚未實作的 property 警告，後續 Task 會補齊）

---

## Task 2：後端 auth.ts — 登入人數上限 + /api/me 補 linkedEngineer

**Files:**
- Modify: `server/src/routes/auth.ts` (lines 11, 117, 194–199)

- [ ] **Step 1：MAX_SESSIONS 改為 30**

```typescript
const MAX_SESSIONS = 30
```

- [ ] **Step 2：/api/me 回應加入 linkedEngineer**

```typescript
res.json({
  ok: true,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  allowedUnits: user.allowedUnits,
  linkedEngineer: user.linkedEngineer ?? '',
})
```

- [ ] **Step 3：首次啟動建立 Super Admin 時補 linkedEngineer**

在 `auth.ts` 的 `superAdmin` 物件初始化中（約第 64–74 行），加入：

```typescript
linkedEngineer: '',
```

- [ ] **Step 4：確認後端編譯無誤**

```bash
cd "d:/AI Project/Project/vsms/server"
npx tsc --noEmit
```

Expected: 0 errors

---

## Task 3：後端 schedules.ts — user role 的資料過濾與操作限制

**Files:**
- Modify: `server/src/routes/schedules.ts`

需要以下五個改動點：
1. 新增 `getUser()` helper
2. `GET /` — user role 只回傳自己的排程
3. `POST /` — 拒絕 user role
4. `PUT /replace-all` — 拒絕 user role
5. `PUT /:id` — user role 只能改自己的排程且不能改 testEngineer
6. `DELETE /:id` — 拒絕 user role

- [ ] **Step 1：在 schedules.ts 最上方加入 `getUser` helper**

加在 `getAllowedUnits` 函式後方：

```typescript
function getUser(username: string): import('../types.js').User | undefined {
  const store = readJson<UserStore>('auth.json')
  return store.users.find((u) => u.username === username)
}
```

- [ ] **Step 2：GET / — user role 過濾**

將現有 `router.get('/', (_req, res) => {` 改為接收 req，並在 `res.json(updated)` 前加入：

```typescript
router.get('/', (req, res) => {
  const schedules = readJson<Schedule[]>('schedules.json')
  const updated = schedules.map(autoComputeStatus)
  const hasChange = updated.some((s, i) => s.isDelayed !== schedules[i].isDelayed)
  if (hasChange) writeJson('schedules.json', updated)

  if (req.session.role === 'user') {
    const user = getUser(req.session.username ?? '')
    const engineer = user?.linkedEngineer ?? ''
    res.json(updated.filter(s => s.testEngineer === engineer))
    return
  }

  res.json(updated)
})
```

- [ ] **Step 3：POST / — 拒絕 user role**

在 `POST /` handler 最頂端（`const username = ...` 之前）加入：

```typescript
if (req.session.role === 'user') {
  res.status(403).json({ ok: false, message: 'User 角色無新增排程權限', code: 'ROLE_NOT_ALLOWED' })
  return
}
```

- [ ] **Step 4：PUT /replace-all — 拒絕 user role**

在 `PUT /replace-all` handler 最頂端加入：

```typescript
if (req.session.role === 'user') {
  res.status(403).json({ ok: false, message: 'User 角色無匯入權限', code: 'ROLE_NOT_ALLOWED' })
  return
}
```

- [ ] **Step 5：PUT /:id — user role 只能改自己的排程，且 testEngineer 唯讀**

在現有的「權限檢查」區塊之前（`if (!canAccessUnit(...))` 前），插入 user role 分支：

```typescript
// user role：只能修改自己的排程，且不可變更 testEngineer
if (req.session.role === 'user') {
  const user = getUser(username)
  const engineer = user?.linkedEngineer ?? ''
  if (schedules[idx].testEngineer !== engineer) {
    res.status(403).json({
      ok: false,
      message: '您只能修改指派給自己的排程',
      code: 'NOT_OWN_SCHEDULE',
    })
    return
  }
  const body = req.body as Partial<Schedule>
  if (body.testEngineer !== undefined && body.testEngineer !== engineer) {
    res.status(403).json({
      ok: false,
      message: '不可變更測試人員欄位',
      code: 'CANNOT_CHANGE_ENGINEER',
    })
    return
  }
  // user role 跳過 unit 權限檢查，直接執行更新
  const before = schedules[idx]
  const beforeRecord = before as unknown as Record<string, unknown>
  const changedFields = Object.keys(body).filter(
    (k) => JSON.stringify(beforeRecord[k]) !== JSON.stringify((body as Record<string, unknown>)[k])
  )
  const store = readJson<UserStore>('auth.json')
  const u = store.users.find((u) => u.username === username)
  const displayName = u?.displayName ?? username
  const merged: Schedule = {
    ...before,
    ...(req.body as Partial<Schedule>),
    testEngineer: engineer, // 強制鎖定，不允許前端覆蓋
    id: req.params.id,
    updatedAt: new Date().toISOString(),
    updatedBy: username,
  }
  schedules[idx] = autoComputeStatus(merged)
  writeJson('schedules.json', schedules)
  appendAudit(username, displayName, 'UPDATE_SCHEDULE', req.params.id, changedFields)
  res.json(schedules[idx])
  return
}
```

- [ ] **Step 6：DELETE /:id — 拒絕 user role**

在 `DELETE /:id` handler 最頂端加入：

```typescript
if (req.session.role === 'user') {
  res.status(403).json({ ok: false, message: 'User 角色無刪除排程權限', code: 'ROLE_NOT_ALLOWED' })
  return
}
```

- [ ] **Step 7：確認編譯**

```bash
cd "d:/AI Project/Project/vsms/server"
npx tsc --noEmit
```

Expected: 0 errors

---

## Task 4：後端 users.ts — 建立/更新支援 role 與 linkedEngineer

**Files:**
- Modify: `server/src/routes/users.ts`

- [ ] **Step 1：POST / 接受 role + linkedEngineer**

將 `POST /` 的 body destructuring 改為：

```typescript
const { username, displayName, password, allowedUnits, role, linkedEngineer } = req.body as {
  username: string
  displayName?: string
  password: string
  allowedUnits?: string[]
  role?: 'admin' | 'user'
  linkedEngineer?: string
}
```

並將 `newUser` 物件中的固定 `role: 'admin'` 改為：

```typescript
const newUser: User = {
  id: uuidv4(),
  username,
  displayName: displayName?.trim() || username,
  passwordHash: sha256(password),
  role: role === 'user' ? 'user' : 'admin',
  isActive: true,
  allowedUnits: role === 'user' ? [] : (Array.isArray(allowedUnits) ? allowedUnits : []),
  linkedEngineer: role === 'user' ? (linkedEngineer?.trim() ?? '') : '',
  createdAt: new Date().toISOString(),
  lastLoginAt: '',
}
```

- [ ] **Step 2：PUT /:id 接受 linkedEngineer 更新**

在 `PUT /:id` 的 body destructuring 加入 `linkedEngineer`：

```typescript
const { displayName, password, isActive, allowedUnits, linkedEngineer } = req.body as {
  displayName?: string
  password?: string
  isActive?: boolean
  allowedUnits?: string[]
  linkedEngineer?: string
}
```

在 `allowedUnits` 更新區塊後加入：

```typescript
if (linkedEngineer !== undefined) {
  if (store.users[idx].role === 'user') {
    store.users[idx].linkedEngineer = linkedEngineer.trim()
    changedFields.push('linkedEngineer')
  }
}
```

- [ ] **Step 3：確認編譯**

```bash
cd "d:/AI Project/Project/vsms/server"
npx tsc --noEmit
```

Expected: 0 errors

---

## Task 5：前端 authStore — 加入 user role + linkedEngineer

**Files:**
- Modify: `src/store/authStore.ts`

- [ ] **Step 1：更新 Account 介面**

```typescript
export interface Account {
  id: string
  username: string
  displayName: string
  role: 'super_admin' | 'admin' | 'user'
  active: boolean
  allowedUnits: string[]
  linkedEngineer: string
}
```

- [ ] **Step 2：更新 AuthState 介面**

```typescript
interface AuthState {
  isLoggedIn: boolean
  isFirstRun: boolean
  isChecking: boolean
  role: 'super_admin' | 'admin' | 'user' | null
  username: string
  displayName: string
  allowedUnits: string[]
  linkedEngineer: string                         // ← 新增
  loginError: string
  loginWarning: string
  accounts: Account[]
  // ... (methods 不變)
}
```

- [ ] **Step 3：初始狀態加入 linkedEngineer**

在 `create<AuthState>()((set, get) => ({` 的初始值區塊中加入：

```typescript
linkedEngineer: '',
```

- [ ] **Step 4：checkAuth 儲存 linkedEngineer**

```typescript
checkAuth: async () => {
  try {
    const res = await api.me()
    set({
      isLoggedIn: true,
      isChecking: false,
      role: res.role as 'super_admin' | 'admin' | 'user',
      username: res.username,
      displayName: res.displayName,
      allowedUnits: res.allowedUnits ?? [],
      linkedEngineer: res.linkedEngineer ?? '',
    })
  } catch {
    set({ isLoggedIn: false, isChecking: false })
  }
},
```

- [ ] **Step 5：login 儲存 linkedEngineer（三個 set 呼叫都要補）**

三處設定 `me.role` 的 `set({...})` 都加入：

```typescript
role: me.role as 'super_admin' | 'admin' | 'user',
linkedEngineer: me.linkedEngineer ?? '',
```

- [ ] **Step 6：logout 清除 linkedEngineer**

```typescript
set({
  isLoggedIn: false,
  role: null,
  username: '',
  displayName: '',
  allowedUnits: [],
  linkedEngineer: '',
  loginWarning: '',
  accounts: [],
})
```

- [ ] **Step 7：更新 fetchAccounts 對應新欄位**

```typescript
const accounts: Account[] = data.map((u) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  active: u.isActive,
  allowedUnits: u.allowedUnits ?? [],
  linkedEngineer: u.linkedEngineer ?? '',
}))
```

- [ ] **Step 8：修正 loginError 錯誤訊息的人數上限**

將 `authStore.ts` 第 117 行的「4 人」改為「30 人」：

```typescript
set({ loginError: '目前已達登入人數上限（30 人），請稍後再試。' })
```

---

## Task 6：前端 api.ts — 新增/更新端點參數

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1：createUser 加入 role + linkedEngineer 參數**

找到 `createUser` 函式，將 body 型別改為：

```typescript
createUser: (data: {
  username: string
  displayName?: string
  password: string
  allowedUnits?: string[]
  role?: 'admin' | 'user'
  linkedEngineer?: string
}) => api.post('/api/users', data),
```

（實際函式簽名視 api.ts 實作而定，重點是 body 要帶入 role 和 linkedEngineer）

- [ ] **Step 2：updateUser 加入 linkedEngineer 參數**

找到 `updateUser` 函式，將 body 型別加入：

```typescript
linkedEngineer?: string
```

- [ ] **Step 3：新增 getAuditLogs 函式**

```typescript
getAuditLogs: (params?: {
  from?: string
  to?: string
  username?: string
  action?: string
}) => {
  const query = new URLSearchParams()
  if (params?.from)     query.set('from', params.from)
  if (params?.to)       query.set('to', params.to)
  if (params?.username) query.set('username', params.username)
  if (params?.action)   query.set('action', params.action)
  const qs = query.toString()
  return api.get<AuditLog[]>(`/api/audit${qs ? '?' + qs : ''}`)
},
```

其中 `AuditLog` 從 `../../types` 或獨立定義：

```typescript
interface AuditLog {
  id: string
  timestamp: string
  username: string
  displayName: string
  action: string
  target: string
  fields: string[]
}
```

（如果 `src/types.ts` 已有 `AuditLog` 介面則直接 import）

---

## Task 7：前端 UserManager — role 選擇器 + linkedEngineer 下拉

**Files:**
- Modify: `src/components/settings/UserManager.tsx`

- [ ] **Step 1：新增表單欄位 state**

將 `form` state 型別加入 `role` 和 `linkedEngineer`：

```typescript
const [form, setForm] = useState({
  username: '',
  displayName: '',
  password: '',
  role: 'admin' as 'admin' | 'user',
  allowedUnits: [] as string[],
  linkedEngineer: '',
})
const [editForm, setEditForm] = useState({
  displayName: '',
  password: '',
  role: 'admin' as 'admin' | 'user',
  allowedUnits: [] as string[],
  linkedEngineer: '',
})
```

- [ ] **Step 2：取得所有工程師清單**

在 `allUnits` memo 旁邊加入：

```typescript
const allEngineers = useMemo(
  () => options.testUnits
    .filter(u => u.isActive)
    .flatMap(u => u.engineers.filter(e => e.isActive).map(e => e.value))
    .sort(),
  [options.testUnits]
)
```

- [ ] **Step 3：新增 RoleSelector 元件（內聯於 UserManager 內）**

```typescript
const RoleSelector = ({
  value,
  onChange,
}: {
  value: 'admin' | 'user'
  onChange: (v: 'admin' | 'user') => void
}) => (
  <div>
    <label className="block text-xs text-gray-600 mb-1">角色</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value as 'admin' | 'user')}
      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="admin">Admin（管理員）</option>
      <option value="user">User（測試人員）</option>
    </select>
  </div>
)
```

- [ ] **Step 4：新增 EngineerSelector 元件（內聯於 UserManager 內）**

```typescript
const EngineerSelector = ({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) => (
  <div>
    <label className="block text-xs text-gray-600 mb-1">
      對應測試人員 <span className="text-red-500">*</span>
    </label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">— 請選擇 —</option>
      {allEngineers.map(e => (
        <option key={e} value={e}>{e}</option>
      ))}
    </select>
  </div>
)
```

- [ ] **Step 5：handleAdd 傳入 role + linkedEngineer**

```typescript
const handleAdd = async () => {
  if (!form.username.trim() || !form.password) { showMsg('帳號與密碼為必填', true); return }
  if (form.password.length < 8) { showMsg('密碼長度至少需要 8 個字元', true); return }
  if (form.role === 'user' && !form.linkedEngineer) { showMsg('User 角色必須選擇對應測試人員', true); return }
  try {
    await api.createUser({
      username: form.username.trim(),
      displayName: form.displayName.trim() || undefined,
      password: form.password,
      role: form.role,
      allowedUnits: form.role === 'admin' ? form.allowedUnits : [],
      linkedEngineer: form.role === 'user' ? form.linkedEngineer : '',
    })
    addLog({ operator: operatorName, action: 'CREATE', field: `新增帳號(${form.username.trim()}) 角色:${form.role}` })
    showMsg(`帳號 ${form.username} 已新增`)
    setForm({ username: '', displayName: '', password: '', role: 'admin', allowedUnits: [], linkedEngineer: '' })
    setShowAddForm(false)
    await loadUsers()
  } catch (e: unknown) {
    showMsg((e as Error).message || '新增失敗', true)
  }
}
```

- [ ] **Step 6：handleEdit 傳入 linkedEngineer**

```typescript
await api.updateUser(editTarget.id, {
  displayName: editForm.displayName.trim() || undefined,
  password: editForm.password || undefined,
  allowedUnits: editTarget.role === 'admin' ? editForm.allowedUnits : [],
  linkedEngineer: editTarget.role === 'user' ? editForm.linkedEngineer : undefined,
})
```

- [ ] **Step 7：新增表單 JSX — 在 displayName 欄位後加 RoleSelector**

在新增表單的 `<div className="space-y-2">` 內，`displayName` 欄位後插入：

```tsx
<RoleSelector
  value={form.role}
  onChange={(v) => setForm(f => ({ ...f, role: v, allowedUnits: [], linkedEngineer: '' }))}
/>
{form.role === 'admin' && (
  <UnitSelector
    selected={form.allowedUnits}
    onChange={(v) => setForm(f => ({ ...f, allowedUnits: v }))}
  />
)}
{form.role === 'user' && (
  <EngineerSelector
    value={form.linkedEngineer}
    onChange={(v) => setForm(f => ({ ...f, linkedEngineer: v }))}
  />
)}
```

- [ ] **Step 8：編輯表單 JSX — 依照目標角色顯示正確欄位**

在編輯表單（`editTarget?.id === user.id` 的區塊）中，`password` 欄位後加入：

```tsx
{editTarget?.role === 'admin' && (
  <UnitSelector
    selected={editForm.allowedUnits}
    onChange={(v) => setEditForm(f => ({ ...f, allowedUnits: v }))}
  />
)}
{editTarget?.role === 'user' && (
  <EngineerSelector
    value={editForm.linkedEngineer}
    onChange={(v) => setEditForm(f => ({ ...f, linkedEngineer: v }))}
  />
)}
```

同時確保編輯初始化時帶入 `linkedEngineer`：

```typescript
setEditForm({
  displayName: user.displayName,
  password: '',
  role: user.role as 'admin' | 'user',
  allowedUnits: user.allowedUnits ?? [],
  linkedEngineer: user.linkedEngineer ?? '',
})
```

- [ ] **Step 9：帳號列表 badge — 加入 User role 顯示**

在現有的 `role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'` 改為：

```tsx
user.role === 'super_admin'
  ? 'bg-purple-100 text-purple-700'
  : user.role === 'user'
    ? 'bg-green-100 text-green-700'
    : 'bg-blue-100 text-blue-700'
```

顯示文字：

```tsx
{user.role === 'super_admin' ? 'Super Admin' : user.role === 'user' ? 'User' : 'Admin'}
```

- [ ] **Step 10：帳號列表 — User role 補顯 linkedEngineer**

在 `管轄單位` 那行的下方加入：

```tsx
{user.role === 'user' && (
  <div className="text-xs text-gray-500 mt-0.5">
    對應人員：
    {user.linkedEngineer
      ? <span className="text-green-600">{user.linkedEngineer}</span>
      : <span className="text-red-400">未設定</span>
    }
  </div>
)}
```

---

## Task 8：前端 Header — 依角色控制 Nav Tab 與操作按鈕

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1：更新 Props type**

```typescript
interface Props {
  currentView: View
  onNavigate: (v: View) => void
  onAddSchedule: () => void
  role: 'super_admin' | 'admin' | 'user' | null
}
```

- [ ] **Step 2：NAV_TABS 加入 userHidden 屬性**

```typescript
const NAV_TABS: {
  key: View
  label: string
  icon: React.ReactNode
  superAdminOnly?: boolean
  userHidden?: boolean
}[] = [
  { key: 'main',      label: '排程管理',   icon: <LayoutList    size={15} /> },
  { key: 'analytics', label: '統計分析',   icon: <BarChart2     size={15} />, userHidden: true },
  { key: 'settings',  label: '系統設定',   icon: <Settings      size={15} />, userHidden: true },
  { key: 'teams',     label: 'Teams 設定', icon: <Bell          size={15} />, userHidden: true },
  { key: 'audit',     label: '審計紀錄',   icon: <ClipboardList size={15} />, superAdminOnly: true },
]
```

- [ ] **Step 3：visibleTabs 過濾 userHidden**

```typescript
const visibleTabs = NAV_TABS.filter(tab => {
  if (tab.superAdminOnly && role !== 'super_admin') return false
  if (tab.userHidden && role === 'user') return false
  return true
})
```

- [ ] **Step 4：操作按鈕依 user role 隱藏**

在 Header JSX 中，所有 `user` 不可用的按鈕加上條件渲染（以下四個按鈕）：

**新增排程**：已有 `currentView === 'main'` 條件，再加 `role !== 'user'`：
```tsx
{currentView === 'main' && role !== 'user' && (
  <button type="button" onClick={onAddSchedule} ...>
    <Plus size={15} strokeWidth={2.5} />
    新增排程
  </button>
)}
```

**匯入**：
```tsx
{role !== 'user' && (
  <button type="button" onClick={() => setShowImport(true)} ...>
    <Upload size={14} />
    匯入
  </button>
)}
```

**匯出下拉**：
```tsx
{role !== 'user' && (
  <div className="relative" ref={exportRef}>
    {/* 原有匯出按鈕 */}
  </div>
)}
```

**發佈通知**：
```tsx
{role !== 'user' && (
  <button type="button" onClick={handleNotify} ...>
    <Send size={14} />
    發佈
  </button>
)}
```

**下載範本**：
```tsx
{role !== 'user' && (
  <button type="button" onClick={downloadTemplate} ...>
    <FileSpreadsheet size={15} />
  </button>
)}
```

- [ ] **Step 5：role badge 加入 User 顯示**

在 `role === 'super_admin'` 的 SA badge 後加入：

```tsx
{role === 'user' && (
  <span className="px-1.5 py-0.5 text-xs font-bold
                   bg-green-500 text-white rounded-md leading-tight">
    U
  </span>
)}
```

---

## Task 9：前端 App.tsx — user role 的路由守衛

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：更新 Header role 型別**

`role` prop 型別已在 Task 8 更新，此處確認傳入無誤（原本 `role={role}` 不變，型別自動對齊）。

- [ ] **Step 2：user role 自動導回 main**

在 `useEffect(() => { checkAuth() }, [checkAuth])` 下方新增：

```typescript
useEffect(() => {
  if (role === 'user' && view !== 'main') {
    setView('main')
  }
}, [role, view, setView])
```

- [ ] **Step 3：view 渲染加上 role guard**

```tsx
{view === 'analytics' && role !== 'user' && (
  <div className="h-full overflow-y-auto">
    <AnalyticsPage />
  </div>
)}
{view === 'settings' && role !== 'user' && (
  <div className="h-full overflow-y-auto">
    <SettingsPage />
  </div>
)}
{view === 'teams' && role !== 'user' && (
  <div className="h-full overflow-y-auto">
    <TeamsSettingsPage />
  </div>
)}
{view === 'audit' && role === 'super_admin' && (
  <div className="h-full overflow-y-auto">
    <AuditPage />
  </div>
)}
```

---

## Task 10：前端 ScheduleFormModal — user role 的 testEngineer 唯讀

**Files:**
- Modify: `src/components/schedule/ScheduleFormModal.tsx`

- [ ] **Step 1：從 authStore 取 role**

在元件頂端加入：

```typescript
const { role } = useAuthStore()
const isUser = role === 'user'
```

- [ ] **Step 2：testEngineer 欄位依 isUser 設為唯讀**

找到 `testEngineer` 的 `<select>` 或 `<input>`，加入 disabled 條件：

```tsx
<select
  value={form.testEngineer}
  onChange={e => !isUser && setForm(f => ({ ...f, testEngineer: e.target.value }))}
  disabled={isUser}
  className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
              ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
>
```

---

## Task 11：前端 GanttChart — user role 隱藏刪除按鈕

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`

- [ ] **Step 1：從 authStore 取 role**

在 GanttChart 元件內加入：

```typescript
const { role } = useAuthStore()
```

- [ ] **Step 2：刪除按鈕加 role guard**

找到呼叫 `handleDelete` 或 `setDeleteTarget` 的按鈕，加上條件：

```tsx
{role !== 'user' && (
  <button
    type="button"
    onClick={() => setDeleteTarget(schedule)}
    ...
  >
    刪除
  </button>
)}
```

---

## Task 12：前端 AuditPage — 改查後端 /api/audit

**Files:**
- Modify: `src/components/audit/AuditPage.tsx`

- [ ] **Step 1：移除 useAuditStore，改用後端 API**

```typescript
import React, { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
```

移除 `import { useAuditStore }` 那行。

- [ ] **Step 2：加入後端資料狀態**

```typescript
interface BackendAuditLog {
  id: string
  timestamp: string
  username: string
  displayName: string
  action: string
  target: string
  fields: string[]
}

const [logs, setLogs] = useState<BackendAuditLog[]>([])
const [loading, setLoading] = useState(true)
```

- [ ] **Step 3：useEffect 載入後端稽核紀錄**

```typescript
useEffect(() => {
  if (role !== 'super_admin') return
  api.getAuditLogs().then(data => {
    setLogs(data)
    setLoading(false)
  }).catch(() => setLoading(false))
}, [role])
```

- [ ] **Step 4：更新 filtered useMemo（欄位名稱從前端 log.operator → 後端 log.username/displayName）**

後端 log 格式與前端 auditStore log 格式不同：
- 後端：`{ timestamp, username, displayName, action, target, fields }`
- 前端舊：`{ timestamp, operator, action, field }`

更新 filtered：

```typescript
const filtered = useMemo(() => {
  return logs.filter((log) => {
    if (startDate && log.timestamp < startDate) return false
    if (endDate && log.timestamp > endDate + 'T23:59:59') return false
    if (operator && !log.displayName.includes(operator) && !log.username.includes(operator)) return false
    if (actionType !== '全部' && log.action !== actionType) return false
    return true
  })
}, [logs, startDate, endDate, operator, actionType])
```

- [ ] **Step 5：更新 ACTION_TYPES 為後端 action 格式**

```typescript
const ACTION_TYPES = [
  '全部',
  'LOGIN', 'LOGOUT',
  'CREATE_SCHEDULE', 'UPDATE_SCHEDULE', 'DELETE_SCHEDULE', 'IMPORT_SCHEDULES',
  'EXPORT_DASHBOARD', 'SEND_NOTIFICATION',
  'CREATE_USER', 'UPDATE_USER', 'DISABLE_USER',
  'UPDATE_SETTINGS',
]
```

- [ ] **Step 6：更新表格欄位 — 改用後端欄位名**

```tsx
<td className="px-4 py-2 text-gray-500 whitespace-nowrap">
  {new Date(log.timestamp).toLocaleString('zh-TW')}
</td>
<td className="px-4 py-2 font-medium text-gray-800">
  {log.displayName || log.username}
</td>
<td className="px-4 py-2">
  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
    log.action.includes('DELETE') ? 'bg-red-100 text-red-700' :
    log.action.includes('CREATE') ? 'bg-green-100 text-green-700' :
    log.action.includes('UPDATE') || log.action.includes('IMPORT') ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-600'
  }`}>
    {log.action}
  </span>
</td>
<td className="px-4 py-2 text-gray-600">
  {log.target}{log.fields?.length ? ` [${log.fields.join(', ')}]` : ''}
</td>
```

- [ ] **Step 7：更新 handleExport — 改用後端欄位**

```typescript
const handleExport = () => {
  const header = '時間,操作人員,動作,目標,修改欄位\n'
  const rows = filtered.map((l) =>
    `"${l.timestamp}","${l.displayName || l.username}","${l.action}","${l.target}","${l.fields?.join('; ') ?? ''}"`
  ).join('\n')
  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 8：在渲染中加入 loading 狀態**

在 `role !== 'super_admin'` 的 early return 後加入：

```tsx
if (loading) return <p className="p-8 text-center text-gray-400">載入中...</p>
```

---

## Task 13：更新 SPEC

**Files:**
- Modify: `d:/AI Project/Project spec/vsms/VSMS_Product_Spec_v2.8.md`

- [ ] **Step 1：更新第 1.4 節使用者角色表格**

將原本的兩欄（Super Admin / Admin）改為三欄：

```markdown
| 角色 | 等級 | 功能範圍 |
|------|------|---------|
| Super Admin | Level 1 | 所有功能（含帳號管理） |
| Admin | Level 2 | 特定測試單位的排程 CRUD、Excel 匯入匯出、統計分析、系統設定（不含帳號管理） |
| User | Level 3 | 僅可檢視與編輯指派給自己（linkedEngineer）的排程；不可新增/刪除/匯入/匯出/統計/設定 |
```

- [ ] **Step 2：更新第 3.4 節 UserStore 資料模型**

在 `User` interface 加入：
```typescript
role: 'super_admin' | 'admin' | 'user'
linkedEngineer: string  // User role：對應測試人員名稱；其他角色：空字串
```

- [ ] **Step 3：更新第 4.2 節同時登入人數上限**

將「上限 4 人」改為「上限 30 人」。

- [ ] **Step 4：更新第 4.10 節審計紀錄**

補充說明：稽核紀錄資料來自後端 `GET /api/audit`（`server/data/audit.json`），涵蓋所有使用者的操作，前端 localStorage auditStore 不再作為頁面資料來源。

- [ ] **Step 5：更新版本記錄**

加入 v2.9 更新項目。

---

## 自我核查

### Spec 覆蓋確認

| 需求 | 對應 Task |
|------|----------|
| 登入上限 4→30 | Task 2（auth.ts）、Task 5（authStore 錯誤訊息） |
| 新增 user role | Task 1（types）、Task 4（users.ts）、Task 7（UserManager UI） |
| user 僅看自己的排程 | Task 3（GET /api/schedules 過濾） |
| user 不可新增/刪除 | Task 3（POST/DELETE 403）、Task 8（Header 隱藏按鈕）、Task 11（GanttChart） |
| user 不可匯入/匯出 | Task 3（replace-all 403）、Task 8（Header 隱藏匯入/匯出） |
| user 不可進統計/設定 | Task 8（Nav Tab 隱藏）、Task 9（App route guard） |
| user testEngineer 唯讀 | Task 3（後端強制）、Task 10（前端 UI disabled） |
| linkedEngineer 方案A | Task 1（欄位新增）、Task 4（建立/編輯）、Task 7（選擇器 UI） |
| 帳號管理僅 Super Admin | 現有 requireSuperAdmin 中介層已涵蓋，無需額外修改 |
| 稽核顯示所有使用者 | Task 12（改查後端）、Task 6（api.getAuditLogs） |
| Spec 更新 | Task 13 |

### 型別一致性

- `role: 'super_admin' | 'admin' | 'user'` — Task 1 定義，Task 2/3/4/5/7/8/9 使用，全部一致
- `linkedEngineer: string` — Task 1 定義，Task 2/3/4/5/6/7 使用，全部一致
- `BackendAuditLog` — Task 12 定義並使用於同一元件內，無跨檔案依賴

### 無佔位符確認 ✅

所有 Step 均含完整程式碼片段，無 TBD / TODO / "類似上方" 等紅旗語句。
