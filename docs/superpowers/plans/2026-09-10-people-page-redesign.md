# 人員頁重排（A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系統設定「人員」分頁改成「一個名字一個人」：固定欄寬讓同功能按鈕垂直對齊、動作滑過才顯示但佔位不變、一人一份置中表單、停用者收進預設摺疊的「已停用」區塊、色塊無還原。

**Architecture:** 純函式 `buildPeopleModel`（名冊 × 帳號的聯集與分組）與 `peopleActions`（停用／啟用要橫跨兩個 API 的流程）都可用 stub 測試；`optionsStore` 加兩個「一次 PUT 套多列」的動作；React 端拆成 `PeopleManager`（分組與區塊）、`PersonRow`（一列的 grid）、`PersonFormModal`（一人一份表單）三個檔案。資料層與 server 完全不動。

**Tech Stack:** React 19、Zustand（`persist`）、Tailwind v4、lucide-react、vitest（jsdom）。

## Global Constraints

- **設計文件**：`docs/superpowers/specs/2026-09-10-people-page-redesign-design.md`。有衝突以設計文件為準。
- **純前端**：不得動 `server/`、`prisma/`。
- **身分規則**：`username === engineer.value` 即同一人，不分角色；`linkedEngineer` 只在建立 user 帳號時送出（等於姓名），不用來對應。
- **改名只動 label**，`value` 是排程存的識別碼。
- **角色顯示文字**：`super_admin`→「系統管理員」、`admin`→「部級主管」、`user`→「測試人員」；資料值不改。
- **停用的定義**：名冊每一列 `isActive=false` 且（無帳號或帳號 `isActive=false`）。
- **列上「停用」= 名冊全停 + 帳號停用，要確認；「啟用」不確認。** 兩個 API 分開呼叫，第二步失敗要講清楚、不回滾。
- **顏色無還原鈕。**
- **同功能按鈕同一條垂直線**：每列同一個 `grid-template-columns`，動作區用 `opacity` 隱藏（佔位不變），`group-hover` 與 `group-focus-within` 都要顯示。
- **已停用區塊預設摺疊**，狀態存 `uiStore.peopleInactiveOpen`（要 persist）。
- **不得執行 `npm run build` / `npx vite build`**（dist 由 3001 即時服務，build 等於部署）。不得動 port 3001。
- **前端既有 tsc 錯誤 8 個**：`npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` 必須維持 `8`。
- **前端測試**：`npx vitest run`（目前 216 項）。
- **commit 訊息英文**，結尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。commit 到 `feat/guest-role-and-uiux`，不推 GitHub。
- 專案根目錄 `F:\vsms\vsms-export`，指令一律用絕對路徑（shell cwd 跨呼叫保留，可能停在別的 repo）。
- **工作區有別人未提交的 `server/src/routes/auth.ts`、`server/src/lib/crypto.ts`、`server/src/__tests__/loginPasswordValidation.test.ts` 與 `.env.bak-20260827`，任何 commit 都不得把它們 stage 進去**——`git add` 一律指定檔案路徑。

---

### Task 1: 重寫 `peopleRows.ts` — 一個名字一個人

**Files:**
- Modify（整檔重寫）: `src/lib/peopleRows.ts`
- Modify（整檔重寫）: `src/__tests__/peopleRows.test.ts`

**Interfaces:**
- Consumes: `TestUnitOption`、`EngineerOption`、`User` from `src/types.ts`
- Produces:
  ```ts
  export type SafeUser = Omit<User, 'passwordHash'>
  export interface Membership { unitId: string; unitValue: string; unitLabel: string; engineer: EngineerOption }
  export interface Person { name: string; label: string; memberships: Membership[]; rosterActive: boolean; account: SafeUser | null }
  export interface PersonGroup { unitId: string | null; unitLabel: string; people: Person[] }
  export interface PeopleModel { active: PersonGroup[]; inactive: PersonGroup[]; unassigned: Person[] }
  export function roleLabel(role: User['role']): string
  export function isPersonInactive(p: Person): boolean
  export function buildPeopleModel(testUnits: TestUnitOption[], users: SafeUser[]): PeopleModel
  ```

- [ ] **Step 1: 寫失敗的測試（整檔取代舊測試）**

寫入 `src/__tests__/peopleRows.test.ts`：

```ts
// src/__tests__/peopleRows.test.ts
// 「人員」分頁的身分模型：一個名字就是一個人。名冊以 engineer.value 為鍵、
// 帳號以 username 為鍵，同名即同一人，不分角色。
import { describe, it, expect } from 'vitest'
import { buildPeopleModel, isPersonInactive, roleLabel, type SafeUser } from '../lib/peopleRows'
import type { TestUnitOption } from '../types'

const units: TestUnitOption[] = [
  {
    id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null,
    engineers: [
      { id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null },
      { id: 'e2', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 1, color: '#112233' },
      { id: 'e3', value: 'Ben_Ko', label: 'Ben_Ko', isActive: false, sortOrder: 2, color: null },
    ],
  },
  {
    id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', isActive: true, sortOrder: 1, color: null,
    engineers: [
      { id: 'e4', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 0, color: null },
      { id: 'e5', value: 'Nervo_Kuo', label: 'Nervo_Kuo', isActive: true, sortOrder: 1, color: null },
    ],
  },
]

function user(over: Partial<SafeUser> & { username: string }): SafeUser {
  return {
    id: 'id-' + over.username, displayName: over.username, role: 'user', isActive: true, allowedUnits: [],
    linkedEngineer: '', createdAt: '2026-01-01T00:00:00Z', lastLoginAt: '',
    canLinkVtms: false, canViewVtmsProgress: false,
    ...over,
  }
}

const findPerson = (groups: { people: { name: string }[] }[], name: string) =>
  groups.flatMap(g => g.people).find(p => p.name === name)

describe('buildPeopleModel', () => {
  it('同名多單位合併成一人，memberships 依單位順序', () => {
    const m = buildPeopleModel(units, [])
    const ericct = findPerson(m.active, 'Ericct_Hsieh')!
    expect(ericct.memberships.map(x => x.unitValue)).toEqual(['SIT-HW', 'SIT-SW'])
    expect(ericct.memberships[0].engineer.color).toBe('#112233')
  })

  it('啟用清單依單位分組，一人多單位時每個單位都列他', () => {
    const m = buildPeopleModel(units, [])
    expect(m.active.map(g => g.unitLabel)).toEqual(['SIT-HW', 'SIT-SW'])
    expect(m.active[0].people.map(p => p.name)).toEqual(['Rock_Cai', 'Ericct_Hsieh'])
    expect(m.active[1].people.map(p => p.name)).toEqual(['Ericct_Hsieh', 'Nervo_Kuo'])
  })

  it('帳號以 username 對應，admin 也對得到', () => {
    const m = buildPeopleModel(units, [
      user({ username: 'Ericct_Hsieh', role: 'admin', allowedUnits: ['SIT-HW', 'SIT-SW'] }),
      user({ username: 'Rock_Cai', linkedEngineer: 'Rock_Cai' }),
    ])
    expect(findPerson(m.active, 'Ericct_Hsieh')!.account?.role).toBe('admin')
    expect(findPerson(m.active, 'Rock_Cai')!.account?.username).toBe('Rock_Cai')
    expect(findPerson(m.active, 'Nervo_Kuo')!.account).toBeNull()
  })

  it('只有帳號沒有名冊的人進 unassigned', () => {
    const m = buildPeopleModel(units, [user({ username: 'admin', role: 'super_admin' })])
    expect(m.unassigned.map(p => p.name)).toEqual(['admin'])
    expect(m.unassigned[0].memberships).toEqual([])
    expect(findPerson(m.active, 'admin')).toBeUndefined()
  })

  it('名冊全停且無帳號 → 停用區塊；名冊全停但帳號啟用 → 仍在啟用清單', () => {
    const m = buildPeopleModel(units, [user({ username: 'Ben_Ko' })])
    expect(findPerson(m.active, 'Ben_Ko')).toBeDefined()
    expect(findPerson(m.inactive, 'Ben_Ko')).toBeUndefined()

    const m2 = buildPeopleModel(units, [])
    expect(findPerson(m2.active, 'Ben_Ko')).toBeUndefined()
    expect(findPerson(m2.inactive, 'Ben_Ko')).toBeDefined()
    expect(m2.inactive.map(g => g.unitLabel)).toEqual(['SIT-HW'])
  })

  it('名冊全停且帳號停用 → 停用區塊', () => {
    const m = buildPeopleModel(units, [user({ username: 'Ben_Ko', isActive: false })])
    expect(findPerson(m.inactive, 'Ben_Ko')!.account?.isActive).toBe(false)
  })

  it('只停一個單位的人仍在啟用清單，rosterActive 為 true', () => {
    const partial = units.map(u => u.id !== 'u-sw' ? u : {
      ...u, engineers: u.engineers.map(e => e.value === 'Ericct_Hsieh' ? { ...e, isActive: false } : e),
    })
    const m = buildPeopleModel(partial, [])
    expect(findPerson(m.active, 'Ericct_Hsieh')!.rosterActive).toBe(true)
  })

  it('只有帳號且帳號停用 → 停用區塊的「無單位」組', () => {
    const m = buildPeopleModel(units, [user({ username: 'ex_intern', isActive: false })])
    expect(m.unassigned).toEqual([])
    const g = m.inactive.find(x => x.unitId === null)!
    expect(g.unitLabel).toBe('無單位')
    expect(g.people.map(p => p.name)).toEqual(['ex_intern'])
  })

  it('停用區塊沒有人時為空陣列', () => {
    const only = [units[1]]
    expect(buildPeopleModel(only, []).inactive).toEqual([])
  })

  it('label 取第一個 membership 的 label', () => {
    const renamed = units.map(u => u.id !== 'u-hw' ? u : {
      ...u, engineers: u.engineers.map(e => e.id === 'e1' ? { ...e, label: 'Rock' } : e),
    })
    expect(findPerson(buildPeopleModel(renamed, []).active, 'Rock_Cai')!.label).toBe('Rock')
  })
})

describe('isPersonInactive / roleLabel', () => {
  it('isPersonInactive：名冊全停且無帳號', () => {
    expect(isPersonInactive({ name: 'x', label: 'x', memberships: [], rosterActive: false, account: null })).toBe(true)
    expect(isPersonInactive({ name: 'x', label: 'x', memberships: [], rosterActive: false, account: user({ username: 'x' }) })).toBe(false)
    expect(isPersonInactive({ name: 'x', label: 'x', memberships: [], rosterActive: true, account: null })).toBe(false)
  })

  it('roleLabel 三種角色', () => {
    expect(roleLabel('super_admin')).toBe('系統管理員')
    expect(roleLabel('admin')).toBe('部級主管')
    expect(roleLabel('user')).toBe('測試人員')
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/peopleRows.test.ts`
Expected: FAIL（`buildPeopleModel` 不存在）

- [ ] **Step 3: 整檔重寫 `src/lib/peopleRows.ts`**

```ts
// src/lib/peopleRows.ts
//
// 「人員」分頁的身分模型：一個名字就是一個人。
//   名冊：engineers.value（不唯一，同一人在多個單位各有一列 = 屬於多個單位）
//   帳號：users.username
// 兩邊同名即同一人，不分角色。正式資料 26 個帳號全部符合（2026-09-10 查證），
// linkedEngineer 只是建立 user 帳號時後端要的欄位，不再當對應依據。
import type { TestUnitOption, EngineerOption, User } from '../types'

export type SafeUser = Omit<User, 'passwordHash'>

export interface Membership {
  unitId: string
  unitValue: string
  unitLabel: string
  engineer: EngineerOption
}

export interface Person {
  /** engineer.value === username */
  name: string
  /** 顯示名稱：第一個 membership 的 label，沒有名冊列時等於 name */
  label: string
  /** 依單位 sortOrder 排序 */
  memberships: Membership[]
  /** 任一 membership isActive */
  rosterActive: boolean
  account: SafeUser | null
}

export interface PersonGroup {
  /** null = 無單位（只有帳號的人） */
  unitId: string | null
  unitLabel: string
  people: Person[]
}

export interface PeopleModel {
  /** 依單位分組；一人多單位時每個單位都列他 */
  active: PersonGroup[]
  /** 名冊全停且（無帳號或帳號停用）的人，依單位分組，最後可能有「無單位」組 */
  inactive: PersonGroup[]
  /** 有帳號、沒名冊列、帳號啟用 */
  unassigned: Person[]
}

const ROLE_LABEL: Record<User['role'], string> = {
  super_admin: '系統管理員',
  admin: '部級主管',
  user: '測試人員',
}

export function roleLabel(role: User['role']): string {
  return ROLE_LABEL[role] ?? role
}

/** 名冊每一列都停用，且沒有帳號或帳號停用 */
export function isPersonInactive(p: Person): boolean {
  return !p.rosterActive && (!p.account || !p.account.isActive)
}

const UNASSIGNED_LABEL = '無單位'

export function buildPeopleModel(testUnits: TestUnitOption[], users: SafeUser[]): PeopleModel {
  const byUsername = new Map(users.map(u => [u.username, u]))
  const sortedUnits = [...testUnits].sort((a, b) => a.sortOrder - b.sortOrder)

  // 1. 名冊 → Person（合併同名）
  const persons = new Map<string, Person>()
  for (const unit of sortedUnits) {
    const engineers = [...unit.engineers].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const engineer of engineers) {
      const existing = persons.get(engineer.value)
      const membership: Membership = { unitId: unit.id, unitValue: unit.value, unitLabel: unit.label, engineer }
      if (existing) {
        existing.memberships.push(membership)
        existing.rosterActive = existing.rosterActive || engineer.isActive
      } else {
        persons.set(engineer.value, {
          name: engineer.value,
          label: engineer.label,
          memberships: [membership],
          rosterActive: engineer.isActive,
          account: byUsername.get(engineer.value) ?? null,
        })
      }
    }
  }

  // 2. 只有帳號的人
  const accountOnly: Person[] = users
    .filter(u => !persons.has(u.username))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(u => ({ name: u.username, label: u.username, memberships: [], rosterActive: false, account: u }))

  // 3. 分組
  const active: PersonGroup[] = []
  const inactive: PersonGroup[] = []
  for (const unit of sortedUnits) {
    const here = [...persons.values()].filter(p => p.memberships.some(m => m.unitId === unit.id))
    const order = (p: Person) => p.memberships.find(m => m.unitId === unit.id)!.engineer.sortOrder
    const activePeople = here.filter(p => !isPersonInactive(p)).sort((a, b) => order(a) - order(b))
    const inactivePeople = here.filter(isPersonInactive).sort((a, b) => order(a) - order(b))
    active.push({ unitId: unit.id, unitLabel: unit.label, people: activePeople })
    if (inactivePeople.length > 0) inactive.push({ unitId: unit.id, unitLabel: unit.label, people: inactivePeople })
  }

  const unassigned = accountOnly.filter(p => !isPersonInactive(p))
  const unassignedInactive = accountOnly.filter(isPersonInactive)
  if (unassignedInactive.length > 0) inactive.push({ unitId: null, unitLabel: UNASSIGNED_LABEL, people: unassignedInactive })

  return { active, inactive, unassigned }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/peopleRows.test.ts`
Expected: 12 passed

- [ ] **Step 5: 型別檢查**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: 大於 8 是正常的——`PeopleManager.tsx` 還在用舊的 `buildPeopleView`，Task 6 會重寫它。把多出來的錯誤數記在報告裡，確認**全部**來自 `PeopleManager.tsx`（`npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS" | grep -v PeopleManager | wc -l` 應為 8）。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export && git add src/lib/peopleRows.ts src/__tests__/peopleRows.test.ts && git commit -m "feat(people): model people by name — roster rows and accounts join on the same identity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `optionsStore` 的兩個批次動作

**Files:**
- Modify: `src/store/optionsStore.ts`（interface 加兩個簽名；實作加在 `setEngineerColor` 之後）
- Test: `src/__tests__/optionsStore-people.test.ts`

**Interfaces:**
- Produces:
  ```ts
  patchEngineers: (targets: { unitId: string; engId: string }[], patch: Partial<Pick<EngineerOption, 'label' | 'isActive' | 'color'>>) => Promise<void>
  setPersonUnits: (name: string, unitIds: string[]) => Promise<void>
  ```
  兩者都只發**一次** `PUT /api/options`。`setPersonUnits`：`unitIds` 內沒有這個人的單位新增一列（`label = name`、`isActive = true`、`sortOrder = 該單位人數`）；不在 `unitIds` 但有這個人的單位刪掉那一列。

- [ ] **Step 1: 寫失敗的測試**

寫入 `src/__tests__/optionsStore-people.test.ts`：

```ts
// src/__tests__/optionsStore-people.test.ts
// 人員頁「一個人一份屬性」：改色／改名／停用要一次套到所有單位列，
// 而且只能發一次 PUT，否則第二次失敗會留下半套的狀態。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import type { OptionsMap } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

function baseOptions(): OptionsMap {
  return {
    categories: [], restDays: { weekends: true, specificDates: [] }, devices: [],
    testUnits: [
      { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, engineers: [
        { id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null },
        { id: 'e2', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 1, color: null },
      ] },
      { id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', isActive: true, sortOrder: 1, color: null, engineers: [
        { id: 'e4', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 0, color: null },
      ] },
      { id: 'u-ra', value: 'RA', label: 'RA', isActive: true, sortOrder: 2, color: null, engineers: [] },
    ],
  }
}

function stubFetchEcho() {
  const spy = vi.fn(async (_url: string, opts: RequestInit) => {
    const body = opts.body ? JSON.parse(opts.body as string) : {}
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const eng = (unitId: string, value: string) =>
  useOptionsStore.getState().options.testUnits.find(u => u.id === unitId)!.engineers.find(e => e.value === value)

beforeEach(() => { useOptionsStore.setState({ options: baseOptions() }) })

describe('patchEngineers', () => {
  it('一次套到多列，只發一次 PUT', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().patchEngineers(
      [{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }],
      { isActive: false, color: '#abcdef' },
    )
    expect(spy).toHaveBeenCalledTimes(1)
    expect(eng('u-hw', 'Ericct_Hsieh')!.isActive).toBe(false)
    expect(eng('u-sw', 'Ericct_Hsieh')!.color).toBe('#abcdef')
    expect(eng('u-hw', 'Rock_Cai')!.isActive).toBe(true)
  })

  it('改 label 不動 value', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().patchEngineers([{ unitId: 'u-hw', engId: 'e1' }], { label: 'Rock' })
    expect(eng('u-hw', 'Rock_Cai')).toMatchObject({ value: 'Rock_Cai', label: 'Rock' })
  })

  it('PUT 失敗時 store 不變並拋出', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ message: '失敗' }), { status: 500, headers: { 'Content-Type': 'application/json' } })))
    await expect(useOptionsStore.getState().patchEngineers([{ unitId: 'u-hw', engId: 'e1' }], { isActive: false })).rejects.toThrow()
    expect(eng('u-hw', 'Rock_Cai')!.isActive).toBe(true)
  })
})

describe('setPersonUnits', () => {
  it('新增缺的單位、刪掉多的單位，只發一次 PUT', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Ericct_Hsieh', ['u-sw', 'u-ra'])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(eng('u-hw', 'Ericct_Hsieh')).toBeUndefined()
    expect(eng('u-sw', 'Ericct_Hsieh')!.id).toBe('e4')
    expect(eng('u-ra', 'Ericct_Hsieh')).toMatchObject({ value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 0 })
  })

  it('沒有變動時不發 PUT', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Ericct_Hsieh', ['u-hw', 'u-sw'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('空陣列等於從名冊移除這個人', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Ericct_Hsieh', [])
    expect(eng('u-hw', 'Ericct_Hsieh')).toBeUndefined()
    expect(eng('u-sw', 'Ericct_Hsieh')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/optionsStore-people.test.ts`
Expected: FAIL（`patchEngineers is not a function`）

- [ ] **Step 3: 實作**

`src/store/optionsStore.ts` 的 import 加 `EngineerOption`：

```ts
import type { OptionsMap, Option, CategoryOption, CategoryStatsMode, TestUnitOption, RestDaysConfig, EngineerOption } from '../types'
```

interface 在 `setEngineerColor` 之後加：

```ts
  /** 一次 PUT 把同一個 patch 套到多個單位列（人員頁「一個人一份屬性」） */
  patchEngineers: (
    targets: { unitId: string; engId: string }[],
    patch: Partial<Pick<EngineerOption, 'label' | 'isActive' | 'color'>>,
  ) => Promise<void>
  /** 讓 name 這個人恰好屬於 unitIds 這些單位：缺的新增一列、多的刪掉，一次 PUT；無變動不發 */
  setPersonUnits: (name: string, unitIds: string[]) => Promise<void>
```

實作在 `setEngineerColor` 之後加：

```ts
  patchEngineers: async (targets, patch) => {
    const wanted = new Set(targets.map(t => `${t.unitId}/${t.engId}`))
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => ({
        ...u,
        engineers: u.engineers.map((e) => wanted.has(`${u.id}/${e.id}`) ? { ...e, ...patch } : e),
      })),
    }
    await persistOptions(next)
    set({ options: next })
  },

  setPersonUnits: async (name, unitIds) => {
    const want = new Set(unitIds)
    let changed = false
    const testUnits = get().options.testUnits.map((u) => {
      const has = u.engineers.some(e => e.value === name)
      if (want.has(u.id) && !has) {
        changed = true
        const eng: Option = { id: uuidv4(), value: name, label: name, isActive: true, sortOrder: u.engineers.length }
        return { ...u, engineers: [...u.engineers, eng] }
      }
      if (!want.has(u.id) && has) {
        changed = true
        return { ...u, engineers: u.engineers.filter(e => e.value !== name) }
      }
      return u
    })
    if (!changed) return
    const next = { ...get().options, testUnits }
    await persistOptions(next)
    set({ options: next })
  },
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/optionsStore-people.test.ts`
Expected: 6 passed

- [ ] **Step 5: 既有 optionsStore 測試仍過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/optionsStore-removeEngineer.test.ts src/__tests__/optionsStore-toggleEngineer.test.ts src/__tests__/optionsStore-updateEngineer.test.ts`
Expected: 全 PASS

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export && git add src/store/optionsStore.ts src/__tests__/optionsStore-people.test.ts && git commit -m "feat(options): patchEngineers and setPersonUnits apply one change across a person's unit rows in a single PUT

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `peopleActions.ts` — 停用／啟用橫跨兩個 API

**Files:**
- Create: `src/lib/peopleActions.ts`
- Test: `src/__tests__/peopleActions.test.ts`

**Interfaces:**
- Consumes: `Person`（Task 1）
- Produces:
  ```ts
  export interface PeopleDeps {
    patchEngineers: (targets: { unitId: string; engId: string }[], patch: { isActive: boolean }) => Promise<void>
    disableUser: (id: string) => Promise<unknown>
    enableUser: (id: string) => Promise<unknown>
  }
  export type ActionResult = { ok: true } | { ok: false; message: string }
  export function deactivatePerson(p: Person, deps: PeopleDeps): Promise<ActionResult>
  export function activatePerson(p: Person, deps: PeopleDeps): Promise<ActionResult>
  export function membershipTargets(p: Person): { unitId: string; engId: string }[]
  ```

- [ ] **Step 1: 寫失敗的測試**

寫入 `src/__tests__/peopleActions.test.ts`：

```ts
// src/__tests__/peopleActions.test.ts
// 列上的「停用」= 名冊全停 + 帳號停用，走兩個 API。第二步失敗時第一步已經
// 生效，回傳值要把這件事講清楚，不回滾也不拋出。
import { describe, it, expect, vi } from 'vitest'
import { deactivatePerson, activatePerson, membershipTargets, type PeopleDeps } from '../lib/peopleActions'
import type { Person, SafeUser } from '../lib/peopleRows'

const account: SafeUser = {
  id: 'acc-1', username: 'Ericct_Hsieh', displayName: 'Ericct_Hsieh', role: 'admin', isActive: true,
  allowedUnits: [], linkedEngineer: '', createdAt: '', lastLoginAt: '', canLinkVtms: false, canViewVtmsProgress: false,
}
const eng = (id: string, isActive = true) => ({ id, value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive, sortOrder: 0, color: null })
const person = (over: Partial<Person> = {}): Person => ({
  name: 'Ericct_Hsieh', label: 'Ericct_Hsieh', rosterActive: true, account,
  memberships: [
    { unitId: 'u-hw', unitValue: 'SIT-HW', unitLabel: 'SIT-HW', engineer: eng('e2') },
    { unitId: 'u-sw', unitValue: 'SIT-SW', unitLabel: 'SIT-SW', engineer: eng('e4') },
  ],
  ...over,
})
const deps = (): PeopleDeps => ({
  patchEngineers: vi.fn().mockResolvedValue(undefined),
  disableUser: vi.fn().mockResolvedValue({ ok: true }),
  enableUser: vi.fn().mockResolvedValue({}),
})

describe('membershipTargets', () => {
  it('列出每個 membership 的 unitId/engId', () => {
    expect(membershipTargets(person())).toEqual([{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }])
  })
})

describe('deactivatePerson', () => {
  it('名冊全停 + 帳號停用', async () => {
    const d = deps()
    expect(await deactivatePerson(person(), d)).toEqual({ ok: true })
    expect(d.patchEngineers).toHaveBeenCalledWith([{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }], { isActive: false })
    expect(d.disableUser).toHaveBeenCalledWith('acc-1')
  })

  it('沒有帳號只停名冊', async () => {
    const d = deps()
    await deactivatePerson(person({ account: null }), d)
    expect(d.disableUser).not.toHaveBeenCalled()
  })

  it('沒有名冊列只停帳號', async () => {
    const d = deps()
    await deactivatePerson(person({ memberships: [], rosterActive: false }), d)
    expect(d.patchEngineers).not.toHaveBeenCalled()
    expect(d.disableUser).toHaveBeenCalledWith('acc-1')
  })

  it('帳號已停用就不再呼叫 disableUser', async () => {
    const d = deps()
    await deactivatePerson(person({ account: { ...account, isActive: false } }), d)
    expect(d.disableUser).not.toHaveBeenCalled()
  })

  it('第一步失敗：回 ok:false，不呼叫第二步', async () => {
    const d = deps()
    d.patchEngineers = vi.fn().mockRejectedValue(new Error('ENGINEER_IN_USE'))
    const r = await deactivatePerson(person(), d)
    expect(r).toEqual({ ok: false, message: '名冊停用失敗：ENGINEER_IN_USE' })
    expect(d.disableUser).not.toHaveBeenCalled()
  })

  it('第二步失敗：講清楚名冊已停用', async () => {
    const d = deps()
    d.disableUser = vi.fn().mockRejectedValue(new Error('403'))
    const r = await deactivatePerson(person(), d)
    expect(r).toEqual({ ok: false, message: '名冊已停用，但帳號停用失敗：403' })
  })
})

describe('activatePerson', () => {
  it('名冊全啟 + 帳號啟用', async () => {
    const d = deps()
    expect(await activatePerson(person({ rosterActive: false, account: { ...account, isActive: false } }), d)).toEqual({ ok: true })
    expect(d.patchEngineers).toHaveBeenCalledWith(expect.any(Array), { isActive: true })
    expect(d.enableUser).toHaveBeenCalledWith('acc-1')
  })

  it('帳號已啟用就不再呼叫 enableUser', async () => {
    const d = deps()
    await activatePerson(person(), d)
    expect(d.enableUser).not.toHaveBeenCalled()
  })

  it('第二步失敗：講清楚名冊已啟用', async () => {
    const d = deps()
    d.enableUser = vi.fn().mockRejectedValue(new Error('500'))
    const r = await activatePerson(person({ account: { ...account, isActive: false } }), d)
    expect(r).toEqual({ ok: false, message: '名冊已啟用，但帳號啟用失敗：500' })
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/peopleActions.test.ts`
Expected: FAIL，`Cannot find module '../lib/peopleActions'`

- [ ] **Step 3: 實作**

寫入 `src/lib/peopleActions.ts`：

```ts
// src/lib/peopleActions.ts
//
// 人員頁列上的「停用／啟用」要橫跨兩個 API（名冊走 PUT /api/options、帳號走
// /api/users），沒有交易。流程抽成純函式並注入相依，第二步失敗時把「第一步
// 已經生效」講清楚，不回滾、不拋出，由呼叫端決定怎麼顯示。
import type { Person } from './peopleRows'

export interface PeopleDeps {
  patchEngineers: (targets: { unitId: string; engId: string }[], patch: { isActive: boolean }) => Promise<void>
  disableUser: (id: string) => Promise<unknown>
  enableUser: (id: string) => Promise<unknown>
}

export type ActionResult = { ok: true } | { ok: false; message: string }

export function membershipTargets(p: Person): { unitId: string; engId: string }[] {
  return p.memberships.map(m => ({ unitId: m.unitId, engId: m.engineer.id }))
}

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function setActive(p: Person, isActive: boolean, deps: PeopleDeps): Promise<ActionResult> {
  const verb = isActive ? '啟用' : '停用'
  const targets = membershipTargets(p)
  if (targets.length > 0) {
    try { await deps.patchEngineers(targets, { isActive }) }
    catch (e) { return { ok: false, message: `名冊${verb}失敗：${msgOf(e)}` } }
  }
  if (p.account && p.account.isActive !== isActive) {
    try { await (isActive ? deps.enableUser(p.account.id) : deps.disableUser(p.account.id)) }
    catch (e) {
      const prefix = targets.length > 0 ? `名冊已${verb}，但` : ''
      return { ok: false, message: `${prefix}帳號${verb}失敗：${msgOf(e)}` }
    }
  }
  return { ok: true }
}

export const deactivatePerson = (p: Person, deps: PeopleDeps) => setActive(p, false, deps)
export const activatePerson = (p: Person, deps: PeopleDeps) => setActive(p, true, deps)
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/peopleActions.test.ts`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
cd /f/vsms/vsms-export && git add src/lib/peopleActions.ts src/__tests__/peopleActions.test.ts && git commit -m "feat(people): deactivate/activate a person across roster and account with explicit partial-failure messages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `uiStore` 加已停用區塊的摺疊狀態

**Files:**
- Modify: `src/store/uiStore.ts`

**Interfaces:**
- Produces: `peopleInactiveOpen: boolean`（預設 `false`）、`setPeopleInactiveOpen(v: boolean)`；持久化。

- [ ] **Step 1: 改 interface 與實作**

`interface UIState` 加：

```ts
  /** 人員頁「已停用」區塊是否展開；預設摺疊，避免名單愈來愈長 */
  peopleInactiveOpen: boolean
  setPeopleInactiveOpen: (v: boolean) => void
```

`persist((set) => ({ … }))` 內加：

```ts
      peopleInactiveOpen: false,
      setPeopleInactiveOpen: (v) => set({ peopleInactiveOpen: v }),
```

`partialize` 加 `peopleInactiveOpen: state.peopleInactiveOpen,`。

- [ ] **Step 2: 型別檢查**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS" | grep -v PeopleManager | wc -l`
Expected: `8`

- [ ] **Step 3: Commit**

```bash
cd /f/vsms/vsms-export && git add src/store/uiStore.ts && git commit -m "feat(ui-store): persist the collapsed state of the inactive people section

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `PersonRow` 與 `PersonFormModal`

**Files:**
- Create: `src/components/settings/PersonRow.tsx`
- Create: `src/components/settings/PersonFormModal.tsx`

**Interfaces:**
- Consumes: `Person`、`SafeUser`、`roleLabel`（Task 1）；`useOptionsStore().patchEngineers / setPersonUnits`（Task 2）；`api.createUser / updateUser / deleteUserPermanent`；`resolveEngineerColor(engineerValue, unitValue, options)`；`resolveUnitColor(unitValue, options)`、`readableTextColor(hex)` from `src/lib/colors.ts`；`DeleteConfirmDialog`；`useEscapeKey(active, onEscape)`；`SegmentedControl<T>({ options, value, onChange, size, ariaLabel })`。
- Produces:
  ```ts
  // PersonRow
  export const PEOPLE_GRID = 'grid grid-cols-[28px_minmax(0,1fr)_minmax(0,220px)_220px_64px_64px] items-center gap-2'
  export function PersonRow(props: {
    person: Person
    variant: 'active' | 'inactive'
    onEdit: (p: Person) => void
    onToggleActive: (p: Person) => void
    onColorChange: (p: Person, color: string) => void
    onCreateAccount: (p: Person) => void
  }): JSX.Element
  // PersonFormModal
  export function PersonFormModal(props: {
    person: Person | null          // null = 關閉
    mode: 'edit' | 'create-account'
    onClose: () => void
    onSaved: () => Promise<void>   // 呼叫端重新載入帳號清單
  }): JSX.Element | null
  ```

- [ ] **Step 1: 寫 `PersonRow.tsx`**

```tsx
// src/components/settings/PersonRow.tsx
//
// 人員頁的一列。固定欄寬的 grid，每列同一個 template，所以「編輯」永遠在同一條
// 垂直線、「停用／啟用」也是。動作區用 opacity 隱藏（佔位不變），滑過與鍵盤
// 聚焦都會顯示。色塊點了直接選色，沒有還原。
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveEngineerColor, resolveUnitColor, readableTextColor } from '../../lib/colors'
import { roleLabel, type Person } from '../../lib/peopleRows'

export const PEOPLE_GRID = 'grid grid-cols-[28px_minmax(0,1fr)_minmax(0,220px)_220px_64px_64px] items-center gap-2'

const ACTION_BTN = 'text-xs px-2 py-1 rounded border transition-colors w-full'

interface Props {
  person: Person
  variant: 'active' | 'inactive'
  onEdit: (p: Person) => void
  onToggleActive: (p: Person) => void
  onColorChange: (p: Person, color: string) => void
  onCreateAccount: (p: Person) => void
}

export function PersonRow({ person, variant, onEdit, onToggleActive, onColorChange, onCreateAccount }: Props) {
  const { options } = useOptionsStore()
  const [draftColor, setDraftColor] = useState<string | null>(null)
  const first = person.memberships[0]
  const baseColor = first
    ? (first.engineer.color ?? resolveEngineerColor(person.name, first.unitValue, options))
    : '#94a3b8'
  const isSuperAdmin = person.account?.role === 'super_admin'
  const inactive = variant === 'inactive'

  return (
    <div className={`${PEOPLE_GRID} group px-3 py-1.5 rounded-lg hover:bg-slate-50`}>
      {/* 色塊 */}
      {first ? (
        <input
          type="color"
          aria-label={`${person.label} 的顏色`}
          className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
          value={draftColor ?? baseColor}
          onChange={e => setDraftColor(e.target.value)}
          onBlur={() => {
            if (draftColor && draftColor.toLowerCase() !== baseColor.toLowerCase()) onColorChange(person, draftColor)
            setDraftColor(null)
          }}
        />
      ) : <span className="w-6 h-6 inline-block" />}

      {/* 姓名 */}
      <div className="min-w-0">
        <span className={`text-sm truncate block ${inactive ? 'line-through text-gray-400' : 'text-gray-800'}`} title={person.name}>
          {person.label}
        </span>
        {!inactive && person.memberships.length > 0 && !person.rosterActive && (
          <span className="text-xs text-amber-600">名冊停用</span>
        )}
      </div>

      {/* 單位籤 */}
      <div className="flex flex-wrap gap-1 min-w-0">
        {person.memberships.map(m => {
          const bg = resolveUnitColor(m.unitValue, options)
          return (
            <span key={m.unitId} className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: bg, color: readableTextColor(bg) }}>
              {m.unitLabel}
            </span>
          )
        })}
      </div>

      {/* 帳號 */}
      <div className="min-w-0 text-xs">
        {person.account ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded font-medium ${
              !person.account.isActive ? 'bg-gray-100 text-gray-500'
                : person.account.role === 'super_admin' ? 'bg-purple-100 text-purple-700'
                : person.account.role === 'admin' ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'}`}>
              {roleLabel(person.account.role)}
            </span>
            {!person.account.isActive && <span className="text-red-500">已停用</span>}
            {person.account.lastLoginAt && (
              <span className="text-gray-400">上次登入 {new Date(person.account.lastLoginAt).toLocaleDateString('zh-TW')}</span>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => onCreateAccount(person)}
            className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 rounded text-gray-500 hover:bg-white hover:text-gray-700">
            <UserPlus size={12} />建立帳號
          </button>
        )}
      </div>

      {/* 動作：佔位不變，滑過或聚焦才顯示 */}
      {isSuperAdmin ? (<><span /><span /></>) : (
        <>
          <button type="button" onClick={() => onEdit(person)}
            className={`${ACTION_BTN} border-gray-300 hover:bg-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100`}>
            編輯
          </button>
          <button type="button" onClick={() => onToggleActive(person)}
            className={`${ACTION_BTN} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 ${
              inactive ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                       : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}>
            {inactive ? '啟用' : '停用'}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 寫 `PersonFormModal.tsx`**

```tsx
// src/components/settings/PersonFormModal.tsx
//
// 一個人一份表單：上半是名冊（姓名 label、顏色、單位歸屬、名冊啟用），下半是
// 帳號（建立或編輯）。置中視窗，不再在列內展開推擠。人員段與帳號段分別呼叫
// 既有 API，沒有交易；任一段失敗把訊息顯示在那一段。
import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveEngineerColor } from '../../lib/colors'
import { roleLabel, type Person } from '../../lib/peopleRows'
import { membershipTargets } from '../../lib/peopleActions'
import { useEscapeKey } from '../shared/useEscapeKey'
import { SegmentedControl } from '../shared/SegmentedControl'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'

type NewRole = 'user' | 'admin'
const INPUT = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface Props {
  person: Person | null
  mode: 'edit' | 'create-account'
  onClose: () => void
  onSaved: () => Promise<void>
}

export function PersonFormModal({ person, mode, onClose, onSaved }: Props) {
  const isOpen = person !== null
  useEscapeKey(isOpen, onClose)
  const { options, patchEngineers, setPersonUnits } = useOptionsStore()
  const activeUnits = options.testUnits.filter(u => u.isActive)
  const allUnitLabels = activeUnits.map(u => u.label)

  // ── 人員段 ──
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#94a3b8')
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [rosterActive, setRosterActive] = useState(true)
  const [rosterError, setRosterError] = useState('')

  // ── 帳號段 ──
  const [newRole, setNewRole] = useState<NewRole>('user')
  const [password, setPassword] = useState('')
  const [allowedUnits, setAllowedUnits] = useState<string[]>([])
  const [canLinkVtms, setCanLinkVtms] = useState(false)
  const [canViewVtmsProgress, setCanViewVtmsProgress] = useState(false)
  const [accountActive, setAccountActive] = useState(true)
  const [accountError, setAccountError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (!person) return
    const first = person.memberships[0]
    setLabel(person.label)
    setColor(first ? (first.engineer.color ?? resolveEngineerColor(person.name, first.unitValue, options)) : '#94a3b8')
    setUnitIds(person.memberships.map(m => m.unitId))
    setRosterActive(person.rosterActive)
    setRosterError('')
    const a = person.account
    setNewRole('user')
    setPassword('')
    setAllowedUnits(a?.allowedUnits ?? person.memberships.map(m => m.unitLabel))
    setCanLinkVtms(a?.canLinkVtms ?? false)
    setCanViewVtmsProgress(a?.canViewVtmsProgress ?? false)
    setAccountActive(a?.isActive ?? true)
    setAccountError('')
  }, [person, options])

  if (!person) return null
  const hasRoster = person.memberships.length > 0
  const account = person.account

  const saveRoster = async (): Promise<boolean> => {
    if (!hasRoster) return true
    setRosterError('')
    try {
      const patch: { label?: string; color?: string; isActive?: boolean } = {}
      if (label.trim() && label.trim() !== person.label) patch.label = label.trim()
      const first = person.memberships[0]
      const base = first.engineer.color ?? resolveEngineerColor(person.name, first.unitValue, options)
      if (color.toLowerCase() !== base.toLowerCase()) patch.color = color
      if (rosterActive !== person.rosterActive) patch.isActive = rosterActive
      if (Object.keys(patch).length > 0) await patchEngineers(membershipTargets(person), patch)
      await setPersonUnits(person.name, unitIds)
      return true
    } catch (e) {
      setRosterError(msgOf(e))
      return false
    }
  }

  const saveAccount = async (): Promise<boolean> => {
    setAccountError('')
    try {
      if (!account) {
        if (mode !== 'create-account' && !password) return true   // 編輯模式下沒填密碼 = 不建帳號
        if (password.length < 8) { setAccountError('密碼長度至少需要 8 個字元'); return false }
        await api.createUser({
          username: person.name,
          password,
          role: newRole,
          allowedUnits: newRole === 'admin' ? allowedUnits : [],
          linkedEngineer: newRole === 'user' ? person.name : '',
        })
        return true
      }
      if (password && password.length < 8) { setAccountError('新密碼長度至少需要 8 個字元'); return false }
      await api.updateUser(account.id, {
        password: password || undefined,
        allowedUnits: account.role === 'admin' ? allowedUnits : [],
        linkedEngineer: account.role === 'user' ? person.name : undefined,
        canLinkVtms, canViewVtmsProgress,
        ...(accountActive !== account.isActive ? { isActive: accountActive } : {}),
      })
      return true
    } catch (e) {
      setAccountError(msgOf(e))
      return false
    }
  }

  const handleSave = async () => {
    setSubmitting(true)
    try {
      const a = await saveRoster()
      const b = await saveAccount()
      if (a && b) { await onSaved(); onClose() }
      else await onSaved()   // 部分成功也要刷新畫面，錯誤留在對應段
    } finally { setSubmitting(false) }
  }

  const removeFromRoster = () => setConfirm({
    title: '刪除人員',
    message: `將 ${person.label} 從所有單位的名冊移除。有排程引用的單位會被後端擋下並保留。帳號不受影響。`,
    confirmLabel: '刪除人員',
    run: async () => {
      try { await setPersonUnits(person.name, []); await onSaved(); onClose() }
      catch (e) { setRosterError(msgOf(e)) }
    },
  })

  const deleteAccountPermanently = () => account && setConfirm({
    title: '永久刪除帳號',
    message: `即將永久刪除帳號 ${account.username}。此操作無法復原。名冊列不受影響。`,
    confirmLabel: '永久刪除',
    run: async () => {
      try { await api.deleteUserPermanent(account.id); await onSaved(); onClose() }
      catch (e) { setAccountError(msgOf(e)) }
    },
  })

  const toggleIn = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v]
  const section = (title: string, children: React.ReactNode) => (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 tracking-wide mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
  const showAllowedUnits = account ? account.role === 'admin' : newRole === 'admin'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{person.label}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="關閉">✕</button>
        </div>

        <div className="p-4 space-y-5">
          {hasRoster && section('名冊', <>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">顯示名稱（識別碼 {person.name} 不變）</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">顏色</label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">所屬單位</label>
              <div className="flex flex-wrap gap-2">
                {activeUnits.map(u => (
                  <label key={u.id} className={`text-xs px-2 py-1 rounded border cursor-pointer ${unitIds.includes(u.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}>
                    <input type="checkbox" className="sr-only" checked={unitIds.includes(u.id)} onChange={() => setUnitIds(l => toggleIn(l, u.id))} />
                    {u.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rosterActive} onChange={e => setRosterActive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              名冊啟用（可被排程指派）
            </label>
            {rosterError && <p className="text-xs text-red-600">{rosterError}</p>}
          </>)}

          {section(account ? '帳號' : '建立帳號', <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">帳號</label>
                <p className="text-sm px-2 py-1.5 bg-gray-50 border border-gray-200 rounded">{person.name}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">角色</label>
                {account ? (
                  <p className="text-sm px-2 py-1.5 bg-gray-50 border border-gray-200 rounded">{roleLabel(account.role)}</p>
                ) : (
                  <SegmentedControl<NewRole>
                    options={[{ value: 'user', label: '測試人員' }, { value: 'admin', label: '部級主管' }]}
                    value={newRole} onChange={setNewRole} size="md" ariaLabel="角色" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">{account ? '新密碼（留空表示不修改）' : '密碼（至少 8 個字元）'}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={INPUT} autoComplete="new-password" />
            </div>
            {showAllowedUnits && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">管轄單位<span className="ml-1 text-gray-400">（不選 = 全部）</span></label>
                <div className="flex flex-wrap gap-2">
                  {allUnitLabels.map(u => (
                    <label key={u} className={`text-xs px-2 py-1 rounded border cursor-pointer ${allowedUnits.includes(u) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}>
                      <input type="checkbox" className="sr-only" checked={allowedUnits.includes(u)} onChange={() => setAllowedUnits(l => toggleIn(l, u))} />
                      {u}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {account && (
              <>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600">VTMS 整合權限</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={canLinkVtms} onChange={e => setCanLinkVtms(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    可連結排程至 VTMS 測試計畫
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={canViewVtmsProgress} onChange={e => setCanViewVtmsProgress(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    可檢視 VTMS 測試進度統計
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={accountActive} onChange={e => setAccountActive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  帳號啟用（可登入）
                </label>
              </>
            )}
            {accountError && <p className="text-xs text-red-600">{accountError}</p>}
          </>)}

          {(hasRoster || (account && !account.isActive)) && (
            <div className="border-t pt-3 flex flex-wrap gap-2">
              {hasRoster && (
                <button type="button" onClick={removeFromRoster} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">
                  從名冊刪除此人
                </button>
              )}
              {account && !account.isActive && (
                <button type="button" onClick={deleteAccountPermanently} className="flex items-center gap-1 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                  <AlertTriangle size={12} />永久刪除帳號
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
          <button type="button" onClick={handleSave} disabled={submitting}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">
            {submitting ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={!!confirm}
        title={confirm?.title}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        danger
        onConfirm={() => { const c = confirm; setConfirm(null); void c?.run() }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
```

`React.ReactNode` 在本專案的 TSX 檔不需 import 即可用於型別位置（`ScheduleFormModal.tsx` 同樣用法）。

- [ ] **Step 3: 型別檢查**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS" | grep -v "PeopleManager.tsx" | wc -l`
Expected: `8`。若 `PersonRow.tsx` / `PersonFormModal.tsx` 有錯誤，逐條修到 0，不得改變 brief 描述的行為；在報告裡列出每一條。

Run: `cd /f/vsms/vsms-export && npx eslint src/components/settings/PersonRow.tsx src/components/settings/PersonFormModal.tsx`
Expected: 0 errors（`react-hooks/exhaustive-deps` warning 可接受，但要在報告說明原因）。

- [ ] **Step 4: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/settings/PersonRow.tsx src/components/settings/PersonFormModal.tsx && git commit -m "feat(people): PersonRow grid with aligned hover actions and a one-person PersonFormModal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 重寫 `PeopleManager.tsx`

**Files:**
- Modify（整檔重寫）: `src/components/settings/PeopleManager.tsx`

**Interfaces:**
- Consumes: `buildPeopleModel`、`Person`、`SafeUser`（Task 1）；`patchEngineers`、`addEngineer`（Task 2 與既有）；`deactivatePerson`、`activatePerson`、`membershipTargets`（Task 3）；`useUIStore().peopleInactiveOpen / setPeopleInactiveOpen`（Task 4）；`PersonRow`、`PEOPLE_GRID`、`PersonFormModal`（Task 5）；`api.getUsers/disableUser/enableUser`；`toast`；`DeleteConfirmDialog`。
- Produces: `export function PeopleManager(): JSX.Element`（`SettingsPage` 已引用，簽名不變）

- [ ] **Step 1: 整檔重寫**

```tsx
// src/components/settings/PeopleManager.tsx
//
// 「人員」分頁：一個名字就是一個人（peopleRows.ts）。這個檔案只負責分組與
// 區塊；一列的長相在 PersonRow，一人一份表單在 PersonFormModal。
//
// 使用者要求（2026-09-10）：同功能按鈕在同一條垂直線（PersonRow 的固定 grid）、
// 停用者另外擺放且預設摺疊、顏色不要還原鈕。
import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { toast } from '../../store/toastStore'
import { useOptionsStore } from '../../store/optionsStore'
import { useUIStore } from '../../store/uiStore'
import { buildPeopleModel, type Person, type SafeUser, type PersonGroup } from '../../lib/peopleRows'
import { deactivatePerson, activatePerson, membershipTargets } from '../../lib/peopleActions'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { PersonRow, PEOPLE_GRID } from './PersonRow'
import { PersonFormModal } from './PersonFormModal'

export function PeopleManager() {
  const { options, patchEngineers, addEngineer } = useOptionsStore()
  const { peopleInactiveOpen, setPeopleInactiveOpen } = useUIStore()
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ person: Person; mode: 'edit' | 'create-account' } | null>(null)
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null)

  const loadUsers = async () => {
    try { setUsers(await api.getUsers()) }
    catch { toast.error('載入帳號列表失敗') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadUsers() }, [])

  const model = useMemo(() => buildPeopleModel(options.testUnits, users), [options.testUnits, users])
  const inactiveCount = model.inactive.reduce((n, g) => n + g.people.length, 0)

  const deps = { patchEngineers, disableUser: api.disableUser, enableUser: api.enableUser }

  const handleToggleActive = (p: Person, currentlyInactive: boolean) => {
    if (currentlyInactive) {
      // 啟用是可逆且無害的動作，不確認
      void activatePerson(p, deps).then(r => { if (!r.ok) toast.error(r.message); return loadUsers() })
      return
    }
    const parts = [
      p.memberships.length > 0 ? `${p.label} 會從所有單位的名冊停用（不再能被排程指派）` : '',
      p.account?.isActive ? `帳號 ${p.account.username} 會被停用（無法登入）` : '',
    ].filter(Boolean)
    setConfirm({
      title: '停用人員',
      message: `${parts.join('；')}。之後可以在「已停用」區塊啟用。`,
      run: async () => {
        const r = await deactivatePerson(p, deps)
        if (!r.ok) toast.error(r.message)
        await loadUsers()
      },
    })
  }

  const handleColorChange = async (p: Person, color: string) => {
    try { await patchEngineers(membershipTargets(p), { color }) }
    catch (e) { toast.error(`顏色更新失敗：${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleAdd = async (unitId: string) => {
    const v = (newNames[unitId] ?? '').trim()
    if (!v) return
    setAddErrors(d => { const n = { ...d }; delete n[unitId]; return n })
    try { await addEngineer(unitId, v); setNewNames(n => ({ ...n, [unitId]: '' })) }
    catch (e) { setAddErrors(d => ({ ...d, [unitId]: e instanceof Error ? e.message : String(e) })) }
  }

  const rows = (people: Person[], variant: 'active' | 'inactive') => people.map(p => (
    <PersonRow key={p.name} person={p} variant={variant}
      onEdit={x => setForm({ person: x, mode: 'edit' })}
      onToggleActive={x => handleToggleActive(x, variant === 'inactive')}
      onColorChange={handleColorChange}
      onCreateAccount={x => setForm({ person: x, mode: 'create-account' })} />
  ))

  const header = (
    <div className={`${PEOPLE_GRID} px-3 text-xs text-gray-400 mb-1`}>
      <span /><span>姓名</span><span>單位</span><span>帳號</span><span /><span />
    </div>
  )

  const groupCard = (g: PersonGroup, variant: 'active' | 'inactive') => (
    <div key={g.unitId ?? 'unassigned'} className="border rounded-lg p-3">
      <p className="font-medium text-sm text-gray-600 mb-2">{g.unitLabel}<span className="ml-2 text-xs text-gray-400">{g.people.length} 人</span></p>
      <div className="space-y-0.5">{rows(g.people, variant)}</div>
      {variant === 'active' && g.unitId && (
        <div className="flex gap-2 mt-2">
          <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名（等於未來的帳號名稱）"
            value={newNames[g.unitId] ?? ''}
            onChange={e => setNewNames(n => ({ ...n, [g.unitId!]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd(g.unitId!) }} />
          <button type="button" onClick={() => handleAdd(g.unitId!)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
        </div>
      )}
      {g.unitId && addErrors[g.unitId] && <p className="text-xs text-red-500 mt-1">{addErrors[g.unitId]}</p>}
    </div>
  )

  if (loading) return <p className="text-sm text-gray-400">載入中...</p>

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-1">人員</h3>
      <p className="text-xs text-gray-400 mb-3">一個名字就是一個人：名冊名稱等於登入帳號。滑過一列會出現「編輯」與「停用」。</p>

      {header}
      <div className="space-y-4">
        {model.active.map(g => groupCard(g, 'active'))}
        {model.unassigned.length > 0 && groupCard({ unitId: null, unitLabel: '無單位帳號', people: model.unassigned }, 'active')}
      </div>

      <div className="mt-6 border-t pt-3">
        <button type="button" onClick={() => setPeopleInactiveOpen(!peopleInactiveOpen)}
          aria-expanded={peopleInactiveOpen}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800">
          {peopleInactiveOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          已停用（{inactiveCount}）
        </button>
        {peopleInactiveOpen && (
          inactiveCount === 0
            ? <p className="text-xs text-gray-400 mt-2">目前沒有停用的人員。</p>
            : <div className="space-y-4 mt-3">{model.inactive.map(g => groupCard(g, 'inactive'))}</div>
        )}
      </div>

      <PersonFormModal person={form?.person ?? null} mode={form?.mode ?? 'edit'}
        onClose={() => setForm(null)} onSaved={loadUsers} />

      <DeleteConfirmDialog
        isOpen={!!confirm}
        title={confirm?.title}
        message={confirm?.message ?? ''}
        confirmLabel="停用"
        danger={false}
        onConfirm={() => { const c = confirm; setConfirm(null); void c?.run() }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: 型別檢查、eslint、測試**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `8`（`PeopleManager.tsx` 的錯誤全部消失）

Run: `cd /f/vsms/vsms-export && npx eslint src/components/settings/PeopleManager.tsx`
Expected: 0 errors

Run: `cd /f/vsms/vsms-export && npx vitest run`
Expected: 全 PASS（216 − 舊 peopleRows 8 + 新 12 + 6 + 10 = 236）

Run: `cd /f/vsms/vsms-export && grep -rn "buildPeopleView\|OrphanAccount\|orphanAccounts" src`
Expected: 無輸出（舊模型已全部移除）

- [ ] **Step 3: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/settings/PeopleManager.tsx && git commit -m "feat(people): regroup the people page — aligned rows, hover actions, one form per person, collapsed inactive section

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 實機驗證（harness，不碰正式環境）

**Files:** 無變更（`_dev-*` 檔已存在且被 `.git/info/exclude` 排除）。

- [ ] **Step 1: 起 harness**

`preview_start` 開 `vsms-harness`（`F:\.claude\launch.json`，vite 5175），瀏覽 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin`，進「系統設定 → 人員」。`_dev-stub.ts` 的假帳號要涵蓋：一個 admin 帳號其 username 等於名冊某人（例如把 `ra_lead` 改成 `Will_Wang`）、一個 user 帳號同名於名冊、一個停用的帳號、一個只有帳號的 super_admin。改 stub 不需 commit。

- [ ] **Step 2: 量對齊**

用 `javascript_tool` 執行：

```js
(() => {
  const xs = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '編輯').map(b => Math.round(b.getBoundingClientRect().left))
  const ys = [...document.querySelectorAll('button')].filter(b => ['停用','啟用'].includes(b.textContent.trim())).map(b => Math.round(b.getBoundingClientRect().left))
  return { editLefts: [...new Set(xs)], toggleLefts: [...new Set(ys)], rows: xs.length }
})()
```

Expected：`editLefts` 與 `toggleLefts` 各只有**一個**值（所有列對齊）。用 `resize_window` 切 1024 寬再量一次，仍各只有一個值。

- [ ] **Step 3: 檢查行為**

1. 同名兩單位的人（Ericct）在兩個單位卡片各出現一次，籤顯示兩個單位；改一個的顏色，另一個的色塊同步。
2. admin 帳號（Will_Wang）對到名冊列，徽章顯示「部級主管」，「管理帳號」區塊已不存在。
3. 停用者不在啟用清單；底部「已停用（N）」預設摺疊，點開後看得到，重新整理仍記住展開狀態。
4. 滑過一列才出現「編輯」「停用」；Tab 鍵移到列內按鈕時也出現。
5. 「建立帳號」開表單：帳號欄唯讀等於姓名，角色只有「測試人員／部級主管」。
6. 列上「停用」出現確認對話框，文字同時提到名冊與帳號；確認後該人移到已停用區塊。
7. 沒有任何「還原」字樣：`document.body.innerText.includes('還原')` 為 false。
8. 375 寬：`document.documentElement.scrollWidth === clientWidth`。

截圖 1440 寬一張留存。驗完 `preview_stop`。

- [ ] **Step 4: 最後確認**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` → `8`
Run: `cd /f/vsms/vsms-export && npx vitest run` → 全 PASS

（本 task 無 commit。部署為使用者決定：`xcopy /E /I /Y dist dist.stable-<日期>` 後 `npx vite build`，純前端不重啟。）
