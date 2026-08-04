# VSMS 甘特圖可辨識性、類別統計模式與列表視圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓甘特圖在任何捲動位置都能辨識排程的測試人員與單位，讓工作類別可設定其統計計入方式，並讓管理介面能在甘特圖與列表間一鍵切換。

**Architecture:** 分四階段，風險由低到高：純前端版面調整 → 新增列表視圖 → 類別統計模式（動 schema 與後端）→ 顏色自訂（動 schema 與匯出格式）。顏色解析集中於新的 `src/lib/colors.ts`，統計模式判斷集中於 `src/lib/analytics.ts`，兩者都是純函式且先於使用它們的 UI 完成。每階段各自成 commit，可獨立 `git revert`。

**Tech Stack:** React 19 + TypeScript + Zustand + Tailwind、Express 5 + Prisma 7（MariaDB）、Vitest（前端 jsdom / 後端 node）、pm2。

## Global Constraints

- 規格文件：`docs/superpowers/specs/2026-08-03-vsms-gantt-readability-and-stats-design.md`
- 所有 schema 變更一律以 `npx prisma db execute` 手動下 additive `ALTER TABLE`，**絕不執行 `prisma migrate dev`**（此專案會要求 reset 資料庫）
- 新增的 DB 欄位一律 nullable 或帶 `DEFAULT`，使舊版程式碼能在新 schema 上正常執行
- `PUT /api/options` 是全刪重建（`server/src/routes/options.ts:47`）。任何新增的 options 欄位必須在 `server/src/types.ts`、GET 映射、PUT 寫入、前端 `optionsStore` 全部帶齊，否則使用者存一次設定就會清空該欄位
- 前端測試：`npm test`（vitest + jsdom）。後端測試：`npm run test:server`
- 建置：`npm run build`（`vite build` 產生 `dist/`，`tsc -p server/tsconfig.json` 產生 `server/dist/`）
- 前端變更只需 `npm run build`（`dist` 由磁碟即時服務）；後端變更需 `npm run build` 後 `pm2 restart vsms`
- 專案語言為繁體中文，程式碼註解沿用既有中文風格
- 現行分支：`feat/guest-role-and-uiux`
- `mysql` / `mysqldump` 不在 PATH 上，且 `DATABASE_URL` 中的密碼是 URL 編碼的。需要用到 mysql 用戶端時，先在同一個 shell 執行以下兩行（不要把密碼寫進指令參數，會出現在行程清單）：

```bash
export PATH="/c/Program Files/MySQL/MySQL Server 8.0/bin:$PATH"
export MYSQL_PWD="$(node -e 'const m=require("fs").readFileSync(".env","utf8").match(/mysql:\/\/root:([^@]*)@/);process.stdout.write(decodeURIComponent(m[1]))')"
```

之後即可用 `mysql -u root vsms -e "..."` 與 `mysqldump -u root vsms ...`（不加 `-p`）。

---

## Task 1: 建立還原點

實作開始前必須完成，否則沒有可退回的版本。工作區目前有未 commit 的修改，且 `server/dist` 的建置時間與這些原始碼一致——**線上執行的正是這份未進版控的程式碼**。

**Files:**
- Commit: 現有工作區全部變更
- Create: `dist.stable-20260803/`、`server/dist.stable-20260803/`、`backup-options-20260803.sql`

- [ ] **Step 1: 確認待提交的內容**

```bash
git status -s
```

預期看到 5 個 `M`（`openapi-integration.yaml`、`server/src/__tests__/workload.test.ts`、`server/src/lib/db.ts`、`server/src/lib/workload.ts`、`server/src/routes/integration.ts`）與 4 個 `??`（`.claude/launch.json`、`prisma/migrations/20260717020529_baseline_out_of_band_changes/`、`server/src/lib/engineerMatch.ts`、`server/src/__tests__/engineerMatch.test.ts`）。

- [ ] **Step 2: 確認測試在改動前是綠的**

```bash
npm run test:all
```

預期：全部 PASS。若此時已有失敗，先記錄下來——那是既有問題，不可歸咎於本計畫的變更。

- [ ] **Step 3: 提交現有工作區**

```bash
git add -A
git commit -m "chore: commit in-flight workload and integration work before gantt rework"
```

- [ ] **Step 4: 打上還原標籤**

```bash
git tag vsms-stable-20260803
git tag -l 'vsms-stable-*'
```

預期輸出：`vsms-stable-20260803`

- [ ] **Step 5: 快照建置產物**

```bash
cp -r dist dist.stable-20260803
cp -r server/dist server/dist.stable-20260803
du -sh dist.stable-20260803 server/dist.stable-20260803
```

預期：約 2.6M 與 174K。

- [ ] **Step 6: 備份受影響資料表**

```bash
export PATH="/c/Program Files/MySQL/MySQL Server 8.0/bin:$PATH"
export MYSQL_PWD="$(node -e 'const m=require("fs").readFileSync(".env","utf8").match(/mysql:\/\/root:([^@]*)@/);process.stdout.write(decodeURIComponent(m[1]))')"
mysqldump -u root vsms categories test_units engineers > backup-options-20260803.sql
```

- [ ] **Step 7: 把快照與備份排除於版控之外**

在 `.gitignore` 末尾加入：

```
dist.stable-*/
server/dist.stable-*/
backup-options-*.sql
```

- [ ] **Step 8: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore rollback snapshots and table backups"
```

**退版程序（測試期間遇到重大問題時執行）：**

```bash
rm -rf dist server/dist
cp -r dist.stable-20260803 dist
cp -r server/dist.stable-20260803 server/dist
pm2 restart vsms
```

資料庫不需退版：所有 schema 變更皆為 additive 且 nullable 或帶 DEFAULT，舊版程式在新 schema 上可正常執行。

---

# 階段一：左欄兩層資訊（純前端，不動資料庫）

## Task 2: 顏色解析模組

**Files:**
- Create: `src/lib/colors.ts`
- Test: `src/__tests__/colors.test.ts`

**Interfaces:**
- Consumes: `UNIT_COLORS`、`EXTRA_COLORS`（`src/constants.ts`）；`OptionsMap`（`src/types.ts`）
- Produces:
  - `readableTextColor(bgHex: string): string` — 回傳 `'#1e293b'` 或 `'#ffffff'`
  - `deriveEngineerColor(unitColor: string, index: number): string`
  - `resolveUnitColor(unitValue: string, options: OptionsMap): string`
  - `resolveEngineerColor(engineerValue: string, unitValue: string, options: OptionsMap): string`
  - `contrastRatio(hexA: string, hexB: string): number`

型別上 `TestUnitOption.color` 與 engineer 的 `color` 在 Task 11 才加入 schema，但本 Task 即以 optional 欄位讀取，因此 Task 11 不需回頭修改本檔。

- [ ] **Step 1: 加上 optional color 欄位型別**

修改 `src/types.ts`，將 `TestUnitOption` 區塊改為：

```ts
export interface EngineerOption extends Option {
  color?: string | null
}

export interface TestUnitOption extends Option {
  color?: string | null
  engineers: EngineerOption[]
}
```

- [ ] **Step 2: 寫失敗測試**

建立 `src/__tests__/colors.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  readableTextColor,
  deriveEngineerColor,
  resolveUnitColor,
  resolveEngineerColor,
  contrastRatio,
} from '../lib/colors'
import type { OptionsMap } from '../types'

function opts(over: Partial<OptionsMap> = {}): OptionsMap {
  return {
    categories: [],
    restDays: { weekends: true, specificDates: [] },
    devices: [],
    testUnits: [
      {
        id: 'u1', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0,
        engineers: [
          { id: 'e0', value: 'Eric',   label: 'Eric',   isActive: true, sortOrder: 0 },
          { id: 'e1', value: 'Darius', label: 'Darius', isActive: true, sortOrder: 1 },
        ],
      },
      {
        id: 'u2', value: 'RA', label: 'RA', isActive: true, sortOrder: 1,
        engineers: [
          { id: 'e2', value: 'Eric',   label: 'Eric',   isActive: true, sortOrder: 0 },
        ],
      },
    ],
    ...over,
  }
}

describe('readableTextColor', () => {
  it('亮橘底（RA 單位色）選深字', () => {
    expect(readableTextColor('#F5A623')).toBe('#1e293b')
  })

  it('近黑底選白字', () => {
    expect(readableTextColor('#111827')).toBe('#ffffff')
  })

  it('一律選對比較高的那一個', () => {
    for (const hex of ['#4A90D9', '#F472B6', '#9B59B6', '#86EFAC', '#ffffff', '#000000']) {
      const picked = readableTextColor(hex)
      const other = picked === '#ffffff' ? '#1e293b' : '#ffffff'
      expect(contrastRatio(hex, picked)).toBeGreaterThanOrEqual(contrastRatio(hex, other))
    }
  })
})

describe('deriveEngineerColor', () => {
  it('索引 0 與單位色完全相同', () => {
    expect(deriveEngineerColor('#4A90D9', 0).toLowerCase()).toBe('#4a90d9')
  })

  it('同單位不同索引產生相異顏色', () => {
    const colors = [0, 1, 2, 3].map(i => deriveEngineerColor('#4A90D9', i))
    expect(new Set(colors).size).toBe(4)
  })

  it('索引循環後不會超出色碼格式', () => {
    for (let i = 0; i < 20; i++) {
      expect(deriveEngineerColor('#4A90D9', i)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('resolveUnitColor', () => {
  it('未自訂時回退到內建單位色', () => {
    expect(resolveUnitColor('SIT-HW', opts()).toLowerCase()).toBe('#4a90d9')
  })

  it('自訂色優先於內建色', () => {
    const o = opts()
    o.testUnits[0].color = '#123456'
    expect(resolveUnitColor('SIT-HW', o)).toBe('#123456')
  })

  it('未知單位回退到 EXTRA_COLORS 而非崩潰', () => {
    expect(resolveUnitColor('NOPE', opts())).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('resolveEngineerColor', () => {
  it('未自訂時由所屬單位色衍生', () => {
    expect(resolveEngineerColor('Eric', 'SIT-HW', opts()).toLowerCase()).toBe('#4a90d9')
  })

  it('自訂色優先於衍生色', () => {
    const o = opts()
    o.testUnits[0].engineers[1].color = '#abcdef'
    expect(resolveEngineerColor('Darius', 'SIT-HW', o)).toBe('#abcdef')
  })

  it('同名工程師隸屬不同單位時，以 unitValue 配對取色', () => {
    const o = opts()
    o.testUnits[0].engineers[0].color = '#111111'
    o.testUnits[1].engineers[0].color = '#222222'
    expect(resolveEngineerColor('Eric', 'SIT-HW', o)).toBe('#111111')
    expect(resolveEngineerColor('Eric', 'RA', o)).toBe('#222222')
  })

  it('單位配對不到時退而以工程師名稱尋找所屬單位', () => {
    const o = opts()
    o.testUnits[0].engineers[1].color = '#abcdef'
    expect(resolveEngineerColor('Darius', '已刪除的單位', o)).toBe('#abcdef')
  })

  it('完全查無此人時回退到單位色而非崩潰', () => {
    expect(resolveEngineerColor('查無此人', 'SIT-HW', opts()).toLowerCase()).toBe('#4a90d9')
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

```bash
npx vitest run src/__tests__/colors.test.ts
```

預期：FAIL，`Failed to resolve import "../lib/colors"`。

- [ ] **Step 4: 實作 colors.ts**

建立 `src/lib/colors.ts`：

```ts
// src/lib/colors.ts
// 甘特圖的顏色解析：單位色決定 bar 外框，工程師色決定 bar 內裡與左欄人員徽章。
// 兩者皆可在設定頁自訂；未自訂時工程師色由所屬單位色衍生（僅調整明度、
// 不動色相與飽和度），因此同單位必為同色系——這是「預設一致」的來源。
import { UNIT_COLORS, EXTRA_COLORS } from '../constants'
import type { OptionsMap } from '../types'

// 同單位工程師的明度位移（百分點）。索引 0 刻意為 0，
// 使每個單位的第一位工程師與單位色完全相同。
const LIGHTNESS_OFFSETS = [0, 14, -12, 24, -20, 8, -6, 32]

// 夾限範圍：太亮會在白底上看不見，太暗則與深色文字難以區分
const MIN_LIGHTNESS = 24
const MAX_LIGHTNESS = 88

const TEXT_DARK = '#1e293b'
const TEXT_LIGHT = '#ffffff'

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** WCAG 相對亮度 */
function relativeLuminance(hex: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = toRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 依底色回傳可讀的文字色。取對比較高者而非用亮度門檻，
 * 因為門檻對中等明度的色（如 SIT-SW 的 #F472B6）判斷不可靠。
 */
export function readableTextColor(bgHex: string): string {
  return contrastRatio(bgHex, TEXT_DARK) >= contrastRatio(bgHex, TEXT_LIGHT)
    ? TEXT_DARK
    : TEXT_LIGHT
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = toRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100
  const lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lN - c / 2
  const seg = Math.floor(((h % 360) + 360) % 360 / 60)
  const rgb: [number, number, number] =
    seg === 0 ? [c, x, 0] :
    seg === 1 ? [x, c, 0] :
    seg === 2 ? [0, c, x] :
    seg === 3 ? [0, x, c] :
    seg === 4 ? [x, 0, c] :
                [c, 0, x]
  const hex = rgb
    .map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex}`
}

export function deriveEngineerColor(unitColor: string, index: number): string {
  const { h, s, l } = hexToHsl(unitColor)
  const offset = LIGHTNESS_OFFSETS[index % LIGHTNESS_OFFSETS.length]
  const nextL = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l + offset))
  return hslToHex(h, s, nextL)
}

export function resolveUnitColor(unitValue: string, options: OptionsMap): string {
  const unit = options.testUnits.find(u => u.value === unitValue)
  if (unit?.color) return unit.color
  if (UNIT_COLORS[unitValue]) return UNIT_COLORS[unitValue]
  // 與 constants.ts 的 getUnitColor 同規則：未內建的單位依其在清單中的順序取色
  const extras = options.testUnits.map(u => u.value).filter(v => !UNIT_COLORS[v])
  const idx = extras.indexOf(unitValue)
  return EXTRA_COLORS[(idx < 0 ? 0 : idx) % EXTRA_COLORS.length]
}

export function resolveEngineerColor(
  engineerValue: string,
  unitValue: string,
  options: OptionsMap,
): string {
  // Engineer.value 在 schema 上非唯一，同名工程師可隸屬不同單位，
  // 因此必須以 (unitValue, engineerValue) 配對查找；配對不到才退而求其次。
  const unit =
    options.testUnits.find(u => u.value === unitValue) ??
    options.testUnits.find(u => u.engineers.some(e => e.value === engineerValue))
  if (!unit) return resolveUnitColor(unitValue, options)

  const index = unit.engineers.findIndex(e => e.value === engineerValue)
  if (index < 0) return resolveUnitColor(unit.value, options)

  const engineer = unit.engineers[index]
  if (engineer.color) return engineer.color
  return deriveEngineerColor(resolveUnitColor(unit.value, options), index)
}
```

- [ ] **Step 5: 執行測試確認通過**

```bash
npx vitest run src/__tests__/colors.test.ts
```

預期：所有測試 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/colors.ts src/__tests__/colors.test.ts src/types.ts
git commit -m "feat: color resolution for unit and engineer with WCAG-aware text color"
```

---

## Task 3: 甘特圖左欄改為兩層資訊

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`（新增常數；改寫工程師視角左欄，現行 814–932 行）
- Test: `src/__tests__/pdn-display.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `resolveEngineerColor`、`readableTextColor`
- Produces: `pdnDisplay(projectName: string, leftWidth: number): string`（自 `GanttChart.tsx` export，供測試使用）

- [ ] **Step 1: 寫失敗測試**

建立 `src/__tests__/pdn-display.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { pdnDisplay, PDN_FULL_THRESHOLD } from '../components/schedule/GanttChart'

describe('pdnDisplay', () => {
  it('左欄夠寬時顯示完整 PDN Number', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', PDN_FULL_THRESHOLD))
      .toBe('PDN-250061 NCA-5550A-CK1')
  })

  it('左欄較窄時只顯示編號段', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', 260)).toBe('PDN-250061')
  })

  it('含中括號的機種名同樣被截去', () => {
    expect(pdnDisplay('PDN-210079 NCA-5220A-NZ1 [Nozomi]', 260)).toBe('PDN-210079')
  })

  it('不含空白的舊資料不被截成空字串', () => {
    expect(pdnDisplay('LegacyProjectName', 260)).toBe('LegacyProjectName')
  })

  it('空字串不崩潰', () => {
    expect(pdnDisplay('', 260)).toBe('')
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run src/__tests__/pdn-display.test.ts
```

預期：FAIL，`pdnDisplay is not a function` 或匯出不存在。

- [ ] **Step 3: 新增常數與 pdnDisplay**

在 `src/components/schedule/GanttChart.tsx` 的尺寸常數區塊（現行 23–30 行）之後加入：

```ts
// 左欄寬度達此值才顯示完整 PDN Number；未達則只顯示編號段（如 PDN-250061）。
// 實際資料最長達 33 字元（PDN-210079 NCA-5220A-NZ1 [Nozomi]），
// 預設 260px 塞不下人員徽章、PDN 與四顆操作按鈕。
export const PDN_FULL_THRESHOLD = 340

export function pdnDisplay(projectName: string, leftWidth: number): string {
  if (leftWidth >= PDN_FULL_THRESHOLD) return projectName
  // 不含空白的舊資料沒有「編號段」可取，整串保留交由 CSS 截斷
  return projectName.split(' ')[0] || projectName
}
```

- [ ] **Step 4: 加入 import**

將 `GanttChart.tsx` 第 7 行的 import 改為：

```ts
import { getUnitColor, STATUS_COLORS, OVERFLOW_COLOR } from '../../constants'
import { resolveEngineerColor, readableTextColor } from '../../lib/colors'
```

- [ ] **Step 5: 執行測試確認通過**

```bash
npx vitest run src/__tests__/pdn-display.test.ts
```

預期：所有測試 PASS。

- [ ] **Step 6: 改寫左欄列的版面**

將 `GanttChart.tsx` 工程師視角左欄的整個 `.map` 回傳內容（現行 819–931 行，自 `return (` 至對應的 `)` ）替換為：

```tsx
                    return (
                      <div key={s.id} className="relative border-b"
                        style={{ height: ROW_H, background: evenFill }}>

                        {/* 第一行：人員徽章 → PDN Number → 操作按鈕 */}
                        <div className="flex items-center gap-1.5 px-2 pt-[5px]">
                          <span
                            className="flex-shrink-0 h-5 px-[7px] rounded-[5px] text-xs font-bold flex items-center"
                            style={{ background: engColor, color: engTextColor }}
                            title={s.testEngineer ? engLabel(s.testEngineer) : '未指派測試人員'}>
                            {s.testEngineer ? engLabel(s.testEngineer) : '未指派'}
                          </span>
                          <span className="flex-1 min-w-0 text-xs font-semibold text-slate-800 truncate"
                            title={s.projectName}>
                            {pdnDisplay(s.projectName, leftWidth)}
                          </span>

                          <div className="flex-shrink-0 flex gap-[3px]">
                            {/* Admin 旗標（Admin/SA 限定） */}
                            {canWrite && (
                              <div className="relative">
                                <button
                                  type="button"
                                  title={s.adminFlag ? (s.adminFlagNote || 'Admin 旗標已標記') : '設定 Admin 旗標'}
                                  onClick={(e) => {
                                    if (flagPopover?.scheduleId === s.id && flagPopover.type === 'admin') {
                                      setFlagPopover(null)
                                    } else {
                                      setFlagPopover({ scheduleId: s.id, type: 'admin', anchorEl: e.currentTarget })
                                    }
                                  }}
                                  className={`w-[19px] h-[19px] flex items-center justify-center rounded-[5px] transition-colors duration-100
                                    ${s.adminFlag
                                      ? 'bg-orange-500 text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600'
                                      : 'bg-white text-gray-400 border border-gray-200 hover:text-orange-500 hover:bg-orange-50 hover:border-orange-300'
                                    }`}
                                >
                                  <ShieldCheck size={12} strokeWidth={2.2} />
                                </button>
                                {flagPopover?.scheduleId === s.id && flagPopover.type === 'admin' && (
                                  <FlagPopover
                                    flagged={s.adminFlag ?? false}
                                    note={s.adminFlagNote ?? ''}
                                    color="orange"
                                    anchorEl={flagPopover.anchorEl}
                                    onClose={closeFlagPopover}
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

                            {/* 使用者旗標（登入帳號皆可，guest 唯讀不可） */}
                            {role !== 'guest' && (
                              <div className="relative">
                                <button
                                  type="button"
                                  title={s.userFlag ? (s.userFlagNote || '旗標已標記') : '設定旗標'}
                                  onClick={(e) => {
                                    if (flagPopover?.scheduleId === s.id && flagPopover.type === 'user') {
                                      setFlagPopover(null)
                                    } else {
                                      setFlagPopover({ scheduleId: s.id, type: 'user', anchorEl: e.currentTarget })
                                    }
                                  }}
                                  className={`w-[19px] h-[19px] flex items-center justify-center rounded-[5px] transition-colors duration-100
                                    ${s.userFlag
                                      ? 'bg-blue-500 text-white shadow-sm ring-1 ring-blue-600/30 hover:bg-blue-600'
                                      : 'bg-white text-gray-400 border border-gray-200 hover:text-blue-500 hover:bg-blue-50 hover:border-blue-300'
                                    }`}
                                >
                                  <Bookmark size={12} strokeWidth={2.2} fill={s.userFlag ? 'currentColor' : 'none'} />
                                </button>
                                {flagPopover?.scheduleId === s.id && flagPopover.type === 'user' && (
                                  <FlagPopover
                                    flagged={s.userFlag ?? false}
                                    note={s.userFlagNote ?? ''}
                                    color="blue"
                                    anchorEl={flagPopover.anchorEl}
                                    onClose={closeFlagPopover}
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
                            )}

                            {/* 編輯按鈕：user 只能編輯指派給自己的排程；guest 不可編輯 */}
                            {(canWrite || (role === 'user' && s.testEngineer === linkedEngineer)) && (
                              <button type="button" title="編輯" onClick={() => setEditTarget(s)}
                                className="w-[19px] h-[19px] flex items-center justify-center rounded-[5px] bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors duration-100">
                                <Pencil size={11} strokeWidth={2.5} />
                              </button>
                            )}
                            {canWrite && (
                              <button type="button" title="刪除" onClick={() => setDeleteTarget(s)}
                                className="w-[19px] h-[19px] flex items-center justify-center rounded-[5px] bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors duration-100">
                                <Trash2 size={11} strokeWidth={2.5} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 第二行：狀態籤 → 工作內容。狀態籤在此，故此行必須恆常渲染 */}
                        <div className="flex items-center gap-1.5 px-2 pt-[2px]">
                          <span
                            className="flex-shrink-0 h-[17px] px-1.5 rounded text-[11px] font-bold flex items-center"
                            style={{ background: statusColor.bg, color: statusColor.text, letterSpacing: '0.02em' }}>
                            {STATUS_GLYPH[status]} {status}
                          </span>
                          <span className="min-w-0 text-[11px] text-slate-500 truncate"
                            title={s.taskDescription}>
                            {s.taskDescription}
                          </span>
                        </div>
                      </div>
                    )
```

- [ ] **Step 7: 補上該列所需的區域變數**

在同一個 `.map` 回呼內、`return` 之前（現行 816–818 行的 `const status` / `const statusColor` / `const evenFill` 之後）加入：

```tsx
                    const engColor = s.testEngineer
                      ? resolveEngineerColor(s.testEngineer, s.testUnit, options)
                      : '#e2e8f0'
                    const engTextColor = s.testEngineer ? readableTextColor(engColor) : '#64748b'
```

- [ ] **Step 8: 型別檢查與全部測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 9: 目視驗證**

```bash
npm run build
```

於瀏覽器開啟 VSMS 主畫面，確認：左欄每列第一行為人員徽章加 PDN 編號段、第二行為狀態籤加工作內容；把左欄拖曳至 340px 以上時 PDN 顯示完整字串；工作內容為空的排程仍看得到狀態籤。

- [ ] **Step 10: Commit**

```bash
git add src/components/schedule/GanttChart.tsx src/__tests__/pdn-display.test.ts
git commit -m "feat: two-line gantt left column with always-visible engineer badge"
```

---

# 階段二：甘特／列表一鍵切換（純前端，不動資料庫）

## Task 4: 排程列表元件

**Files:**
- Create: `src/components/schedule/ScheduleListView.tsx`
- Modify: `src/components/schedule/GanttChart.tsx`（匯出 `applyFilter` 供列表重用不需要——列表接收已篩選好的陣列）

**Interfaces:**
- Consumes: `Schedule`、`Role`（`src/types.ts`）；`computeStatus`（`src/lib/status.ts`）；`STATUS_COLORS`（`src/constants.ts`）；Task 2 的 `resolveUnitColor`、`readableTextColor`
- Produces: `ScheduleListView` 預設匯出，props 如下

```ts
interface ScheduleListViewProps {
  schedules: Schedule[]          // 已套用篩選與排序
  role: Role | null
  linkedEngineer: string
  engLabel: (value: string) => string
  options: OptionsMap
  onEdit: (s: Schedule) => void
  onDelete: (s: Schedule) => void
}
```

旗標操作不放入列表——`FlagPopover` 需要 `anchorEl` 定位且與甘特圖左欄共用同一份 popover 狀態，在表格中重複一套會讓狀態管理複雜化而收益有限。列表的操作欄只提供編輯與刪除，權限規則與甘特圖一致。

- [ ] **Step 1: 建立元件**

建立 `src/components/schedule/ScheduleListView.tsx`：

```tsx
// src/components/schedule/ScheduleListView.tsx
// 管理介面的列表視圖。欄位沿用匯出 dashboard 的十欄再加一欄操作，
// 資料來源與甘特圖相同（皆為 GanttChart 篩選排序後的結果），因此切換視圖
// 不會改變當下的篩選條件。
import { useRef, useState, useCallback, useEffect } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { computeStatus } from '../../lib/status'
import { STATUS_COLORS } from '../../constants'
import { resolveUnitColor, readableTextColor } from '../../lib/colors'
import type { Schedule, Role, OptionsMap } from '../../types'

const LIST_ROW_H = 36
const VIRTUAL_BUFFER = 10

interface Props {
  schedules: Schedule[]
  role: Role | null
  linkedEngineer: string
  engLabel: (value: string) => string
  options: OptionsMap
  onEdit: (s: Schedule) => void
  onDelete: (s: Schedule) => void
}

const HEADERS = [
  '狀態', '工作類別', 'PDN Number', '工作內容', '測試單位', '測試人員',
  '起始日', '完成日', '需求人員', '測試報告', '操作',
]

export default function ScheduleListView({
  schedules, role, linkedEngineer, engLabel, options, onEdit, onDelete,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 60 })
  const canWrite = role === 'super_admin' || role === 'admin'

  const updateVisibleRange = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const start = Math.max(0, Math.floor(el.scrollTop / LIST_ROW_H) - VIRTUAL_BUFFER)
    const end = Math.ceil((el.scrollTop + el.clientHeight) / LIST_ROW_H) + VIRTUAL_BUFFER
    setVisibleRange(prev => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    updateVisibleRange()
    window.addEventListener('resize', updateVisibleRange)
    return () => window.removeEventListener('resize', updateVisibleRange)
  }, [updateVisibleRange])

  if (schedules.length === 0) {
    return <div className="p-10 text-center text-gray-400 text-sm">無符合篩選條件的排程</div>
  }

  const visible = schedules.slice(visibleRange.start, visibleRange.end)
  const padTop = visibleRange.start * LIST_ROW_H
  const padBottom = Math.max(0, (schedules.length - visibleRange.end) * LIST_ROW_H)

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto" onScroll={updateVisibleRange}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100">
            {HEADERS.map(h => (
              <th key={h} className="text-left font-semibold text-slate-600 px-2 py-2 border-b border-slate-300 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={HEADERS.length} /></tr>}
          {visible.map((s, sliceIdx) => {
            const i = visibleRange.start + sliceIdx
            const status = computeStatus(s)
            const statusColor = STATUS_COLORS[status]
            const unitColor = resolveUnitColor(s.testUnit, options)
            const canEdit = canWrite || (role === 'user' && s.testEngineer === linkedEngineer)
            return (
              <tr key={s.id}
                className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                style={{ height: LIST_ROW_H }}>
                <td className="px-2 whitespace-nowrap">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                    style={{ background: statusColor.bg, color: statusColor.text }}>
                    {status}
                  </span>
                </td>
                <td className="px-2 whitespace-nowrap text-slate-600">{s.category}</td>
                <td className="px-2 max-w-[220px] truncate font-semibold text-slate-800" title={s.projectName}>
                  {s.projectName}
                </td>
                <td className="px-2 max-w-[280px] truncate text-slate-600" title={s.taskDescription}>
                  {s.taskDescription || '—'}
                </td>
                <td className="px-2 whitespace-nowrap">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                    style={{ background: unitColor, color: readableTextColor(unitColor) }}>
                    {s.testUnit}
                  </span>
                </td>
                <td className="px-2 whitespace-nowrap text-slate-700">{engLabel(s.testEngineer)}</td>
                <td className="px-2 whitespace-nowrap text-slate-600">{s.startDate}</td>
                <td className="px-2 whitespace-nowrap text-slate-600">{s.endDate}</td>
                <td className="px-2 max-w-[160px] truncate text-slate-600" title={s.requiredPersonnel}>
                  {s.requiredPersonnel || '—'}
                </td>
                <td className="px-2 max-w-[180px] truncate text-slate-600" title={s.testReport}>
                  {s.testReport || '—'}
                </td>
                <td className="px-2 whitespace-nowrap">
                  <div className="flex gap-1">
                    {canEdit && (
                      <button type="button" title="編輯" onClick={() => onEdit(s)}
                        className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Pencil size={12} strokeWidth={2.5} />
                      </button>
                    )}
                    {canWrite && (
                      <button type="button" title="刪除" onClick={() => onDelete(s)}
                        className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100">
                        <Trash2 size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {padBottom > 0 && <tr style={{ height: padBottom }}><td colSpan={HEADERS.length} /></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 型別檢查**

```bash
npx tsc -p tsconfig.app.json --noEmit
```

預期：無錯誤。

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/ScheduleListView.tsx
git commit -m "feat: schedule list view component with sticky header and row virtualization"
```

---

## Task 5: 甘特／列表切換整合

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`（新增 `viewMode` 狀態、控制列切換鈕、條件渲染）

**Interfaces:**
- Consumes: Task 4 的 `ScheduleListView`

- [ ] **Step 1: 新增 viewMode 狀態**

在 `GanttChart.tsx` 的 `groupBy` 狀態宣告（現行 205–207 行）之後加入：

```tsx
  // 視圖模式。與 filterSort 同層，因此切換時篩選與排序完全不受影響
  const [viewMode, setViewMode] = useState<'gantt' | 'list'>(() =>
    (localStorage.getItem('vsms-main-view-mode') as 'gantt' | 'list') ?? 'gantt'
  )
```

- [ ] **Step 2: 加入 import**

```tsx
import ScheduleListView from './ScheduleListView'
```

- [ ] **Step 3: 在控制列加入切換鈕**

將控制列標題區塊（現行 511–520 行的 `<div className="flex items-center gap-2">` 至其結束標籤）替換為：

```tsx
        <div className="flex items-center gap-2">
          {/* 視圖切換：甘特圖 / 列表 */}
          <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium"
            onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setViewMode('gantt'); localStorage.setItem('vsms-main-view-mode', 'gantt') }}
              className={`px-2.5 py-1 transition-colors ${
                viewMode === 'gantt' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              甘特圖
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('list'); localStorage.setItem('vsms-main-view-mode', 'list') }}
              className={`px-2.5 py-1 transition-colors border-l border-slate-300 ${
                viewMode === 'list' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              列表
            </button>
          </div>
          {hasGanttRange && viewMode === 'gantt' && (
            <span className="flex items-center gap-1 text-xs text-blue-600
                             bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
              <CalendarRange size={11} />
              {filterSort.ganttStart || '最早'} ～ {filterSort.ganttEnd || '最晚'}
            </span>
          )}
        </div>
```

- [ ] **Step 4: 列表模式下隱藏分組鈕與收合鈕**

將分組切換按鈕的外層 `<div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium" onClick={e => e.stopPropagation()}>`（現行 523–553 行，內含「按工程師」「按設備」兩顆）整段以條件包住：

```tsx
          {viewMode === 'gantt' && (
            <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium"
              onClick={e => e.stopPropagation()}>
              {/* ...原本的「按工程師」「按設備」兩顆按鈕，內容不變... */}
            </div>
          )}
```

並將收合提示（現行 565–567 行）改為：

```tsx
          {viewMode === 'gantt' && (
            <span className="text-slate-400 text-sm">
              {ganttCollapsed ? '▼ 展開' : '▲ 收合'}
            </span>
          )}
```

- [ ] **Step 5: 條件渲染主體**

將甘特圖主體的外層條件（現行 572 行）由：

```tsx
      {!ganttCollapsed && (
        groupBy === 'device' ? (
```

改為：

```tsx
      {viewMode === 'list' ? (
        <ScheduleListView
          schedules={filtered}
          role={role}
          linkedEngineer={linkedEngineer}
          engLabel={engLabel}
          options={options}
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
        />
      ) : !ganttCollapsed && (
        groupBy === 'device' ? (
```

- [ ] **Step 6: 讓控制列在列表模式下不觸發收合**

將控制列外層 `<div ... onClick={onToggleGantt}>`（現行 505–510 行）的 `onClick` 改為：

```tsx
        onClick={viewMode === 'gantt' ? onToggleGantt : undefined}
```

並將其 `className` 中的 `cursor-pointer` 改為條件式：

```tsx
        className={`flex-shrink-0 flex items-center justify-between px-4 py-2
                   bg-slate-50 border-b hover:bg-slate-100 transition-colors duration-150 select-none
                   ${viewMode === 'gantt' ? 'cursor-pointer' : ''}`}
```

- [ ] **Step 7: 型別檢查與測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 8: 目視驗證**

```bash
npm run build
```

確認：切到列表後篩選條件仍生效（先在甘特圖設一個測試單位篩選，再切列表，筆數應一致）；重新整理頁面後仍停在列表模式；列表模式下「按工程師／按設備」與收合提示消失、全螢幕鈕仍在；點編輯可開啟編輯彈窗。

- [ ] **Step 9: Commit**

```bash
git add src/components/schedule/GanttChart.tsx
git commit -m "feat: one-click gantt/list toggle sharing filter and sort state"
```

---

# 階段三：類別統計模式（動 schema 與後端）

## Task 6: Category.statsMode schema 與 options round-trip

**Files:**
- Modify: `prisma/schema.prisma`、`server/src/types.ts`、`server/src/routes/options.ts`、`src/types.ts`、`src/store/optionsStore.ts`、`src/constants.ts`
- Test: `server/src/__tests__/optionsRoundTrip.test.ts`

**Interfaces:**
- Produces:
  - `type CategoryStatsMode = 'counted' | 'workload_only' | 'excluded'`（前後端各自定義於 `src/types.ts` 與 `server/src/types.ts`）
  - `interface CategoryOption extends Option { statsMode: CategoryStatsMode }`
  - `OptionsMap.categories` 型別由 `Option[]` 改為 `CategoryOption[]`

- [ ] **Step 1: 下 additive ALTER**

`prisma db execute` 的連線字串取自 `prisma.config.ts`（不需也不接受 `--url`），且**整份腳本會當成單一指令送出**，因此一次只能下一條 SQL。

```bash
echo "ALTER TABLE categories ADD COLUMN statsMode VARCHAR(20) NOT NULL DEFAULT 'counted';" | npx prisma db execute --stdin
```

預期輸出：`Script executed successfully.`

- [ ] **Step 2: 確認欄位已建立**

`prisma db execute` 不回傳查詢結果，改用 mysql 用戶端驗證（連線設定見 Global Constraints）。

```bash
mysql -u root vsms -e "DESCRIBE categories;"
```

預期：出現 `statsMode` 欄位，型別 `varchar(20)`、`Null` 為 `NO`、`Default` 為 `counted`。

```bash
mysql -u root vsms -e "SELECT value, statsMode FROM categories ORDER BY sortOrder;"
```

預期：所有既有類別的 `statsMode` 皆為 `counted`。

- [ ] **Step 3: 同步 schema.prisma**

將 `prisma/schema.prisma` 的 `Category` model 改為：

```prisma
model Category {
  id        String  @id @default(uuid())
  value     String  @db.VarChar(100) @unique
  label     String  @db.VarChar(100)
  isActive  Boolean @default(true)
  sortOrder Int
  statsMode String  @db.VarChar(20) @default("counted")

  @@map("categories")
}
```

- [ ] **Step 4: 更新後端型別**

在 `server/src/types.ts` 的 `Option` 之後加入：

```ts
/** 工作類別在統計中的計入方式。'workload_only' 不計專案數但仍計人力負載。 */
export type CategoryStatsMode = 'counted' | 'workload_only' | 'excluded'

export interface CategoryOption extends Option {
  statsMode: CategoryStatsMode
}
```

並將 `OptionsMap` 改為：

```ts
export interface OptionsMap {
  categories: CategoryOption[]
  testUnits: TestUnitOption[]
  restDays: RestDaysConfig
  devices: Option[]
}
```

- [ ] **Step 5: 更新前端型別**

在 `src/types.ts` 的 `Option` 之後加入相同定義：

```ts
/** 工作類別在統計中的計入方式。'workload_only' 不計專案數但仍計人力負載。 */
export type CategoryStatsMode = 'counted' | 'workload_only' | 'excluded'

export interface CategoryOption extends Option {
  statsMode: CategoryStatsMode
}
```

並將 `OptionsMap.categories` 的型別由 `Option[]` 改為 `CategoryOption[]`。

- [ ] **Step 6: 寫失敗測試**

建立 `server/src/__tests__/optionsRoundTrip.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { OptionsMap, CategoryStatsMode } from '../types.js'

// PUT /api/options 是全刪重建，任何未被映射帶過去的欄位都會被靜默重設為預設值。
// 這兩個純函式把「GET 的映射」與「PUT 的映射」抽出來，讓不變式可被測試守住。
import { toCategoryResponse, toCategoryCreateData } from '../routes/optionsMapping.js'

describe('categories options round-trip', () => {
  it('GET 映射帶出 statsMode', () => {
    const row = {
      id: 'c1', value: '出國', label: '出國', isActive: true, sortOrder: 3,
      statsMode: 'workload_only',
    }
    expect(toCategoryResponse(row)).toEqual({
      id: 'c1', value: '出國', label: '出國', isActive: true, sortOrder: 3,
      statsMode: 'workload_only',
    })
  })

  it('PUT 映射寫回 statsMode', () => {
    const input: OptionsMap['categories'][number] = {
      id: 'c1', value: '出國', label: '出國', isActive: true, sortOrder: 3,
      statsMode: 'excluded' as CategoryStatsMode,
    }
    expect(toCategoryCreateData(input).statsMode).toBe('excluded')
  })

  it('PUT 映射遇到缺漏或非法的 statsMode 時退回 counted 而非寫入垃圾值', () => {
    const input = {
      id: 'c1', value: 'NPI', label: 'NPI', isActive: true, sortOrder: 0,
    } as OptionsMap['categories'][number]
    expect(toCategoryCreateData(input).statsMode).toBe('counted')

    const bogus = { ...input, statsMode: 'nonsense' as CategoryStatsMode }
    expect(toCategoryCreateData(bogus).statsMode).toBe('counted')
  })
})
```

- [ ] **Step 7: 執行測試確認失敗**

```bash
npm run test:server -- optionsRoundTrip
```

預期：FAIL，找不到 `../routes/optionsMapping.js`。

- [ ] **Step 8: 建立映射模組**

建立 `server/src/routes/optionsMapping.ts`：

```ts
// server/src/routes/optionsMapping.ts
// PUT /api/options 是全刪重建：任何未被映射帶過去的欄位，
// 都會在使用者存下一次設定時被靜默重設。映射抽在此處以便測試守住此不變式。
import type { CategoryOption, CategoryStatsMode } from '../types.js'

const VALID_STATS_MODES: readonly CategoryStatsMode[] = ['counted', 'workload_only', 'excluded']

function normalizeStatsMode(value: unknown): CategoryStatsMode {
  return VALID_STATS_MODES.includes(value as CategoryStatsMode)
    ? (value as CategoryStatsMode)
    : 'counted'
}

interface CategoryRow {
  id: string
  value: string
  label: string
  isActive: boolean
  sortOrder: number
  statsMode: string
}

export function toCategoryResponse(row: CategoryRow): CategoryOption {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    statsMode: normalizeStatsMode(row.statsMode),
  }
}

export function toCategoryCreateData(c: CategoryOption) {
  return {
    id: c.id,
    value: c.value,
    label: c.label,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    statsMode: normalizeStatsMode(c.statsMode),
  }
}
```

- [ ] **Step 9: 執行測試確認通過**

```bash
npm run test:server -- optionsRoundTrip
```

預期：所有測試 PASS。

- [ ] **Step 10: 在 options 路由套用映射**

修改 `server/src/routes/options.ts`。加入 import：

```ts
import { toCategoryResponse, toCategoryCreateData } from './optionsMapping.js'
```

將 GET 中的 categories 映射（現行 25–27 行）改為：

```ts
    categories: categories.map(toCategoryResponse),
```

將 PUT 中的 `createMany` 資料（現行 60–63 行）改為：

```ts
        data: body.categories.map(toCategoryCreateData),
```

- [ ] **Step 11: 前端 addCategory 帶上預設值**

修改 `src/store/optionsStore.ts`。將 import 加上型別：

```ts
import type { OptionsMap, Option, CategoryOption, TestUnitOption, RestDaysConfig } from '../types'
```

在 `OptionsState` 介面加入：

```ts
  setCategoryStatsMode: (id: string, statsMode: CategoryStatsMode) => Promise<void>
```

（並於 import 加入 `CategoryStatsMode`。）

將 `addCategory` 的 `newCat` 改為：

```ts
    const newCat: CategoryOption = {
      id: uuidv4(), value, label: value, isActive: true, sortOrder: cats.length,
      statsMode: 'counted',
    }
```

並在 `deleteCategory` 之後加入新的 action：

```ts
  setCategoryStatsMode: async (id, statsMode) => {
    const next = {
      ...get().options,
      categories: get().options.categories.map((c) => c.id === id ? { ...c, statsMode } : c),
    }
    await persistOptions(next)
    set({ options: next })
  },
```

- [ ] **Step 12: 修正 DEFAULT_OPTIONS 型別**

檢查 `src/constants.ts` 的 `DEFAULT_OPTIONS`：其 `categories` 陣列的每個元素需補上 `statsMode: 'counted'`。若 `DEFAULT_OPTIONS.categories` 為空陣列則不需修改。

```bash
grep -n "DEFAULT_OPTIONS" -A 20 src/constants.ts
```

- [ ] **Step 13: 型別檢查與全部測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p server/tsconfig.json --noEmit
npm run test:all
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 14: Commit**

```bash
git add prisma/schema.prisma server/src/types.ts server/src/routes/options.ts server/src/routes/optionsMapping.ts server/src/__tests__/optionsRoundTrip.test.ts src/types.ts src/store/optionsStore.ts src/constants.ts
git commit -m "feat: add Category.statsMode with round-trip-safe options mapping"
```

---

## Task 7: 類別統計模式設定 UI

**Files:**
- Modify: `src/components/settings/CategoryManager.tsx`

- [ ] **Step 1: 加入下拉選單**

修改 `src/components/settings/CategoryManager.tsx`。將 store 解構（第 6 行）改為：

```tsx
  const { options, addCategory, updateCategory, toggleCategory, deleteCategory, setCategoryStatsMode } = useOptionsStore()
```

在檔案頂端 import 之後加入：

```tsx
import type { CategoryStatsMode } from '../../types'

const STATS_MODE_LABELS: { value: CategoryStatsMode; label: string }[] = [
  { value: 'counted',       label: '正常計入' },
  { value: 'workload_only', label: '不計專案數（保留負載）' },
  { value: 'excluded',      label: '完全排除' },
]
```

將顯示模式的分支（現行 43–55 行的 `<>...</>`）改為：

```tsx
              <>
                <span className={`flex-1 text-sm ${!c.isActive ? "line-through text-gray-400" : ""}`}>
                  {c.label}
                </span>
                <select
                  className="text-xs border rounded px-1.5 py-1 text-gray-600 bg-white"
                  value={c.statsMode ?? 'counted'}
                  title="此類別在統計分析中的計入方式"
                  onChange={e => setCategoryStatsMode(c.id, e.target.value as CategoryStatsMode)}
                >
                  {STATS_MODE_LABELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => { setEditId(c.id); setEditValue(c.label) }}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50">編輯</button>
                <button type="button" onClick={() => toggleCategory(c.id, !c.isActive)}
                  className={`text-xs px-2 py-1 rounded ${c.isActive ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                  {c.isActive ? "停用" : "啟用"}
                </button>
                <button type="button" onClick={() => setDeletingId(c.id)}
                  className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">刪除</button>
              </>
```

- [ ] **Step 2: 加入說明文字**

在標題 `<h3>` 之後加入：

```tsx
      <p className="text-xs text-gray-400 mb-3">
        「不計專案數」的類別仍佔用人力負載（例如出國）；「完全排除」則兩者皆不計。
        兩種模式都不影響甘特圖與列表的顯示。
      </p>
```

- [ ] **Step 3: 型別檢查**

```bash
npx tsc -p tsconfig.app.json --noEmit
```

預期：無錯誤。

- [ ] **Step 4: 目視驗證**

```bash
npm run build
pm2 restart vsms
```

進入設定頁，將某個類別改為「不計專案數（保留負載）」，重新整理頁面後確認設定被保留。接著隨意編輯另一個類別的名稱，再次重新整理，確認剛才的 statsMode **沒有**被重設——這是 Task 6 round-trip 映射要守住的行為。

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/CategoryManager.tsx
git commit -m "feat: category stats mode selector in settings"
```

---

## Task 8: 前端統計套用

**Files:**
- Modify: `src/lib/analytics.ts`、`src/components/analytics/AnalyticsPage.tsx`
- Test: `src/__tests__/analytics.test.ts`（擴充既有檔案）

**Interfaces:**
- Consumes: Task 6 的 `CategoryOption`、`CategoryStatsMode`
- Produces: `splitByStatsMode(schedules: Schedule[], categories: CategoryOption[]): { stats: Schedule[]; workload: Schedule[] }`

- [ ] **Step 1: 寫失敗測試**

在 `src/__tests__/analytics.test.ts` 末尾加入：

```ts
import { splitByStatsMode } from '../lib/analytics'
import type { CategoryOption, Schedule } from '../types'

function cat(value: string, statsMode: CategoryOption['statsMode']): CategoryOption {
  return { id: value, value, label: value, isActive: true, sortOrder: 0, statsMode }
}

function sch(category: string): Schedule {
  return {
    id: category, category, projectName: 'P', taskDescription: '', testUnit: 'RA',
    testEngineer: 'Alice', timeResource: 5, startDate: '2026/07/06', endDate: '2026/07/10',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '', createdBy: '', updatedBy: '',
    createdAt: '', updatedAt: '', adminFlag: false, adminFlagNote: '', userFlag: false,
    userFlagNote: '', device: '',
  }
}

describe('splitByStatsMode', () => {
  const categories = [
    cat('NPI', 'counted'),
    cat('出國', 'workload_only'),
    cat('教育訓練', 'excluded'),
  ]

  it('counted 同時進入統計與負載', () => {
    const r = splitByStatsMode([sch('NPI')], categories)
    expect(r.stats.map(s => s.category)).toEqual(['NPI'])
    expect(r.workload.map(s => s.category)).toEqual(['NPI'])
  })

  it('workload_only 不進統計但進負載', () => {
    const r = splitByStatsMode([sch('出國')], categories)
    expect(r.stats).toHaveLength(0)
    expect(r.workload.map(s => s.category)).toEqual(['出國'])
  })

  it('excluded 兩者皆不進', () => {
    const r = splitByStatsMode([sch('教育訓練')], categories)
    expect(r.stats).toHaveLength(0)
    expect(r.workload).toHaveLength(0)
  })

  it('類別已被刪除的排程視為 counted，寧可多算也不無聲漏掉', () => {
    const r = splitByStatsMode([sch('已刪除的類別')], categories)
    expect(r.stats).toHaveLength(1)
    expect(r.workload).toHaveLength(1)
  })

  it('空類別清單不崩潰，全部視為 counted', () => {
    const r = splitByStatsMode([sch('NPI'), sch('出國')], [])
    expect(r.stats).toHaveLength(2)
    expect(r.workload).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run src/__tests__/analytics.test.ts
```

預期：FAIL，`splitByStatsMode` 未匯出。

- [ ] **Step 3: 實作 splitByStatsMode**

在 `src/lib/analytics.ts` 的 import 加上型別：

```ts
import type { Schedule, RestDaysConfig, CategoryOption } from '../types'
```

並在檔案末尾加入：

```ts
/**
 * 依工作類別的 statsMode 把排程分成「計入專案統計」與「計入人力負載」兩份。
 * 判斷集中於此，避免散落到各分析元件而彼此不一致。
 * 類別在清單中查無對應時（類別被刪除後遺留的舊排程）一律視為 counted。
 */
export function splitByStatsMode(
  schedules: Schedule[],
  categories: CategoryOption[],
): { stats: Schedule[]; workload: Schedule[] } {
  const modeOf = new Map(categories.map(c => [c.value, c.statsMode ?? 'counted']))
  const stats: Schedule[] = []
  const workload: Schedule[] = []
  for (const s of schedules) {
    const mode = modeOf.get(s.category) ?? 'counted'
    if (mode === 'excluded') continue
    workload.push(s)
    if (mode === 'counted') stats.push(s)
  }
  return { stats, workload }
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run src/__tests__/analytics.test.ts
```

預期：所有測試 PASS。

- [ ] **Step 5: 在 AnalyticsPage 分派兩份陣列**

修改 `src/components/analytics/AnalyticsPage.tsx`。將 import 加上：

```tsx
import { splitByStatsMode } from '../../lib/analytics'
```

在 `filtered` 的 `useMemo`（現行 139–145 行）之後加入：

```tsx
  // 依類別的 statsMode 分流：統計類元件吃 stats，負載元件吃 workload
  const { stats: statsSchedules, workload: workloadSchedules } = useMemo(
    () => splitByStatsMode(filtered, options.categories),
    [filtered, options.categories],
  )
  const excludedCount = filtered.length - statsSchedules.length
```

- [ ] **Step 6: 換掉各元件的資料來源**

將 JSX 中的 `schedules={filtered}` 依下表替換：

| 元件 | 新的 prop |
|---|---|
| `KpiSection` | `schedules={statsSchedules}` |
| `TrendSection` | `schedules={statsSchedules}` |
| `LoadSection` | `schedules={workloadSchedules}` |
| `RiskList` | `schedules={statsSchedules}` |
| `UnitComparison` | `schedules={statsSchedules}` |
| `DelayAnalysis` | `schedules={statsSchedules}` |

- [ ] **Step 7: 加入排除筆數提示**

在篩選列的重置按鈕之後（現行 169 行 `)}` 之後、`</div>` 之前）加入：

```tsx
          {excludedCount > 0 && (
            <span className="text-xs text-gray-500">
              另有 {excludedCount} 筆因類別設定未計入專案統計
            </span>
          )}
```

- [ ] **Step 8: 型別檢查與測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 9: Commit**

```bash
git add src/lib/analytics.ts src/components/analytics/AnalyticsPage.tsx src/__tests__/analytics.test.ts
git commit -m "feat: apply category stats mode to analytics page"
```

---

## Task 9: 後端負載分析同步排除

**Files:**
- Modify: `server/src/lib/workload.ts`、`server/src/routes/integration.ts`
- Test: `server/src/__tests__/workload.test.ts`（擴充既有檔案）

**Interfaces:**
- Consumes: Task 6 的 `CategoryStatsMode`
- Produces: `analyzeWorkload` 的 `opts` 新增 optional 欄位 `statsModes?: Record<string, CategoryStatsMode>`

`CATEGORY_ADJUSTMENT` 維持現狀，不在本 Task 變更。

- [ ] **Step 1: 寫失敗測試**

在 `server/src/__tests__/workload.test.ts` 末尾加入：

```ts
describe('類別統計模式對負載分析的影響', () => {
  const statsModes = {
    Regression: 'counted' as const,
    出國: 'workload_only' as const,
    教育訓練: 'excluded' as const,
  }

  it('excluded 的排程既不計 scheduleCount 也不累計強度', () => {
    const result = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: '教育訓練' })],
      statsModes,
    })
    expect(result.engineers).toHaveLength(0)
  })

  it('workload_only 不計 scheduleCount 但仍累計強度', () => {
    const result = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: '出國' })],
      statsModes,
    })
    expect(result.engineers).toHaveLength(1)
    expect(result.engineers[0].scheduleCount).toBe(0)
    expect(result.engineers[0].baseScore).toBeGreaterThan(0)
  })

  it('counted 的排程行為不變', () => {
    const result = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: 'Regression' })],
      statsModes,
    })
    expect(result.engineers[0].scheduleCount).toBe(1)
    expect(result.engineers[0].baseScore).toBeGreaterThan(0)
  })

  it('未提供 statsModes 時全部視為 counted，維持既有行為', () => {
    const result = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: '出國' }), sched({ category: '教育訓練' })],
    })
    expect(result.engineers[0].scheduleCount).toBe(2)
  })

  it('被排除的排程會在 limitations 留下說明', () => {
    const result = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: '出國' }), sched({ category: 'Regression' })],
      statsModes,
    })
    expect(result.engineers[0].limitations.some(l => l.includes('出國'))).toBe(true)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npm run test:server -- workload
```

預期：FAIL，`statsModes` 不是合法的 opts 欄位（型別錯誤）或斷言不符。

- [ ] **Step 3: 加入型別與參數**

修改 `server/src/lib/workload.ts`。在檔案頂端的 import 區加入：

```ts
import type { CategoryStatsMode } from '../types.js'
```

將 `analyzeWorkload` 的簽名（現行 74–79 行）改為：

```ts
export function analyzeWorkload(opts: {
  month: string // 'YYYY-MM'
  schedules: WorkloadScheduleInput[]
  holidays?: string[] // ISO 例假日（非週末），來自 CalendarConfig
  overtime?: Record<string, number> // 工程師 → 當月加班時數
  // 工作類別 → 統計模式。未提供或查無對應的類別一律視為 counted，
  // 因此舊呼叫端的行為完全不變。
  statsModes?: Record<string, CategoryStatsMode>
}): WorkloadResult {
  const { month, schedules, overtime } = opts
  const holidays = new Set(opts.holidays ?? [])
  const statsModes = opts.statsModes ?? {}
```

- [ ] **Step 4: 在主迴圈套用**

將主迴圈開頭（現行 96–107 行）改為：

```ts
  for (const s of schedules) {
    const start = toIso(s.startDate)
    const end = toIso(s.endDate)
    if (end < monthStart || start > monthEnd || end < start) continue // 與目標月無重疊

    const statsMode = statsModes[s.category] ?? 'counted'
    if (statsMode === 'excluded') continue // 此類別既不計筆數也不佔產能

    let acc = byEngineer.get(s.testEngineer)
    if (!acc) {
      acc = { raw: new Map(), units: new Set(), scheduleCount: 0, limitations: [] }
      byEngineer.set(s.testEngineer, acc)
    }
    if (statsMode === 'counted') {
      acc.scheduleCount++
    } else {
      // workload_only：佔用產能但不是專案，於此註明以免呼叫端誤判筆數
      acc.limitations.push(`類別「${s.category}」設定為不計專案數，其排程未計入 scheduleCount`)
    }
    if (s.testUnit) acc.units.add(s.testUnit)
```

- [ ] **Step 5: 執行測試確認通過**

```bash
npm run test:server -- workload
```

預期：所有測試 PASS，且既有測試未受影響。

- [ ] **Step 6: 讓路由帶入 statsModes**

修改 `server/src/routes/integration.ts`。在 `analyzeWorkload` 呼叫（現行 171–176 行）之前加入：

```ts
  const categories = await prisma.category.findMany();
  const statsModes = Object.fromEntries(
    categories.map(c => [c.value, c.statsMode as CategoryStatsMode]),
  );
```

並將呼叫改為：

```ts
  const result = analyzeWorkload({
    month,
    schedules: schedules.filter(s => s.testEngineer),
    holidays,
    overtime,
    statsModes,
  });
```

同時在該檔 import 區加入：

```ts
import type { CategoryStatsMode } from '../types.js';
```

- [ ] **Step 7: 型別檢查與全部測試**

```bash
npx tsc -p server/tsconfig.json --noEmit
npm run test:all
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 8: 建置與重啟**

```bash
npm run build
pm2 restart vsms
```

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/workload.ts server/src/routes/integration.ts server/src/__tests__/workload.test.ts
git commit -m "feat: honor category stats mode in backend workload analysis"
```

---

# 階段四：雙色 bar 與可自訂顏色（動 schema 與匯出格式）

## Task 10: 顏色欄位 schema 與 options round-trip

**Files:**
- Modify: `prisma/schema.prisma`、`server/src/types.ts`、`server/src/routes/optionsMapping.ts`、`server/src/routes/options.ts`、`src/store/optionsStore.ts`
- Test: `server/src/__tests__/optionsRoundTrip.test.ts`（擴充）

**Interfaces:**
- Produces: `toTestUnitResponse`、`toTestUnitCreateData`、`toEngineerCreateData`（`server/src/routes/optionsMapping.ts`）

- [ ] **Step 1: 下 additive ALTER**

整份腳本會當成單一指令送出，因此兩條 ALTER 必須分兩次執行。

```bash
echo "ALTER TABLE test_units ADD COLUMN color VARCHAR(7) NULL;" | npx prisma db execute --stdin
```

```bash
echo "ALTER TABLE engineers ADD COLUMN color VARCHAR(7) NULL;" | npx prisma db execute --stdin
```

兩次皆預期輸出：`Script executed successfully.`

- [ ] **Step 2: 確認欄位已建立**

```bash
mysql -u root vsms -e "SELECT value, color FROM test_units ORDER BY sortOrder; SELECT value, color FROM engineers ORDER BY sortOrder LIMIT 5;"
```

預期：兩張表的 `color` 皆為 `NULL`。

- [ ] **Step 3: 同步 schema.prisma**

在 `prisma/schema.prisma` 的 `TestUnit` 加入 `color String? @db.VarChar(7)`，`Engineer` 同樣加入 `color String? @db.VarChar(7)`：

```prisma
model TestUnit {
  id        String     @id @default(uuid())
  value     String     @db.VarChar(100) @unique
  label     String     @db.VarChar(100)
  isActive  Boolean    @default(true)
  sortOrder Int
  color     String?    @db.VarChar(7)
  engineers Engineer[]

  @@map("test_units")
}

model Engineer {
  id         String   @id @default(uuid())
  value      String   @db.VarChar(100)
  label      String   @db.VarChar(100)
  isActive   Boolean  @default(true)
  sortOrder  Int
  color      String?  @db.VarChar(7)
  testUnit   TestUnit @relation(fields: [testUnitId], references: [id], onDelete: Cascade)
  testUnitId String

  @@map("engineers")
}
```

- [ ] **Step 4: 更新後端型別**

修改 `server/src/types.ts`：

```ts
export interface EngineerOption extends Option {
  color?: string | null
}

export interface TestUnitOption extends Option {
  color?: string | null
  engineers: EngineerOption[]
}
```

- [ ] **Step 5: 寫失敗測試**

在 `server/src/__tests__/optionsRoundTrip.test.ts` 末尾加入：

```ts
import { toTestUnitResponse, toTestUnitCreateData, toEngineerCreateData } from '../routes/optionsMapping.js'

describe('test unit and engineer color round-trip', () => {
  it('GET 映射帶出單位與工程師的 color', () => {
    const row = {
      id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, color: '#123456',
      engineers: [
        { id: 'e1', value: 'Willie', label: 'Willie', isActive: true, sortOrder: 0, color: '#abcdef' },
      ],
    }
    const out = toTestUnitResponse(row)
    expect(out.color).toBe('#123456')
    expect(out.engineers[0].color).toBe('#abcdef')
  })

  it('PUT 映射寫回 color', () => {
    const unit = {
      id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, color: '#123456',
      engineers: [],
    }
    expect(toTestUnitCreateData(unit).color).toBe('#123456')
    expect(toEngineerCreateData({
      id: 'e1', value: 'Willie', label: 'Willie', isActive: true, sortOrder: 0, color: '#abcdef',
    }).color).toBe('#abcdef')
  })

  it('未自訂顏色時寫入 null 而非 undefined', () => {
    const unit = { id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, engineers: [] }
    expect(toTestUnitCreateData(unit).color).toBeNull()
  })

  it('非法色碼一律落回 null，避免寫入垃圾值', () => {
    const unit = {
      id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1,
      color: 'red', engineers: [],
    }
    expect(toTestUnitCreateData(unit).color).toBeNull()
  })
})
```

- [ ] **Step 6: 執行測試確認失敗**

```bash
npm run test:server -- optionsRoundTrip
```

預期：FAIL，`toTestUnitResponse` 等未匯出。

- [ ] **Step 7: 補上映射函式**

在 `server/src/routes/optionsMapping.ts` 末尾加入：

```ts
import type { EngineerOption, TestUnitOption } from '../types.js'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** 只接受 #RRGGBB；其餘一律視為未自訂，避免把垃圾值寫進資料庫 */
function normalizeColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null
}

interface EngineerRow {
  id: string
  value: string
  label: string
  isActive: boolean
  sortOrder: number
  color: string | null
}

interface TestUnitRow extends Omit<EngineerRow, 'color'> {
  color: string | null
  engineers: EngineerRow[]
}

export function toEngineerResponse(row: EngineerRow): EngineerOption {
  return {
    id: row.id, value: row.value, label: row.label,
    isActive: row.isActive, sortOrder: row.sortOrder,
    color: normalizeColor(row.color),
  }
}

export function toTestUnitResponse(row: TestUnitRow): TestUnitOption {
  return {
    id: row.id, value: row.value, label: row.label,
    isActive: row.isActive, sortOrder: row.sortOrder,
    color: normalizeColor(row.color),
    engineers: row.engineers.map(toEngineerResponse),
  }
}

export function toEngineerCreateData(e: EngineerOption) {
  return {
    id: e.id, value: e.value, label: e.label,
    isActive: e.isActive, sortOrder: e.sortOrder,
    color: normalizeColor(e.color),
  }
}

export function toTestUnitCreateData(u: TestUnitOption) {
  return {
    id: u.id, value: u.value, label: u.label,
    isActive: u.isActive, sortOrder: u.sortOrder,
    color: normalizeColor(u.color),
  }
}
```

- [ ] **Step 8: 執行測試確認通過**

```bash
npm run test:server -- optionsRoundTrip
```

預期：所有測試 PASS。

- [ ] **Step 9: 在 options 路由套用**

修改 `server/src/routes/options.ts`。將 import 擴充為：

```ts
import {
  toCategoryResponse, toCategoryCreateData,
  toTestUnitResponse, toTestUnitCreateData, toEngineerCreateData,
} from './optionsMapping.js'
```

將 GET 中的 testUnits 映射（現行 28–33 行）改為：

```ts
    testUnits: testUnits.map(toTestUnitResponse),
```

將 PUT 中建立 testUnit 的迴圈（現行 68–81 行）改為：

```ts
    for (const unit of body.testUnits) {
      await tx.testUnit.create({
        data: {
          ...toTestUnitCreateData(unit),
          engineers: { create: unit.engineers.map(toEngineerCreateData) },
        },
      })
    }
```

- [ ] **Step 10: 前端 store 加入顏色 action**

修改 `src/store/optionsStore.ts`。在 `OptionsState` 介面加入：

```ts
  setTestUnitColor: (id: string, color: string | null) => Promise<void>
  setEngineerColor: (unitId: string, engId: string, color: string | null) => Promise<void>
```

並在 `removeEngineer` 之後加入實作：

```ts
  setTestUnitColor: async (id, color) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, color } : u),
    }
    await persistOptions(next)
    set({ options: next })
  },

  setEngineerColor: async (unitId, engId, color) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => {
        if (u.id !== unitId) return u
        return { ...u, engineers: u.engineers.map((e) => e.id === engId ? { ...e, color } : e) }
      }),
    }
    await persistOptions(next)
    set({ options: next })
  },
```

- [ ] **Step 11: 型別檢查與全部測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p server/tsconfig.json --noEmit
npm run test:all
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma server/src/types.ts server/src/routes/optionsMapping.ts server/src/routes/options.ts server/src/__tests__/optionsRoundTrip.test.ts src/store/optionsStore.ts
git commit -m "feat: add nullable color columns for test units and engineers"
```

---

## Task 11: 顏色設定 UI

**Files:**
- Modify: `src/components/settings/TestUnitManager.tsx`、`src/components/settings/EngineerManager.tsx`

- [ ] **Step 1: TestUnitManager 加入取色器**

修改 `src/components/settings/TestUnitManager.tsx`。將 store 解構（第 6 行）改為：

```tsx
  const { options, addTestUnit, updateTestUnit, toggleTestUnit, deleteTestUnit, setTestUnitColor } = useOptionsStore()
```

加入 import：

```tsx
import { resolveUnitColor } from '../../lib/colors'
```

在顯示模式分支的 `<span className={...}>{u.label}...</span>` 之前插入：

```tsx
                <input
                  type="color"
                  className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5"
                  title="自訂單位色（甘特圖 bar 外框）"
                  value={u.color ?? resolveUnitColor(u.value, options)}
                  onChange={e => setTestUnitColor(u.id, e.target.value)}
                />
                {u.color && (
                  <button type="button" onClick={() => setTestUnitColor(u.id, null)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-500">還原</button>
                )}
```

- [ ] **Step 2: EngineerManager 加入取色器**

修改 `src/components/settings/EngineerManager.tsx`。將 store 解構（第 5 行）改為：

```tsx
  const { options, addEngineer, updateEngineer, removeEngineer, setEngineerColor } = useOptionsStore()
```

加入 import：

```tsx
import { resolveEngineerColor } from '../../lib/colors'
```

在顯示模式分支的 `<span className="flex-1 text-sm">{eng.label}</span>` 之前插入：

```tsx
                      <input
                        type="color"
                        className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
                        title="自訂人員色（甘特圖 bar 內裡與左欄徽章）"
                        value={eng.color ?? resolveEngineerColor(eng.value, unit.value, options)}
                        onChange={e => setEngineerColor(unit.id, eng.id, e.target.value)}
                      />
                      {eng.color && (
                        <button type="button" onClick={() => setEngineerColor(unit.id, eng.id, null)}
                          className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50 text-gray-500">還原</button>
                      )}
```

- [ ] **Step 3: 加入說明文字**

在 `EngineerManager` 的 `<h3>` 之後加入：

```tsx
      <p className="text-xs text-gray-400 mb-3">
        人員色預設由所屬單位色衍生，因此同單位為同色系。按「還原」即可回到預設。
      </p>
```

- [ ] **Step 4: 型別檢查**

```bash
npx tsc -p tsconfig.app.json --noEmit
```

預期：無錯誤。

- [ ] **Step 5: 目視驗證**

```bash
npm run build
pm2 restart vsms
```

進入設定頁改一位工程師的顏色，重新整理確認保留；按「還原」後確認回到衍生色且「還原」鈕消失；再編輯另一位工程師的姓名並重新整理，確認先前設定的顏色**沒有**被重設。

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/TestUnitManager.tsx src/components/settings/EngineerManager.tsx
git commit -m "feat: color pickers for test units and engineers in settings"
```

---

## Task 12: 甘特圖雙色 bar

**Files:**
- Create: `src/components/schedule/GanttBar.tsx`
- Modify: `src/components/schedule/GanttChart.tsx`（工程師視角 bar 區、設備視角 bar 區、圖例）

**Interfaces:**
- Produces: `GanttBar` 預設匯出

```ts
interface GanttBarProps {
  barX: number
  barW: number
  barY: number
  unitColor: string
  engColor: string
  overflowStartX: number | null  // null 表示無溢出
  label: string | null           // null 表示不顯示人名（工程師視角）
  clipId: string
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}
```

bar 的幾何（內縮 1px、溢出層內縮 3px、高度 20/16、圓角 4/3）只在此元件出現一次。兩個視角的 bar 因此不可能長得不一樣。

- [ ] **Step 1: 建立 GanttBar 元件**

建立 `src/components/schedule/GanttBar.tsx`：

```tsx
// src/components/schedule/GanttBar.tsx
// 甘特圖的單根 bar：外框編碼測試單位、內裡編碼工程師。
// 工程師視角與設備視角共用此元件，幾何計算只寫一次以免兩者走樣。
import type React from 'react'
import { OVERFLOW_COLOR } from '../../constants'
import { readableTextColor } from '../../lib/colors'

const BAR_H = 22
const STROKE_W = 2
const OVERFLOW_INSET = 3

interface Props {
  barX: number
  barW: number
  barY: number
  unitColor: string
  engColor: string
  /** 溢出段的起始 x；null 表示未溢出 */
  overflowStartX: number | null
  /** 顯示於 bar 上的人名；null 表示不顯示 */
  label: string | null
  clipId: string
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export default function GanttBar({
  barX, barW, barY, unitColor, engColor, overflowStartX, label, clipId,
  onMouseEnter, onMouseLeave,
}: Props) {
  const innerW = Math.max(barW - STROKE_W, 4)
  return (
    <>
      {/* 一整根帶框的 bar。描邊置中於邊界，故內縮 1px 使總高仍為 BAR_H。 */}
      <rect
        x={barX + STROKE_W / 2} y={barY + STROKE_W / 2}
        width={innerW} height={BAR_H - STROKE_W}
        fill={engColor} stroke={unitColor} strokeWidth={STROKE_W} rx={4}
        style={{ cursor: 'pointer', opacity: 0.92 }}
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />

      {/* 溢出段疊在框內且不描邊，外框才會保持連續。
          pointerEvents none 讓 hover 事件交由底下的外框處理。 */}
      {overflowStartX !== null && (
        <rect
          x={overflowStartX}
          y={barY + OVERFLOW_INSET}
          width={Math.max(barX + barW - overflowStartX - OVERFLOW_INSET, OVERFLOW_INSET)}
          height={BAR_H - OVERFLOW_INSET * 2}
          rx={3} fill={OVERFLOW_COLOR}
          style={{ pointerEvents: 'none' }} />
      )}

      {label !== null && barW > 24 && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x={barX + 4} y={barY} width={barW - 8} height={BAR_H} />
            </clipPath>
          </defs>
          <text x={barX + 6} y={barY + 15} fontSize={12}
            fill={readableTextColor(engColor)} fontWeight="600"
            clipPath={`url(#${clipId})`}
            style={{ pointerEvents: 'none' }}>
            {label}
          </text>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 1b: 改寫工程師視角的 bar**

將 `GanttChart.tsx` 工程師視角 bar 的 `.map` 回傳內容（現行 965–1009 行，自 `return (` 至 `)`）替換為：

```tsx
                      <g key={s.id}>
                        <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={evenFillAlpha} />
                        <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#e2e8f0" strokeWidth={1} />
                        <GanttBar
                          barX={barX} barW={barW} barY={barY}
                          unitColor={unitColor} engColor={engColor}
                          overflowStartX={hasOverflow ? barX + workDayOffset * PX_PER_DAY : null}
                          label={null}
                          clipId={`bc-${s.id}`}
                          onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                          onMouseLeave={() => setTooltip(null)} />
                      </g>
```

工程師視角傳 `label={null}`：左欄徽章已具名，bar 上再放人名屬冗餘。

- [ ] **Step 2: 補上該列所需的顏色變數**

在同一個 `.map` 回呼內、`return` 之前（現行 957 行的 `const color = getUnitColor(...)` 處），將該行替換為：

```tsx
                    const unitColor = resolveUnitColor(s.testUnit, options)
                    const engColor  = s.testEngineer
                      ? resolveEngineerColor(s.testEngineer, s.testUnit, options)
                      : unitColor
```

- [ ] **Step 3: 更新 import**

將 `GanttChart.tsx` 第 7–8 行改為：

```ts
import { STATUS_COLORS, OVERFLOW_COLOR } from '../../constants'
import { resolveUnitColor, resolveEngineerColor, readableTextColor } from '../../lib/colors'
import GanttBar from './GanttBar'
```

`getUnitColor` 不再被引用。若 `OVERFLOW_COLOR` 在移除舊 bar 繪製後也不再被 `GanttChart.tsx` 引用（圖例仍會用到），依實際情況保留或移除。

- [ ] **Step 4: 改寫設備視角的 bar**

將設備視角 bar 的 `.map` 回傳內容（現行 684–718 行，自 `return (` 至 `)`）替換為：

```tsx
                              <g key={s.id}>
                                {/* 設備視角的左欄是設備名稱，bar 上的人名是此視角唯一的人員線索，
                                    因此傳入 label（工程師視角已由左欄徽章提供，故傳 null）。 */}
                                <GanttBar
                                  barX={barX} barW={barW} barY={barY}
                                  unitColor={unitColor} engColor={engColor}
                                  overflowStartX={hasOverflow ? overflowX : null}
                                  label={engLabel(s.testEngineer)}
                                  clipId={`bc-dev-${s.id}`}
                                  onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                                  onMouseLeave={() => setTooltip(null)} />
                              </g>
```

- [ ] **Step 5: 補上設備視角的顏色變數**

將設備視角的 `const color = getUnitColor(s.testUnit, allUnits)`（現行 679 行）替換為：

```tsx
                            const unitColor = resolveUnitColor(s.testUnit, options)
                            const engColor  = s.testEngineer
                              ? resolveEngineerColor(s.testEngineer, s.testUnit, options)
                              : unitColor
```

- [ ] **Step 6: 更新圖例為外框樣式**

將圖例區塊（現行 488–502 行）改為：

```tsx
      <div className="flex-shrink-0 flex flex-wrap gap-4 px-4 py-2.5 border-b bg-slate-50">
        {options.testUnits.filter(u => u.isActive).map(u => (
          <span key={u.id} className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
            <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0 bg-transparent"
              style={{ border: `2px solid ${resolveUnitColor(u.value, options)}` }} />
            {u.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
          <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0"
            style={{ background: OVERFLOW_COLOR }} />
          超出時間資源
        </span>
        <span className="text-xs text-gray-500 self-center">
          外框為測試單位，內裡為測試人員
        </span>
      </div>
```

- [ ] **Step 7: 移除已不再使用的 allUnits**

確認 `const allUnits = options.testUnits.map(u => u.value)`（現行 328 行）是否仍有引用：

```bash
grep -n "allUnits" src/components/schedule/GanttChart.tsx
```

若已無其他引用，刪除該行。

- [ ] **Step 8: 型別檢查與測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 9: 目視驗證**

```bash
npm run build
```

確認：bar 有可見的單位色外框；未自訂顏色的工程師其 bar 內外同色（看起來與改版前一致）；在設定頁替某位工程師設一個明顯不同的顏色後，該人的 bar 內裡變色而外框不變；溢出的 bar 外框從頭到尾連續、綠色段落在框內；工程師視角的 bar 上沒有文字，設備視角仍有；滑過 bar 仍會出現 tooltip。

- [ ] **Step 10: Commit**

```bash
git add src/components/schedule/GanttChart.tsx
git commit -m "feat: two-tone gantt bars with unit stroke and engineer fill"
```

---

## Task 13: 匯出 dashboard 同步顏色

**Files:**
- Modify: `src/dashboard/script.ts`、`src/dashboard/template.ts`

`generateDashboardHTML` 已將整份 `options` 序列化為 `OPTIONS` 全域變數（`template.ts:57`），因此顏色欄位會自動隨匯出帶出，不需另建顏色表——只需讓 dashboard 端的 `getColor` 改讀 `OPTIONS`。

- [ ] **Step 1: 改寫 dashboard 的顏色函式**

修改 `src/dashboard/script.ts`，將 `getColor`（現行 25–29 行）替換為：

```js
  /* 顏色解析：與主系統 src/lib/colors.ts 同規則。
     OPTIONS 由匯出時整份序列化帶入，故自訂色會一併帶出。 */
  var LIGHTNESS_OFFSETS = [0, 14, -12, 24, -20, 8, -6, 32];

  function hexToHsl(hex) {
    var h = hex.replace('#','');
    var r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b), l = (max+min)/2;
    if (max === min) return { h:0, s:0, l:l*100 };
    var d = max-min;
    var s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    var hh;
    if (max === r) hh = ((g-b)/d + (g<b ? 6 : 0))/6;
    else if (max === g) hh = ((b-r)/d + 2)/6;
    else hh = ((r-g)/d + 4)/6;
    return { h: hh*360, s: s*100, l: l*100 };
  }

  function hslToHex(h, s, l) {
    var sN = s/100, lN = l/100;
    var c = (1-Math.abs(2*lN-1))*sN;
    var x = c*(1-Math.abs(((h/60)%2)-1));
    var m = lN - c/2;
    var seg = Math.floor((((h%360)+360)%360)/60);
    var rgb = seg===0?[c,x,0]:seg===1?[x,c,0]:seg===2?[0,c,x]:seg===3?[0,x,c]:seg===4?[x,0,c]:[c,0,x];
    return '#' + rgb.map(function(v){
      var n = Math.round((v+m)*255).toString(16);
      return n.length < 2 ? '0'+n : n;
    }).join('');
  }

  function relLum(hex) {
    var h = hex.replace('#','');
    var ch = [0,2,4].map(function(i){
      var v = parseInt(h.slice(i,i+2),16)/255;
      return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*ch[0] + 0.7152*ch[1] + 0.0722*ch[2];
  }

  function contrast(a, b) {
    var la = relLum(a), lb = relLum(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi+0.05)/(lo+0.05);
  }

  function textColorOn(bg) {
    return contrast(bg, '#1e293b') >= contrast(bg, '#ffffff') ? '#1e293b' : '#ffffff';
  }

  function getColor(unit, allUnits) {
    var units = OPTIONS.testUnits || [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].value === unit && units[i].color) return units[i].color;
    }
    if (UNIT_COLORS[unit]) return UNIT_COLORS[unit];
    var extras = allUnits.filter(function(u){ return !UNIT_COLORS[u]; });
    var idx = extras.indexOf(unit);
    return EXTRA_COLORS[(idx < 0 ? 0 : idx) % EXTRA_COLORS.length];
  }

  function getEngineerColor(engineer, unitValue, allUnits) {
    var units = OPTIONS.testUnits || [];
    var unit = null;
    for (var i = 0; i < units.length; i++) {
      if (units[i].value === unitValue) { unit = units[i]; break; }
    }
    if (!unit) {
      for (var j = 0; j < units.length; j++) {
        var engs = units[j].engineers || [];
        for (var k = 0; k < engs.length; k++) {
          if (engs[k].value === engineer) { unit = units[j]; break; }
        }
        if (unit) break;
      }
    }
    if (!unit) return getColor(unitValue, allUnits);
    var list = unit.engineers || [];
    for (var m = 0; m < list.length; m++) {
      if (list[m].value === engineer) {
        if (list[m].color) return list[m].color;
        var base = getColor(unit.value, allUnits);
        var hsl = hexToHsl(base);
        var off = LIGHTNESS_OFFSETS[m % LIGHTNESS_OFFSETS.length];
        return hslToHex(hsl.h, hsl.s, Math.min(88, Math.max(24, hsl.l + off)));
      }
    }
    return getColor(unit.value, allUnits);
  }
```

- [ ] **Step 2: 改寫 dashboard 的 bar 繪製**

將 `src/dashboard/script.ts` 的 bar 繪製（現行 348–370 行，自 `var html = ` 至 `}` 結束該段）替換為：

```js
      var unitColor = getColor(s.testUnit, allUnits);
      var engColor  = s.testEngineer ? getEngineerColor(s.testEngineer, s.testUnit, allUnits) : unitColor;

      var html = '<rect x="0" y="'+y+'" width="'+timelineW+'" height="'+ROW_H+'" fill="'+evenFA+'"/>'
        +'<line x1="0" y1="'+(y+ROW_H)+'" x2="'+timelineW+'" y2="'+(y+ROW_H)+'" stroke="#e2e8f0" stroke-width="1"/>';

      html += '<rect x="'+(bx+1)+'" y="'+(barY+1)+'" width="'+Math.max(bw-2,4)+'" height="20"'
        +' fill="'+engColor+'" stroke="'+unitColor+'" stroke-width="2" rx="4"'
        +' data-idx="'+i+'" class="gantt-bar" style="cursor:pointer;opacity:0.92"/>';

      if (hasOverflow) {
        var ow = Math.max((totalBarDays - workDayOff) * PX_PER_DAY - 3, 3);
        html += '<rect x="'+(bx + workDayOff * PX_PER_DAY)+'" y="'+(barY+3)+'" width="'+ow+'"'
          +' height="16" rx="3" fill="'+OVERFLOW_COLOR+'" style="pointer-events:none"/>';
      }
```

原本 `if (bw > 24)` 的 bar 文字區塊整段刪除——匯出 dashboard 的左欄與主系統同樣具名，人名在 bar 上屬冗餘。

- [ ] **Step 3: 同步 dashboard 左欄的人員徽章**

匯出頁的左欄本來就有人員小標（固定藍底），但位於第二行且顏色與 bar 無關。將其改為與主系統一致的版面。把 `src/dashboard/script.ts` 的 `leftRows`（現行 304–330 行整段）替換為：

```js
    var leftRows = data.map(function(s, i) {
      var status = computeStatus(s);
      var sc = STATUS_COLORS[status];
      var allUnitsL = (OPTIONS.testUnits || []).map(function(u){ return u.value; });
      var engColor = s.testEngineer ? getEngineerColor(s.testEngineer, s.testUnit, allUnitsL) : '#e2e8f0';
      var engText  = s.testEngineer ? textColorOn(engColor) : '#64748b';
      var engName  = escapeHtml(s.testEngineer ? engLabel(s.testEngineer) : '未指派');
      /* 匯出頁左欄固定 LEFT_W=260，比照主系統窄欄行為只顯示 PDN 編號段，
         完整字串放 title 供滑鼠停留時檢視 */
      var pdnFull  = s.projectName;
      var pdn      = escapeHtml(pdnFull.split(' ')[0] || pdnFull);
      var taskDesc = s.taskDescription
        ? escapeHtml(s.taskDescription.length > 26 ? s.taskDescription.slice(0,26)+'…' : s.taskDescription) : '';
      var evenFill = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      return '<div data-idx="'+i+'" class="left-row-hover" style="'
        +'height:'+ROW_H+'px;background:'+evenFill+';'
        +'box-shadow:inset 0 -1px 0 #e2e8f0;'
        +'position:relative;padding:5px 8px 0;box-sizing:border-box;cursor:default;">'
        +'<div style="display:flex;align-items:center;gap:6px;overflow:hidden;">'
          +'<span style="flex-shrink:0;height:20px;padding:0 7px;border-radius:5px;font-size:12px;'
          +'font-weight:700;line-height:20px;white-space:nowrap;'
          +'background:'+engColor+';color:'+engText+';">'+engName+'</span>'
          +'<span title="'+escapeHtml(pdnFull)+'" style="flex:1;min-width:0;font-size:12px;font-weight:600;'
          +'color:#1e293b;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+pdn+'</span>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;padding-top:2px;overflow:hidden;">'
          +'<span style="flex-shrink:0;height:17px;padding:0 6px;border-radius:4px;font-size:11px;'
          +'font-weight:700;line-height:17px;white-space:nowrap;letter-spacing:0.02em;'
          +'background:'+sc.bg+';color:'+sc.text+';">'+status+'</span>'
          +(taskDesc ? '<span style="font-size:11px;color:#64748b;overflow:hidden;white-space:nowrap;'
            +'text-overflow:ellipsis;">'+taskDesc+'</span>' : '')
        +'</div>'
        +'</div>';
    }).join('');
```

- [ ] **Step 4: 同步 template.ts 的圖例**

修改 `src/dashboard/template.ts`。將 `getUnitColor`（現行 6–10 行）改為讀取 options 的自訂色：

```ts
function getUnitColor(unit: string, allUnits: string[], options: OptionsMap): string {
  const custom = options.testUnits.find(u => u.value === unit)?.color
  if (custom) return custom
  if (UNIT_COLORS[unit]) return UNIT_COLORS[unit]
  const extras = allUnits.filter(u => !UNIT_COLORS[u])
  const idx = extras.indexOf(unit)
  return EXTRA_COLORS[(idx < 0 ? 0 : idx) % EXTRA_COLORS.length]
}
```

並將圖例產生處（現行 59–62 行）改為外框樣式並傳入 options：

```ts
  const legendItems = activeUnits.map(u => {
    const color = getUnitColor(u, activeUnits, options)
    return `<span class="legend-item"><span class="legend-dot" style="background:transparent;border:2px solid ${color}"></span>${escapeAttr(u)}</span>`
  }).join('')
  + `<span class="legend-item"><span class="legend-dot" style="background:${OVERFLOW_COLOR}"></span>超出時間資源</span>`
```

- [ ] **Step 5: 型別檢查與測試**

```bash
npx tsc -p tsconfig.app.json --noEmit
npm test
```

預期：無型別錯誤；所有測試 PASS。

- [ ] **Step 6: 目視驗證**

```bash
npm run build
pm2 restart vsms
```

在系統中匯出 dashboard HTML，以瀏覽器開啟並確認：bar 為雙色描邊；自訂過的工程師顏色與系統內一致；圖例為外框樣式；列表區的資料與甘特圖一致；整份 HTML 離線開啟仍正常（不倚賴 API）。

- [ ] **Step 7: Commit**

```bash
git add src/dashboard/script.ts src/dashboard/template.ts
git commit -m "feat: carry custom colors into exported dashboard"
```

---

## Task 14: 全案驗收

- [ ] **Step 1: 全部測試**

```bash
npm run test:all
```

預期：全部 PASS。

- [ ] **Step 2: 型別檢查**

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p server/tsconfig.json --noEmit
```

預期：無錯誤。

- [ ] **Step 3: 建置並重啟**

```bash
npm run build
pm2 restart vsms
pm2 logs vsms --lines 30 --nostream
```

預期：無錯誤堆疊。

- [ ] **Step 4: 端對端檢查清單**

逐項確認：

1. 甘特圖左欄每列第一行為人員徽章加 PDN 編號段，第二行為狀態籤加工作內容
2. 左欄拖曳至 340px 以上時 PDN 顯示完整字串
3. bar 有單位色外框；改過顏色的工程師其 bar 內裡不同色
4. 溢出 bar 的外框連續、綠色段在框內
5. 工程師視角 bar 無文字，設備視角有
6. 切到列表視圖後篩選條件與筆數不變，重新整理仍停在列表
7. 設定頁改類別統計模式後，分析頁的總數相應減少且出現「另有 N 筆…」提示
8. 設定頁改任一項設定後重新整理，先前設定的顏色與統計模式皆未被重設
9. 匯出的 dashboard HTML 離線開啟正常且顏色一致
10. 以 `user` 角色登入，確認只能編輯自己的排程；以 `guest` 登入確認全部唯讀

- [ ] **Step 5: 確認負載分析 API**

金鑰見 `.env` 的 `INTEGRATION_API_KEY`，代入下列指令的 `<KEY>`：

```bash
curl -s -H "x-api-key: <KEY>" "http://localhost:3001/api/integration/workload?month=2026-08" | head -c 600
```

預期：回傳 JSON；被設為 `excluded` 的類別其排程不出現在任何工程師的計數中。

- [ ] **Step 6: 移除還原快照（確認穩定後才做）**

穩定運行一段時間後才執行；在此之前保留快照。

```bash
rm -rf dist.stable-20260803 server/dist.stable-20260803
```

`vsms-stable-20260803` 標籤與 `backup-options-20260803.sql` 建議長期保留。

---

## 退版速查

測試期間遇到重大問題時：

```bash
rm -rf dist server/dist
cp -r dist.stable-20260803 dist
cp -r server/dist.stable-20260803 server/dist
pm2 restart vsms
```

若只想回退單一階段，各階段的 commit 彼此獨立，可用 `git revert` 針對該階段的 commit 處理後重新建置。資料庫欄位皆為 additive 且 nullable 或帶 DEFAULT，退版後舊程式碼可正常運行；唯一副作用是舊版的 `PUT /api/options` 會在使用者存設定時把 `statsMode` 與 `color` 重設為預設值，此時可從 `backup-options-20260803.sql` 復原。
