# 系統設定「人員」分頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系統設定裡的「測試人員」與「帳號管理」合併成一個只有 super_admin 看得到的「人員」分頁：一人一列，帳號是人員的附屬欄位；admin / super_admin 帳號與對不到人員的帳號各自列在下方區塊。

**Architecture:** 資料層完全不動（`engineers`、`users` 兩張表與所有 API 照舊）。新增純函式 `buildPeopleView(testUnits, users)` 負責把名冊與帳號對起來（可單元測試），新元件 `PeopleManager` 只做渲染與呼叫既有 store / api。`EngineerManager.tsx`、`UserManager.tsx` 刪除。

**Tech Stack:** React 19、Zustand、Tailwind v4、lucide-react、vitest。

## Global Constraints

- **設計文件**：`docs/superpowers/specs/2026-09-09-export-modal-people-tab-pdn-check-design.md` 第二節。有衝突以設計文件為準。
- **不得動 server、不得動 prisma schema。** 本計畫是純前端。
- **不得執行 `npm run build` 或 `npx vite build`** — `dist/` 由正式常駐程序（port 3001）即時從磁碟服務，build 等於部署。
- **不得動 port 3001 的常駐程序。**
- **前端既有 9 個 `tsc` 型別錯誤**（`App.tsx`、`ScheduleFormModal.tsx`、`GanttChart.tsx`、`LoadSection.tsx`、`RestDaysManager.tsx`、`main.tsx`、`excel-diff.test.ts`）。不要順手修，也不要新增。型別檢查：`npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` 應為 `9`。
- **前端測試**：`npx vitest run`。
- **對應規則**：`users.linkedEngineer === engineer.value` 精確相等（後端「我的排程」用同一條件），不做模糊比對。
- **改名只動 label**：engineer 的 `value` 是排程存的穩定識別碼（2026-08-04 決定），沿用 `optionsStore.updateEngineer`。
- **啟用帳號不確認、停用與永久刪除用 `DeleteConfirmDialog`**（變更 04 的既有決定，不用原生 confirm）。
- **commit 訊息英文**，結尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。commit 到目前分支 `feat/guest-role-and-uiux`，不推 GitHub。
- 專案根目錄 `F:\vsms\vsms-export`。

---

### Task 1: 對應邏輯純函式 `buildPeopleView`

**Files:**
- Create: `src/lib/peopleRows.ts`
- Test: `src/__tests__/peopleRows.test.ts`

**Interfaces:**
- Consumes: `TestUnitOption`、`EngineerOption`、`User` from `src/types.ts`
- Produces:
  ```ts
  export type SafeUser = Omit<User, 'passwordHash'>
  export interface PersonRow { engineer: EngineerOption; account: SafeUser | null }
  export interface PeopleUnit { unitId: string; unitValue: string; unitLabel: string; rows: PersonRow[] }
  export interface OrphanAccount { user: SafeUser; reason: 'missing' | 'duplicate' }
  export interface PeopleView { units: PeopleUnit[]; adminAccounts: SafeUser[]; orphanAccounts: OrphanAccount[] }
  export function buildPeopleView(testUnits: TestUnitOption[], users: SafeUser[]): PeopleView
  ```

- [ ] **Step 1: 寫失敗的測試**

建立 `src/__tests__/peopleRows.test.ts`：

```ts
// src/__tests__/peopleRows.test.ts
// 「人員」分頁的對應邏輯：名冊（engineers）與帳號（users）以
// users.linkedEngineer === engineer.value 精確對應。
import { describe, it, expect } from 'vitest'
import { buildPeopleView, type SafeUser } from '../lib/peopleRows'
import type { TestUnitOption } from '../types'

const units: TestUnitOption[] = [
  {
    id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 0, color: null,
    engineers: [
      { id: 'e1', value: 'Ben_Ko', label: 'Ben Ko', isActive: true, sortOrder: 0, color: null },
      { id: 'e2', value: 'Alice_Wu', label: 'Alice', isActive: false, sortOrder: 1, color: null },
    ],
  },
  {
    id: 'u2', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 1, color: null,
    engineers: [
      { id: 'e3', value: 'Cathy_Lin', label: 'Cathy', isActive: true, sortOrder: 0, color: null },
    ],
  },
]

function user(over: Partial<SafeUser> & { id: string; username: string }): SafeUser {
  return {
    displayName: over.username, role: 'user', isActive: true, allowedUnits: [],
    linkedEngineer: '', createdAt: '2026-01-01T00:00:00Z', lastLoginAt: '',
    canLinkVtms: false, canViewVtmsProgress: false,
    ...over,
  }
}

describe('buildPeopleView', () => {
  it('把 user 帳號掛到 linkedEngineer 對應的人員列', () => {
    const v = buildPeopleView(units, [user({ id: 'a1', username: 'ben', linkedEngineer: 'Ben_Ko' })])
    expect(v.units[0].rows[0].account?.username).toBe('ben')
    expect(v.units[0].rows[1].account).toBeNull()
    expect(v.orphanAccounts).toEqual([])
  })

  it('沒有帳號的人員 account 為 null，仍然列出', () => {
    const v = buildPeopleView(units, [])
    expect(v.units.map(u => u.rows.length)).toEqual([2, 1])
    expect(v.units[1].rows[0].account).toBeNull()
  })

  it('停用的人員仍列出且帶帳號', () => {
    const v = buildPeopleView(units, [user({ id: 'a2', username: 'alice', linkedEngineer: 'Alice_Wu' })])
    expect(v.units[0].rows[1].engineer.isActive).toBe(false)
    expect(v.units[0].rows[1].account?.username).toBe('alice')
  })

  it('admin 與 super_admin 進 adminAccounts，不進人員列', () => {
    const v = buildPeopleView(units, [
      user({ id: 'a3', username: 'root', role: 'super_admin' }),
      user({ id: 'a4', username: 'mgr', role: 'admin', allowedUnits: ['RA'] }),
    ])
    expect(v.adminAccounts.map(u => u.username)).toEqual(['root', 'mgr'])
    expect(v.units.flatMap(u => u.rows).every(r => r.account === null)).toBe(true)
  })

  it('對應人員已刪除的 user 帳號進 orphanAccounts，reason 為 missing', () => {
    const v = buildPeopleView(units, [user({ id: 'a5', username: 'ghost', linkedEngineer: 'Gone_Guy' })])
    expect(v.orphanAccounts).toEqual([{ user: expect.objectContaining({ username: 'ghost' }), reason: 'missing' }])
  })

  it('linkedEngineer 為空的 user 帳號也算 missing', () => {
    const v = buildPeopleView(units, [user({ id: 'a6', username: 'blank', linkedEngineer: '' })])
    expect(v.orphanAccounts[0].reason).toBe('missing')
  })

  it('兩個帳號指到同一人時，第一個進列、第二個為 duplicate', () => {
    const v = buildPeopleView(units, [
      user({ id: 'a7', username: 'ben1', linkedEngineer: 'Ben_Ko' }),
      user({ id: 'a8', username: 'ben2', linkedEngineer: 'Ben_Ko' }),
    ])
    expect(v.units[0].rows[0].account?.username).toBe('ben1')
    expect(v.orphanAccounts).toEqual([{ user: expect.objectContaining({ username: 'ben2' }), reason: 'duplicate' }])
  })

  it('保留單位與人員的原始順序', () => {
    const v = buildPeopleView(units, [])
    expect(v.units.map(u => u.unitLabel)).toEqual(['RA', 'SIT-HW'])
    expect(v.units[0].rows.map(r => r.engineer.value)).toEqual(['Ben_Ko', 'Alice_Wu'])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/__tests__/peopleRows.test.ts`
Expected: FAIL，`Cannot find module '../lib/peopleRows'`

- [ ] **Step 3: 實作**

建立 `src/lib/peopleRows.ts`：

```ts
// src/lib/peopleRows.ts
//
// 「人員」分頁的對應邏輯。名冊（engineers 表，掛在測試單位下）與帳號
// （users 表）是兩種東西：名冊沒有登入身分、帳號只有 user 角色會透過
// linkedEngineer（純文字，存 engineer.value，無外鍵）指到一位人員。
// 這裡只做讀取端的對應，不改任何資料。
import type { TestUnitOption, EngineerOption, User } from '../types'

export type SafeUser = Omit<User, 'passwordHash'>

export interface PersonRow {
  engineer: EngineerOption
  /** role === 'user' 且 linkedEngineer === engineer.value 的第一個帳號 */
  account: SafeUser | null
}

export interface PeopleUnit {
  unitId: string
  unitValue: string
  unitLabel: string
  rows: PersonRow[]
}

export interface OrphanAccount {
  user: SafeUser
  /** missing：對應人員不存在或未設定；duplicate：該人員已被另一個帳號對應 */
  reason: 'missing' | 'duplicate'
}

export interface PeopleView {
  units: PeopleUnit[]
  /** admin / super_admin，依傳入順序（API 已依 createdAt 排序） */
  adminAccounts: SafeUser[]
  /** user 角色但沒有掛到任何人員列的帳號。不能讓它們從畫面上消失。 */
  orphanAccounts: OrphanAccount[]
}

export function buildPeopleView(testUnits: TestUnitOption[], users: SafeUser[]): PeopleView {
  const byEngineer = new Map<string, SafeUser[]>()
  for (const u of users) {
    if (u.role !== 'user') continue
    const list = byEngineer.get(u.linkedEngineer) ?? []
    list.push(u)
    byEngineer.set(u.linkedEngineer, list)
  }

  const claimed = new Set<string>()
  const knownEngineers = new Set<string>()
  const units: PeopleUnit[] = testUnits.map(unit => ({
    unitId: unit.id,
    unitValue: unit.value,
    unitLabel: unit.label,
    rows: unit.engineers.map(engineer => {
      knownEngineers.add(engineer.value)
      const account = byEngineer.get(engineer.value)?.[0] ?? null
      if (account) claimed.add(account.id)
      return { engineer, account }
    }),
  }))

  const adminAccounts = users.filter(u => u.role !== 'user')
  const orphanAccounts: OrphanAccount[] = users
    .filter(u => u.role === 'user' && !claimed.has(u.id))
    .map(u => ({
      user: u,
      reason: u.linkedEngineer && knownEngineers.has(u.linkedEngineer) ? 'duplicate' : 'missing',
    }))

  return { units, adminAccounts, orphanAccounts }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run src/__tests__/peopleRows.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/peopleRows.ts src/__tests__/peopleRows.test.ts
git commit -m "feat(settings): add buildPeopleView to join the engineer roster with accounts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `PeopleManager` 元件

**Files:**
- Create: `src/components/settings/PeopleManager.tsx`
- Reference（只讀，Task 3 會刪）: `src/components/settings/EngineerManager.tsx`、`src/components/settings/UserManager.tsx`

**Interfaces:**
- Consumes: `buildPeopleView`、`SafeUser`、`PersonRow`（Task 1）；`useOptionsStore` 的 `addEngineer(unitId, name)`、`updateEngineer(unitId, engId, name)`、`toggleEngineer(unitId, engId, isActive)`、`removeEngineer(unitId, engId)`、`setEngineerColor(unitId, engId, color | null)`；`api.getUsers/createUser/updateUser/disableUser/enableUser/deleteUserPermanent`；`resolveEngineerColor(engValue, unitValue, options)`；`DeleteConfirmDialog`
- Produces: `export function PeopleManager(): JSX.Element`

- [ ] **Step 1: 建立元件檔**

寫入 `src/components/settings/PeopleManager.tsx`：

```tsx
// src/components/settings/PeopleManager.tsx
//
// 「測試人員」與「帳號管理」合併後的分頁。一人一列，帳號是人員的附屬欄位。
// 資料層不變：名冊仍走 optionsStore → PUT /api/options，帳號仍走 /api/users。
// 對應邏輯在 lib/peopleRows.ts（可測），這裡只渲染與呼叫。
//
// 沿用兩個既有決定：改名只動 label（value 是排程存的識別碼）；啟用不確認、
// 停用與永久刪除用 DeleteConfirmDialog。
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { AlertTriangle, UserPlus } from 'lucide-react'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { api } from '../../lib/api'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveEngineerColor } from '../../lib/colors'
import { buildPeopleView, type SafeUser, type PersonRow } from '../../lib/peopleRows'

type AccountRole = 'admin' | 'user'

/** 建立帳號的來源：從人員列（角色與對應人員鎖定）或從管理帳號區塊 */
type CreateTarget = { kind: 'admin' } | { kind: 'engineer'; engineerValue: string }

interface CreateForm {
  username: string
  displayName: string
  password: string
  role: AccountRole
  allowedUnits: string[]
  linkedEngineer: string
}

interface EditForm {
  displayName: string
  password: string
  allowedUnits: string[]
  linkedEngineer: string
  canLinkVtms: boolean
  canViewVtmsProgress: boolean
}

const EMPTY_CREATE: CreateForm = { username: '', displayName: '', password: '', role: 'admin', allowedUnits: [], linkedEngineer: '' }
const EMPTY_EDIT: EditForm = { displayName: '', password: '', allowedUnits: [], linkedEngineer: '', canLinkVtms: false, canViewVtmsProgress: false }

const INPUT = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ── 小元件（放在模組層級，避免每次 render 重新定義造成 remount）──────────

function UnitSelector({ allUnits, selected, onChange }: { allUnits: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const isAll = selected.length === 0
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">
        管轄單位<span className="ml-1 text-gray-400">（不選 = 全部可存取）</span>
      </label>
      <div className="border border-gray-300 rounded p-2 bg-white space-y-1 max-h-36 overflow-y-auto">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
          <input type="checkbox" checked={isAll} onChange={() => onChange([])} className="w-3.5 h-3.5 accent-blue-600" />
          <span className="text-xs font-medium text-gray-700">全部單位（不限制）</span>
        </label>
        <div className="border-t border-gray-100 my-1" />
        {allUnits.map(unit => (
          <label key={unit} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
            <input type="checkbox" checked={selected.includes(unit)}
              onChange={() => {
                if (isAll) onChange(allUnits.filter(u => u !== unit))
                else onChange(selected.includes(unit) ? selected.filter(u => u !== unit) : [...selected, unit])
              }}
              className="w-3.5 h-3.5 accent-blue-600" />
            <span className="text-xs text-gray-700">{unit}</span>
          </label>
        ))}
      </div>
      {!isAll && <p className="text-xs text-blue-600 mt-1">已選：{selected.join('、')}</p>}
    </div>
  )
}

function EngineerSelector({ allEngineers, value, onChange }: { allEngineers: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">對應測試人員 <span className="text-red-500">*</span></label>
      <select value={value} onChange={e => onChange(e.target.value)} className={INPUT}>
        <option value="">— 請選擇 —</option>
        {allEngineers.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
    </div>
  )
}

function VtmsPermissions({ value, onChange }: { value: Pick<EditForm, 'canLinkVtms' | 'canViewVtmsProgress'>; onChange: (v: Pick<EditForm, 'canLinkVtms' | 'canViewVtmsProgress'>) => void }) {
  return (
    <div>
      <p className="text-xs text-gray-600 mb-1">VTMS 整合權限</p>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={value.canLinkVtms}
          onChange={e => onChange({ ...value, canLinkVtms: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
        可連結排程至 VTMS 測試計畫
      </label>
      <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
        <input type="checkbox" checked={value.canViewVtmsProgress}
          onChange={e => onChange({ ...value, canViewVtmsProgress: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
        可檢視 VTMS 測試進度統計
      </label>
    </div>
  )
}

function RoleBadge({ role }: { role: SafeUser['role'] }) {
  const cls = role === 'super_admin' ? 'bg-purple-100 text-purple-700'
    : role === 'user' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
  const text = role === 'super_admin' ? 'Super Admin' : role === 'user' ? 'User' : 'Admin'
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{text}</span>
}

// ── 主元件 ───────────────────────────────────────────────────────────────

export function PeopleManager() {
  const { options, addEngineer, updateEngineer, toggleEngineer, removeEngineer, setEngineerColor } = useOptionsStore()

  // ── 帳號 ──
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)
  const [editTarget, setEditTarget] = useState<SafeUser | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT)
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; confirmLabel: string; danger: boolean; run: () => Promise<void>
  } | null>(null)

  // ── 名冊（沿用 EngineerManager 的狀態與錯誤分桶）──
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  const [draftColors, setDraftColors] = useState<Record<string, string>>({})
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})

  const view = useMemo(() => buildPeopleView(options.testUnits, users), [options.testUnits, users])

  const allUnits = useMemo(
    () => options.testUnits.filter(u => u.isActive).map(u => u.label).sort(),
    [options.testUnits],
  )
  const allEngineers = useMemo(
    () => options.testUnits.filter(u => u.isActive)
      .flatMap(u => u.engineers.filter(e => e.isActive).map(e => e.value)).sort(),
    [options.testUnits],
  )

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 3000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  const loadUsers = async () => {
    try { setUsers(await api.getUsers()) }
    catch { showMsg('載入帳號列表失敗', true) }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadUsers() }, [])

  // ── 帳號操作 ──

  const openCreate = (target: CreateTarget) => {
    setEditTarget(null)
    setCreateTarget(target)
    setCreateForm(target.kind === 'engineer'
      ? { ...EMPTY_CREATE, role: 'user', linkedEngineer: target.engineerValue }
      : EMPTY_CREATE)
  }

  const handleCreate = async () => {
    if (!createForm.username.trim() || !createForm.password) { showMsg('帳號與密碼為必填', true); return }
    if (createForm.password.length < 8) { showMsg('密碼長度至少需要 8 個字元', true); return }
    if (createForm.role === 'user' && !createForm.linkedEngineer) { showMsg('User 角色必須選擇對應測試人員', true); return }
    try {
      await api.createUser({
        username: createForm.username.trim(),
        displayName: createForm.displayName.trim() || undefined,
        password: createForm.password,
        role: createForm.role,
        allowedUnits: createForm.role === 'admin' ? createForm.allowedUnits : [],
        linkedEngineer: createForm.role === 'user' ? createForm.linkedEngineer : '',
      })
      showMsg(`帳號 ${createForm.username} 已新增`)
      setCreateTarget(null)
      setCreateForm(EMPTY_CREATE)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '新增失敗', true)
    }
  }

  const openEdit = (user: SafeUser) => {
    setCreateTarget(null)
    setEditTarget(user)
    setEditForm({
      displayName: user.displayName, password: '',
      allowedUnits: user.allowedUnits ?? [], linkedEngineer: user.linkedEngineer ?? '',
      canLinkVtms: user.canLinkVtms ?? false, canViewVtmsProgress: user.canViewVtmsProgress ?? false,
    })
  }

  const handleEdit = async () => {
    if (!editTarget) return
    try {
      await api.updateUser(editTarget.id, {
        displayName: editForm.displayName.trim() || undefined,
        password: editForm.password || undefined,
        allowedUnits: editTarget.role === 'admin' ? editForm.allowedUnits : [],
        linkedEngineer: editTarget.role === 'user' ? editForm.linkedEngineer : undefined,
        canLinkVtms: editForm.canLinkVtms,
        canViewVtmsProgress: editForm.canViewVtmsProgress,
      })
      showMsg(`帳號 ${editTarget.username} 已更新`)
      setEditTarget(null)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '更新失敗', true)
    }
  }

  const handleDisable = (user: SafeUser) => setConfirmState({
    title: '停用帳號',
    message: `停用後 ${user.username} 將無法登入，但帳號資料會保留，之後可以再啟用。`,
    confirmLabel: '停用', danger: false,
    run: async () => {
      try { await api.disableUser(user.id); showMsg(`帳號 ${user.username} 已停用`); await loadUsers() }
      catch (e: unknown) { showMsg((e as Error).message || '停用失敗', true) }
    },
  })

  const handleEnable = async (user: SafeUser) => {
    try { await api.enableUser(user.id); showMsg(`帳號 ${user.username} 已啟用`); await loadUsers() }
    catch (e: unknown) { showMsg((e as Error).message || '啟用失敗', true) }
  }

  const handleDeletePermanent = (user: SafeUser) => setConfirmState({
    title: '永久刪除帳號',
    message: `即將永久刪除 ${user.username}（${user.displayName || '未設顯示名稱'}）。此操作無法復原，該帳號的設定與關聯都會一併消失。`,
    confirmLabel: '永久刪除', danger: true,
    run: async () => {
      try { await api.deleteUserPermanent(user.id); showMsg(`帳號 ${user.username} 已永久刪除`); await loadUsers() }
      catch (e: unknown) { showMsg((e as Error).message || '刪除失敗', true) }
    },
  })

  // ── 名冊操作（與 EngineerManager 相同：await 後 set，失敗顯示在該列）──

  const clearDraftColor = (id: string) =>
    setDraftColors(d => { if (!(id in d)) return d; const n = { ...d }; delete n[id]; return n })
  const clearErr = (setter: typeof setActionErrors, id: string) =>
    setter(d => { const n = { ...d }; delete n[id]; return n })
  const msgOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

  const handleRemove = async (unitId: string, engId: string) => {
    clearErr(setDeleteErrors, engId)
    try { await removeEngineer(unitId, engId) }
    catch (err) { setDeleteErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleToggle = async (unitId: string, engId: string, isActive: boolean) => {
    clearErr(setActionErrors, engId)
    try { await toggleEngineer(unitId, engId, isActive) }
    catch (err) { setActionErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleRename = async (unitId: string, engId: string, name: string) => {
    clearErr(setActionErrors, engId)
    try { await updateEngineer(unitId, engId, name); clearErr(setEditKeys, engId) }
    catch (err) { setActionErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleSetColor = async (unitId: string, engId: string, color: string | null) => {
    clearErr(setActionErrors, engId)
    try { await setEngineerColor(unitId, engId, color) }
    catch (err) { setActionErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleAdd = async (unitId: string) => {
    const v = (newNames[unitId] ?? '').trim()
    if (!v) return
    clearErr(setAddErrors, unitId)
    try { await addEngineer(unitId, v); setNewNames(n => ({ ...n, [unitId]: '' })) }
    catch (err) { setAddErrors(d => ({ ...d, [unitId]: msgOf(err) })) }
  }

  // ── 渲染片段 ──

  const accountActions = (user: SafeUser) => (
    <div className="flex gap-1.5 flex-shrink-0">
      {user.isActive ? (
        <>
          <button type="button" onClick={() => openEdit(user)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">編輯</button>
          <button type="button" onClick={() => handleDisable(user)} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">停用</button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => handleEnable(user)} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">啟用</button>
          <button type="button" onClick={() => handleDeletePermanent(user)} className="flex items-center gap-1 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
            <AlertTriangle size={12} />永久刪除
          </button>
        </>
      )}
    </div>
  )

  const createFormPanel = () => {
    if (!createTarget) return null
    const locked = createTarget.kind === 'engineer'
    return (
      <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <h4 className="text-sm font-medium text-blue-800 mb-3">
          {locked ? `為 ${createTarget.engineerValue} 建立帳號` : '新增管理帳號'}
        </h4>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">帳號（username）<span className="text-red-500">*</span></label>
            <input type="text" value={createForm.username} placeholder="4~20 字元，英數字"
              onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">顯示名稱（選填）</label>
            <input type="text" value={createForm.displayName} placeholder="顯示用名稱"
              onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">角色</label>
            {locked ? (
              <p className="text-sm text-gray-700 px-2 py-1.5 bg-white border border-gray-200 rounded">User（測試人員）・對應 {createTarget.engineerValue}</p>
            ) : (
              <select value={createForm.role}
                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as AccountRole, allowedUnits: [], linkedEngineer: '' }))}
                className={INPUT}>
                <option value="admin">Admin（管理員）</option>
                <option value="user">User（測試人員）</option>
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">密碼<span className="text-red-500">*</span>（至少 8 個字元）</label>
            <input type="password" value={createForm.password}
              onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} className={INPUT} />
          </div>
          {!locked && createForm.role === 'admin' && (
            <UnitSelector allUnits={allUnits} selected={createForm.allowedUnits}
              onChange={v => setCreateForm(f => ({ ...f, allowedUnits: v }))} />
          )}
          {!locked && createForm.role === 'user' && (
            <EngineerSelector allEngineers={allEngineers} value={createForm.linkedEngineer}
              onChange={v => setCreateForm(f => ({ ...f, linkedEngineer: v }))} />
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={handleCreate} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">確認新增</button>
          <button type="button" onClick={() => setCreateTarget(null)} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">取消</button>
        </div>
      </div>
    )
  }

  const editFormPanel = (user: SafeUser) => (
    <div className="p-3 border border-orange-200 rounded-lg bg-orange-50">
      <p className="text-xs font-medium text-orange-800 mb-2">編輯帳號：{user.username}</p>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">顯示名稱</label>
          <input type="text" value={editForm.displayName} placeholder={user.displayName}
            onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">新密碼（留空表示不修改）</label>
          <input type="password" value={editForm.password} placeholder="至少 8 個字元"
            onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} className={INPUT} />
        </div>
        {user.role === 'admin' && (
          <UnitSelector allUnits={allUnits} selected={editForm.allowedUnits}
            onChange={v => setEditForm(f => ({ ...f, allowedUnits: v }))} />
        )}
        {user.role === 'user' && (
          <EngineerSelector allEngineers={allEngineers} value={editForm.linkedEngineer}
            onChange={v => setEditForm(f => ({ ...f, linkedEngineer: v }))} />
        )}
        <VtmsPermissions value={editForm} onChange={v => setEditForm(f => ({ ...f, ...v }))} />
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={handleEdit} className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600">確認更新</button>
        <button type="button" onClick={() => setEditTarget(null)} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">取消</button>
      </div>
    </div>
  )

  /** 人員列右側的帳號欄 */
  const accountCell = (row: PersonRow) => {
    const { engineer, account } = row
    if (!account) {
      return (
        <button type="button" onClick={() => openCreate({ kind: 'engineer', engineerValue: engineer.value })}
          className="flex items-center gap-1 text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-500 hover:bg-gray-50 hover:text-gray-700">
          <UserPlus size={12} />建立帳號
        </button>
      )
    }
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-xs text-gray-700 truncate">{account.username}</span>
            <RoleBadge role={account.role} />
            {!account.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">已停用</span>}
          </div>
          {account.lastLoginAt && (
            <div className="text-xs text-gray-400">上次登入 {new Date(account.lastLoginAt).toLocaleDateString('zh-TW')}</div>
          )}
        </div>
        {accountActions(account)}
      </div>
    )
  }

  const engineerRow = (unitId: string, unitValue: string, row: PersonRow) => {
    const eng = row.engineer
    const editing = editKeys[eng.id] !== undefined
    return (
      <div key={eng.id} className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <input className="border rounded px-2 py-0.5 text-sm flex-1" value={editKeys[eng.id]}
                onChange={e => setEditKeys(k => ({ ...k, [eng.id]: e.target.value }))} />
              <button type="button" onClick={() => handleRename(unitId, eng.id, editKeys[eng.id].trim())}
                className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded">確認</button>
              <button type="button" onClick={() => clearErr(setEditKeys, eng.id)}
                className="text-xs px-2 py-0.5 border rounded">取消</button>
            </>
          ) : (
            <>
              <input type="color" className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
                title="自訂人員色（甘特圖 bar 內裡與左欄徽章）"
                value={draftColors[eng.id] ?? eng.color ?? resolveEngineerColor(eng.value, unitValue, options)}
                onChange={e => setDraftColors(d => ({ ...d, [eng.id]: e.target.value }))}
                onBlur={() => {
                  const draft = draftColors[eng.id]
                  if (draft === undefined) return
                  const base = eng.color ?? resolveEngineerColor(eng.value, unitValue, options)
                  if (draft.toLowerCase() !== base.toLowerCase()) void handleSetColor(unitId, eng.id, draft)
                  clearDraftColor(eng.id)
                }} />
              {eng.color && (
                <button type="button" onMouseDown={() => clearDraftColor(eng.id)}
                  onClick={() => { void handleSetColor(unitId, eng.id, null); clearDraftColor(eng.id) }}
                  className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50 text-gray-500">還原</button>
              )}
              <span className={`flex-1 text-sm ${!eng.isActive ? 'line-through text-gray-400' : ''}`}>{eng.label}</span>
              <button type="button" onClick={() => setEditKeys(k => ({ ...k, [eng.id]: eng.label }))}
                className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50">編輯</button>
              <button type="button" onClick={() => handleToggle(unitId, eng.id, !eng.isActive)}
                className={`text-xs px-2 py-0.5 rounded ${eng.isActive ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                {eng.isActive ? '停用' : '啟用'}
              </button>
              <button type="button" onClick={() => handleRemove(unitId, eng.id)}
                className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">刪除</button>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              {accountCell(row)}
            </>
          )}
        </div>
        {deleteErrors[eng.id] && <p className="text-xs text-red-500 pl-8">{deleteErrors[eng.id]}</p>}
        {actionErrors[eng.id] && <p className="text-xs text-red-500 pl-8">{actionErrors[eng.id]}</p>}
        {row.account && editTarget?.id === row.account.id && <div className="pl-8 pt-1">{editFormPanel(row.account)}</div>}
        {createTarget?.kind === 'engineer' && createTarget.engineerValue === eng.value && <div className="pl-8 pt-1">{createFormPanel()}</div>}
      </div>
    )
  }

  const adminRow = (user: SafeUser, note?: ReactNode) => (
    <div key={user.id}>
      {editTarget?.id === user.id ? editFormPanel(user) : (
        <div className="flex items-center gap-3 py-2 px-3 border rounded-lg bg-white">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800">{user.displayName}</span>
              <RoleBadge role={user.role} />
              {!user.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">已停用</span>}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              帳號：{user.username}
              {user.lastLoginAt && ` ・ 上次登入：${new Date(user.lastLoginAt).toLocaleDateString('zh-TW')}`}
            </div>
            {user.role === 'admin' && (
              <div className="text-xs text-gray-500 mt-0.5">
                管轄單位：{!user.allowedUnits || user.allowedUnits.length === 0
                  ? <span className="text-green-600">全部</span>
                  : <span className="text-blue-600">{user.allowedUnits.join('、')}</span>}
              </div>
            )}
            {note}
          </div>
          {user.role !== 'super_admin' && accountActions(user)}
        </div>
      )}
    </div>
  )

  if (loading) return <p className="text-sm text-gray-400">載入中...</p>

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-1">人員</h3>
      <p className="text-xs text-gray-400 mb-3">
        名冊依測試單位分組；右側為該人員的登入帳號。人員色預設由所屬單位色衍生，按「還原」回到預設。
      </p>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5 mb-3">{error}</p>}
      {success && <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-1.5 mb-3">{success}</p>}

      {/* ── 上半：依單位分組的人員 ── */}
      <div className="space-y-6">
        {view.units.map(unit => (
          <div key={unit.unitId} className="border rounded p-3">
            <p className="font-medium text-sm text-gray-600 mb-2">{unit.unitLabel}</p>
            <div className="space-y-1 mb-2">
              {unit.rows.map(row => engineerRow(unit.unitId, unit.unitValue, row))}
            </div>
            <div className="flex gap-2">
              <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名"
                value={newNames[unit.unitId] ?? ''}
                onChange={e => setNewNames(n => ({ ...n, [unit.unitId]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void handleAdd(unit.unitId) }} />
              <button type="button" onClick={() => handleAdd(unit.unitId)}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
            </div>
            {addErrors[unit.unitId] && <p className="text-xs text-red-500 mt-1">{addErrors[unit.unitId]}</p>}
          </div>
        ))}
      </div>

      {/* ── 下半：管理帳號 ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-700">管理帳號</h4>
          <button type="button" onClick={() => openCreate({ kind: 'admin' })}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">＋ 新增管理帳號</button>
        </div>
        {createTarget?.kind === 'admin' && createFormPanel()}
        <div className="space-y-2">
          {view.adminAccounts.map(u => adminRow(u))}
        </div>
      </div>

      {/* ── 未對應人員的帳號：不能讓它們消失 ── */}
      {view.orphanAccounts.length > 0 && (
        <div className="mt-8">
          <h4 className="font-semibold text-gray-700 mb-1">未對應人員的帳號</h4>
          <p className="text-xs text-gray-400 mb-3">這些 User 帳號指到的測試人員不存在，或該人員已被另一個帳號對應。請編輯重選對應人員，或停用。</p>
          <div className="space-y-2">
            {view.orphanAccounts.map(({ user, reason }) => adminRow(user, (
              <div className="text-xs text-red-500 mt-0.5">
                {reason === 'duplicate'
                  ? `重複對應：${user.linkedEngineer} 已有另一個帳號`
                  : `對應人員不存在：${user.linkedEngineer || '未設定'}`}
              </div>
            )))}
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger ?? true}
        onConfirm={() => { const s = confirmState; setConfirmState(null); void s?.run() }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9`。若多出來，逐條看是不是本檔造成的（常見：`PersonRow` 型別 import 漏掉、`SafeUser['role']` 聯集與 `RoleBadge` 不合）。

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/PeopleManager.tsx
git commit -m "feat(settings): add PeopleManager combining the roster with accounts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 接上 SettingsPage，刪除舊分頁

**Files:**
- Modify: `src/components/settings/SettingsPage.tsx:3-27`（import、型別、分頁陣列）、`:69-71`、`:96`（渲染）
- Delete: `src/components/settings/EngineerManager.tsx`、`src/components/settings/UserManager.tsx`

**Interfaces:**
- Consumes: `PeopleManager`（Task 2）
- Produces: 無

- [ ] **Step 1: 改 import**

把：

```tsx
import { EngineerManager } from './EngineerManager'
import { RestDaysManager } from './RestDaysManager'
import { UserManager } from './UserManager'
```

改為：

```tsx
import { PeopleManager } from './PeopleManager'
import { RestDaysManager } from './RestDaysManager'
```

- [ ] **Step 2: 改型別與分頁陣列**

把：

```tsx
type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices' | 'notify'
```

改為：

```tsx
type SettingsTab = 'categories' | 'units' | 'people' | 'restdays' | 'devices' | 'notify'
```

把分頁陣列：

```tsx
    { key: 'categories', label: '工作類別' },
    { key: 'units',      label: '測試單位' },
    { key: 'engineers',  label: '測試人員' },
    { key: 'restdays',   label: '休息日設定' },
    { key: 'devices',    label: '設備管理' },
    { key: 'notify',     label: '預告通知' },
    { key: 'users',      label: '帳號管理', superAdminOnly: true },
```

改為：

```tsx
    { key: 'categories', label: '工作類別' },
    { key: 'units',      label: '測試單位' },
    // 「測試人員」與「帳號管理」合併。名冊維護從此只有 super_admin 能做（2026-09-09 決定）。
    { key: 'people',     label: '人員', superAdminOnly: true },
    { key: 'restdays',   label: '休息日設定' },
    { key: 'devices',    label: '設備管理' },
    { key: 'notify',     label: '預告通知' },
```

- [ ] **Step 3: 改渲染**

把：

```tsx
        {activeTab === 'engineers'  && <EngineerManager />}
```

改為：

```tsx
        {activeTab === 'people'     && isSuperAdmin && <PeopleManager />}
```

並刪除檔尾的：

```tsx
        {activeTab === 'users' && isSuperAdmin && <UserManager />}
```

- [ ] **Step 4: 檢查 uiStore 的分頁型別**

Run: `grep -n "settingsTab" src/store/uiStore.ts`

若 `settingsTab` 型別是字串聯集且列出 `'engineers'` / `'users'`，同步改成 `'people'`；若是 `string`，不動。舊瀏覽器存到 `'engineers'` 或 `'users'` 時，`SettingsPage` 的「目前 tab 不可見就回第一個」邏輯會處理，不需遷移。

- [ ] **Step 5: 刪除舊元件並確認無殘留引用**

```bash
git rm src/components/settings/EngineerManager.tsx src/components/settings/UserManager.tsx
grep -rn "EngineerManager\|UserManager" src
```

Expected: grep 無輸出（測試檔 `optionsStore-*.test.ts` 測的是 store，不引用元件）。

- [ ] **Step 6: 型別檢查與測試**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9`

Run: `npx vitest run`
Expected: 全 PASS（含 Task 1 新增的 8 項）

Run: `npx eslint src/components/settings/PeopleManager.tsx src/lib/peopleRows.ts`
Expected: 無新錯誤（專案既有 26 個 ESLint 問題主要在已刪除的 `UserManager.tsx`，數量應下降）。

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/SettingsPage.tsx src/store/uiStore.ts
git commit -m "feat(settings): merge tester roster and account management into a People tab

One row per person with the account as a subordinate column; admin and
super_admin accounts and orphaned user accounts get their own sections.
The tab is super_admin only. Data layer untouched: engineers and users
tables and their APIs are unchanged, so the C# Merged.Api roster query
is unaffected.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 實機驗證

**Files:** 無變更。

- [ ] **Step 1: 起 harness**

依 memory `vsms-ui-review-2026-09` 的作法：專案根目錄放 `_dev-admin.html` + `_dev-admin.tsx` + `_dev-stub.ts`，stub 覆寫 `window.fetch` 攔 `/api/*`：`/me` 依 `?role=` 回角色、`/api/options` 回含 engineers 的真實結構、`/api/users` 回假資料，假資料要包含：一個 super_admin、一個有管轄單位的 admin、一個對到 `Ben_Ko` 的 user、一個對到不存在人員 `Gone_Guy` 的 user、兩個都對到 `Cathy_Lin` 的 user。用 `preview_start` 開 `vsms-harness`（vite 5175），瀏覽 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin`，進系統設定。

- [ ] **Step 2: 檢查**

1. 分頁列有「人員」帶 SA 徽章，沒有「測試人員」「帳號管理」。
2. `?role=admin` 重新載入：看不到「人員」分頁。
3. super_admin：`Ben_Ko` 那列右側顯示帳號名與 User 徽章；沒帳號的人顯示「建立帳號」；按下去表單的角色欄是唯讀文字「User（測試人員）・對應 …」。
4. 「管理帳號」區塊列出 super_admin 與 admin；「未對應人員的帳號」列出 `Gone_Guy` 那個（對應人員不存在）與第二個 `Cathy_Lin`（重複對應）。
5. 用 `resize_window` 切 375 寬：人員列的按鈕可能換行，但不得橫向溢出頁面。

截圖 1440 寬一張留存。驗完刪除 `_dev-*` 檔（`.git/info/exclude` 已排除，不會誤入 commit）。

- [ ] **Step 3: 最後確認**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` → `9`
Run: `npx vitest run` → 全 PASS

（無 commit。部署見 spec：`xcopy /E /I /Y dist dist.stable-<日期>` 後 `npx vite build`，由使用者決定時間。）
