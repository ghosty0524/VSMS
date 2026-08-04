# VSMS 甘特圖可辨識性、類別統計模式與列表視圖

日期：2026-08-03

## 背景

三個實際使用上的痛點：

1. **甘特圖看不出排程屬於誰**。工程師視角每列一筆排程，測試人員只畫在 bar 內部（`GanttChart.tsx:1004`），而 bar 隨右側時間軸水平捲動。排程日期落在可視範圍外時，整列只剩專案名稱，無從判斷測試人員。左側凍結欄目前只有 `[狀態籤] PDN Number` 與 `工作內容` 兩項，完全不含人員資訊。
2. **部分工作類別不應計入專案數量**。例如「出國」佔用工程師產能，但它不是一個測試專案，計入專案數與完成率會扭曲統計。
3. **管理介面沒有列表模式**。匯出的 dashboard 是甘特圖上、列表下同時呈現；管理介面只有甘特圖，無法快速條列比對。

## 目標

- 任何捲動位置下都能立即判斷排程的測試人員與所屬單位
- 工作類別可設定其在統計中的計入方式，且前後端一致
- 管理介面可在甘特圖與列表間一鍵切換，且不損失當下的篩選與排序

## 需求一：甘特圖左側凍結欄兩層資訊

影響範圍：`src/components/schedule/GanttChart.tsx` 工程師視角左欄（現行 814–932 行）。設備視角左欄維持不變。

列高維持 `ROW_H = 46`，內容重排為兩層：

| 層 | 內容 |
|---|---|
| 第一行（高 20px） | 人員徽章 → PDN Number → 旗標／編輯／刪除按鈕（靠右） |
| 第二行（高 17px） | 狀態籤（縮小）→ 工作內容 |

### 人員徽章

- 底色 = `resolveEngineerColor(s.testEngineer, s.testUnit, options)`（見需求二）
- 文字 = `engLabel(s.testEngineer)`，文字色由底色亮度決定（見 `readableTextColor`）
- `s.testEngineer` 為空字串時顯示灰底「未指派」

### PDN Number 依欄寬自適應

```ts
const PDN_FULL_THRESHOLD = 340

const pdnDisplay = leftWidth >= PDN_FULL_THRESHOLD
  ? s.projectName
  : (s.projectName.split(' ')[0] || s.projectName)
```

實際資料形如 `PDN-250061 NCA-5550A-CK1`、`PDN-210079 NCA-5220A-NZ1 [Nozomi]`，最長達 33 字元。預設欄寬 260px 只顯示編號段；使用者拖曳超過 340px 後自動顯示完整字串。`title` 屬性一律放完整值，滑鼠停留即可讀取，不必真的拉寬。

`projectName` 不含空白時（不符 `PDN-xxxxxx 機種名` 慣例的舊資料），`split(' ')[0]` 回傳原字串，由 CSS `text-overflow: ellipsis` 截斷。

### 狀態籤縮小

從 `84×24 / 12px 字` 縮為 `高 17px / padding 0 6px / 11px 字`。第二行本來就只有灰色小字，不需維持原尺寸。`STATUS_GLYPH` 保留（色弱使用者的非顏色指示）。

### 第二行恆常渲染

現行程式在 `taskDescription` 為空時不渲染第二行。改版後第二行含狀態籤，必須恆常渲染，否則無工作內容的排程會失去狀態顯示。

## 需求二：雙色 bar 與可自訂顏色

### bar 的雙重編碼

甘特圖 bar 改為外框編碼測試單位、內裡編碼工程師：

- 外框 `stroke` = `resolveUnitColor(s.testUnit, options)`，`strokeWidth = 2`
- 內裡 `fill` = `resolveEngineerColor(s.testEngineer, s.testUnit, options)`

幾何調整：原 rect 為 `y=barY, height=22`。改為 `x=barX+1, y=barY+1, width=barW-2, height=20, strokeWidth=2`，使描邊置中後總高仍為 22px，不影響既有列高計算。

### 溢出段

現行溢出 bar 由兩塊 rect 拼接（單位色 + `OVERFLOW_COLOR`），各自描邊會在接縫處產生雙線。改為：

1. 先畫一整根帶框 rect（`stroke` 單位色、`fill` 工程師色），涵蓋 `totalBarDays` 全長
2. 再將溢出段以**無描邊**的填色 rect 疊上，內縮至框內（`y=barY+3, height=16, rx=3`），起點為 `barX + workDayOffset * PX_PER_DAY`

外框因此保持連續。覆蓋層設 `pointerEvents: 'none'`，讓 tooltip 的 hover 事件由底下的外框 rect 統一處理。

### 移除 bar 上的人名

工程師視角的 bar 內文字（`GanttChart.tsx:994–1007`）連同其 `<defs><clipPath>` 一併移除——左欄徽章已提供人名，屬冗餘。以約 400 筆排程計，這同時省下每根 bar 一組 clipPath 定義。

**設備視角的 bar 文字保留**。該視角左欄是設備名稱，bar 上的人名是唯一的人員線索；若移除，工程師色將失去解讀依據。

### 顏色解析

新增 `src/lib/colors.ts`：

```ts
resolveUnitColor(unitValue, options): string
// TestUnit.color ?? UNIT_COLORS[unitValue] ?? EXTRA_COLORS[index]

resolveEngineerColor(engineerValue, unitValue, options): string
// Engineer.color ?? deriveEngineerColor(所屬單位色, 該工程師在單位內的索引)

deriveEngineerColor(unitColor, index): string
// 將 unitColor 轉 HSL，保持 H 與 S 不變，僅依索引調整 L

readableTextColor(hex): string
// 依 WCAG 相對亮度回傳 '#1e293b' 或 '#ffffff'
```

`resolveEngineerColor` 必須同時吃 `unitValue`：`Engineer.value` 在 schema 上並非唯一，同名工程師可隸屬於不同測試單位（現行 `engineerLabelMap` 把所有單位攤平成一張表，是後者覆蓋前者）。`Schedule` 同時帶有 `testUnit` 與 `testEngineer`，以兩者配對查找才不會取到別單位同名者的顏色；配對失敗時回退為第一個同 value 的工程師。

`deriveEngineerColor` 的 index 是該工程師在其所屬單位 `engineers` 陣列中的位置（該陣列已依 `sortOrder` 排序）。函式只調整明度、不動色相與飽和度，因此同單位的所有工程師必為同色系——這是「預設一致」的實作來源。明度位移採固定序列（例如 `[0, +14, -12, +24, -20, +8, -6, +32]` 個百分點循環），索引 0 的工程師得到與單位色完全相同的顏色。

未自訂顏色的單位與工程師，畫面與現況完全一致（內外同色、看起來就是純色 bar），不會有「系統無故換色」的觀感。

`readableTextColor` 是必要的：RA 的單位色 `#F5A623` 是亮橘，白字對比僅約 2.1:1，不符 WCAG AA。

### 資料模型

```
TestUnit.color   VARCHAR(7) NULL
Engineer.color   VARCHAR(7) NULL
```

兩者皆 nullable，null 表示「使用預設」。因此不需資料遷移，也不必一次填滿所有顏色。

`src/types.ts` 的 `Option` 不動；新增：

```ts
export interface EngineerOption extends Option { color?: string | null }
export interface TestUnitOption extends Option {
  color?: string | null
  engineers: EngineerOption[]
}
```

需求三另需 `CategoryOption`，`OptionsMap.categories` 的型別由 `Option[]` 改為 `CategoryOption[]`：

```ts
export interface CategoryOption extends Option { statsMode: CategoryStatsMode }
```

### 設定頁

`TestUnitManager.tsx` 與 `EngineerManager.tsx` 各列加上 `<input type="color">` 與「還原預設」按鈕（將 color 設為 `null`）。還原後該列即回到自動衍生的顏色。

### 匯出 dashboard 同步

單位色目前硬編碼於三處：`src/constants.ts:16`、`src/dashboard/script.ts:13`、`src/dashboard/template.ts:6`。後兩者是給自包含匯出 HTML 用的獨立複本。

匯出時由 `src/lib/export.ts` 產生解析後的顏色表，嵌入 dashboard 的 `OPTIONS` blob：

```ts
colorMap: {
  units:     Record<string, string>
  engineers: Record<string, string>
}
```

`script.ts` 與 `template.ts` 的 `getColor` 改讀 `colorMap`，原硬編碼表降級為 fallback。匯出 HTML 是自包含的，不能倚賴 API，所以顏色必須在匯出當下解析完畢並內嵌。

匯出 dashboard 的 bar 同步採用雙色描邊，列表的單位徽章沿用單位色。

### 圖例

甘特圖圖例改為外框樣式（透明底 + 2px 單位色外框），以對應 bar 的視覺編碼。**不新增工程師圖例**——左欄徽章本身即具名，另設圖例在人數多時會過長。

## 需求三：工作類別統計模式

### 資料模型

```
Category.statsMode  VARCHAR(20) NOT NULL DEFAULT 'counted'
```

```ts
export type CategoryStatsMode = 'counted' | 'workload_only' | 'excluded'
```

| 值 | 語意 | 專案統計 | 人力負載 | 甘特圖／列表 |
|---|---|---|---|---|
| `counted` | 正常計入（預設） | 計入 | 計入 | 顯示 |
| `workload_only` | 不計專案數，保留負載 | 排除 | 計入 | 顯示 |
| `excluded` | 完全排除 | 排除 | 排除 | 顯示 |

三種值互斥，以單一 enum 欄位表示，避免兩個獨立布林產生「計專案但不計負載」這種實際用不到又需要額外說明的組合。

### 設定頁

`CategoryManager.tsx` 每列加一個 `<select>`，三個選項對應上表。

### 前端統計套用

`src/lib/analytics.ts` 新增：

```ts
export function splitByStatsMode(
  schedules: Schedule[],
  categories: CategoryOption[],
): { stats: Schedule[]; workload: Schedule[] }
```

判斷集中在此，不散落到各分析元件。`schedule.category` 在 categories 中找不到對應項目時（類別被刪除後遺留的舊排程），一律視為 `counted`——寧可多算也不要無聲漏掉。

`AnalyticsPage.tsx` 以 `useMemo` 算出兩份陣列後分派：

- `stats` → `KpiSection`、`TrendSection`、`RiskList`、`UnitComparison`、`DelayAnalysis`
- `workload` → `LoadSection`

分析頁篩選列加一行提示，說明目前有幾筆排程因類別設定而未計入，避免使用者誤以為資料遺失。

甘特圖、列表、匯出 dashboard **不套用**此過濾，該顯示的排程照常顯示。

### 後端負載分析同步

`server/src/lib/workload.ts` 有自己的 `scheduleCount` 累計與一組硬編碼的 `CATEGORY_ADJUSTMENT`（第 44 行）。僅改前端會導致該 API 的排程筆數仍包含被排除的類別。

修改 `computeWorkload` 主迴圈（第 96–120 行）：

- 讀取 `prisma.category` 取得 `value → statsMode` 對照
- `excluded`：`continue`，既不計 `scheduleCount` 也不累計 intensity
- `workload_only`：不執行 `acc.scheduleCount++`，但 intensity 照常累計
- 兩者皆於 `limitations` 加註說明，讓呼叫端（含 Copilot agent）知道數字為何與甘特圖不同

`CATEGORY_ADJUSTMENT` 本次不動，維持現有行為。

## 需求四：甘特／列表一鍵切換

### 狀態

在 `GanttChart` 內新增與 `filterSort` 同層的狀態：

```ts
const [viewMode, setViewMode] = useState<'gantt' | 'list'>(...)
// localStorage key: 'vsms-main-view-mode'
```

因為 `filterSort` 與 `applyFilter()` 的結果 `filtered` 由兩個視圖共用，切換時篩選條件與多層排序完全不受影響——這是選擇把狀態放在此層而非提升到 `App` 的原因。

### 切換位置

放在現有甘特圖收合控制列（`GanttChart.tsx:505–569`）最左側。列表模式下：

- 隱藏「按工程師／按設備」分組鈕（列表無分組概念）
- 隱藏收合鈕
- 保留全螢幕鈕

### 列表元件

新增 `src/components/schedule/ScheduleListView.tsx`。欄位沿用匯出 dashboard 的十欄，末尾加一欄操作：

狀態、工作類別、PDN Number、工作內容、測試單位、測試人員、起始日、完成日、需求人員、測試報告、操作

- `thead` 使用 sticky 定位
- `LIST_ROW_H = 36`，沿用甘特圖既有的 `visibleRange` 虛擬化模式（上下以 spacer `<tr>` 撐開捲動高度）
- 測試單位欄以 `resolveUnitColor` 上色的徽章呈現
- 操作欄的編輯／刪除權限規則與甘特圖左欄完全一致：`canWrite` 才有刪除；`role === 'user' && s.testEngineer === linkedEngineer` 可編輯自己的排程；guest 唯讀

**列表不提供旗標操作**（2026-08-04 決定，刻意的範圍縮減）。`FlagPopover` 需要 `anchorEl` 並與甘特圖左欄共用同一份 popover 狀態，在表格中再開一套的維護成本高於效益。影響：使用者在列表模式下無法設定或取消旗標，若以「只看已標記」篩選後想取消標記，必須切回甘特圖。若日後旗標使用頻率提高，這是第一個該補的缺口。

## 資料模型變更彙整

| 資料表 | 欄位 | 型別 | 預設 |
|---|---|---|---|
| `categories` | `statsMode` | `VARCHAR(20) NOT NULL` | `'counted'` |
| `test_units` | `color` | `VARCHAR(7) NULL` | `NULL` |
| `engineers` | `color` | `VARCHAR(7) NULL` | `NULL` |

依專案既有慣例，以 `prisma db execute` 手動下 additive `ALTER TABLE`，並同步更新 `schema.prisma`。**不執行 `prisma migrate dev`**——該指令在此專案會要求 reset 資料庫。

## 相容性與風險

### PUT /api/options 是全刪重建

`server/src/routes/options.ts:47` 的 `PUT /api/options` 會先 `deleteMany()` 再重建全部 categories 與 testUnits。若前端送出的 `OptionsMap` 未帶 `statsMode` 或 `color`，**任何一次設定變更（例如改個工程師名字）都會靜默清空所有自訂顏色與統計模式**。

因此新欄位必須端到端帶齊：`server/src/types.ts` 的 `OptionsMap`、GET 的 `result` 映射、PUT 的 `createMany` / `create` 資料、前端 `optionsStore` 的所有寫入路徑。以後端 round-trip 測試守住此不變式。

### 其他

- 匯出 dashboard 為自包含 HTML，顏色表必須在匯出當下解析並內嵌，不可倚賴 API
- `ganttLeftWidth` 的 localStorage 舊值（多為 260）沿用不強制重置，PDN 自適應已針對窄欄處理
- 類別被刪除後遺留的排程，其 `category` 值在 categories 中查無對應，一律視為 `counted`

## 部署與退版

變動橫跨前端、後端與資料庫，測試期間必須能在數十秒內退回目前可正常工作的版本。

### 前置：建立還原點

實作開始前必須先做，否則無版可退。

1. **提交目前工作區**。`feat/guest-role-and-uiux` 分支上有未 commit 的修改（`server/src/lib/workload.ts`、`server/src/lib/db.ts`、`server/src/routes/integration.ts`、`openapi-integration.yaml`、`server/src/__tests__/workload.test.ts`）與未追蹤的新檔（`server/src/lib/engineerMatch.ts`、`server/src/__tests__/engineerMatch.test.ts`），而 `server/dist` 的建置時間與這些原始碼一致——**線上執行的正是這份未進版控的程式碼**。先將其提交，再打上 `vsms-stable-20260803` 標籤。
2. **快照建置產物**。將 `dist/`（2.6MB）與 `server/dist/`（174KB）整份複製為 `dist.stable-20260803/` 與 `server/dist.stable-20260803/`。專案的 `dist` 由磁碟即時服務，因此退版可用資料夾置換完成，不需重新 build。
3. **備份受影響資料表**。以 `mysqldump` 單獨匯出 `categories`、`test_units`、`engineers` 三張表。

### 退版程序

```
1. 置換 dist/ 與 server/dist/ 為 .stable-20260803 快照
2. pm2 restart vsms
```

**資料庫不需退版**。三項 schema 變更皆為 additive 且 nullable 或帶 DEFAULT，舊版程式在新 schema 上可正常運行——它只是不讀取那些欄位。因此退版只需置換建置產物。

唯一副作用：退版後若有人在設定頁儲存，舊版的 `PUT /api/options`（全刪重建，且不認識新欄位）會把 `statsMode` 重設為 `'counted'`、`color` 重設為 `NULL`。這不會造成錯誤，只會遺失自訂值，而前置步驟 3 的資料表備份即為此準備。

### 分階段提交

雖然是單一實作計畫，各階段必須各自成為獨立 commit，使 `git revert` 能單獨回退某一階段。順序依風險由低到高排列，讓部分退版具有實際意義：

| 階段 | 內容 | 風險 |
|---|---|---|
| 1 | 左欄兩層資訊、PDN 自適應、狀態籤縮小 | 純前端，不動資料 |
| 2 | 甘特／列表切換 | 純前端，新增元件 |
| 3 | 類別統計模式（schema、設定頁、分析頁、負載分析後端） | 動 schema 與後端 |
| 4 | 雙色 bar 與可自訂顏色（schema、設定頁、匯出 dashboard） | 動 schema 與匯出格式 |

階段 1、2 不觸及資料庫，可獨立上線並獨立退回。階段 3、4 各自的 schema 變更互不相依，可分開驗證。

不採用功能旗標（feature flag）的原因：旗標無法乾淨地涵蓋 DB 層的顏色解析與後端負載分析的行為變更，而建置產物置換可一次涵蓋全部且操作更單純。

## 測試計畫

| 對象 | 內容 |
|---|---|
| `readableTextColor` | 亮色（`#F5A623`）回傳深字、暗色（`#4A90D9`）回傳白字 |
| `deriveEngineerColor` | 索引 0 等於單位色；同單位不同索引色相與飽和度不變、明度相異 |
| `resolveUnitColor` / `resolveEngineerColor` | 自訂色優先於衍生色；null 時回退正確 |
| `splitByStatsMode` | 三種模式分流正確；未知類別歸入 `counted`；空類別清單不崩潰 |
| `workload.ts` | 擴充既有 `workload.test.ts`：`excluded` 不計 scheduleCount 與 intensity；`workload_only` 不計 scheduleCount 但計 intensity |
| options round-trip | PUT 後 GET，`statsMode` 與兩層 `color` 不遺失 |
| PDN 截斷 | `leftWidth` 大於等於／小於 340 時的顯示字串；無空白的 `projectName` 不被截空 |

## 不在此範圍內

- 工程師泳道視角（rows = 工程師）
- 畫面外 bar 的邊緣提示器
- 列表行內編輯
- 列表欄位自訂顯示開關
- 「依單位／依人員上色」的切換鈕（bar 已同時編碼兩者）
- 修改 `workload.ts` 的 `CATEGORY_ADJUSTMENT`
- `src/components/schedule/GanttLayout.tsx`（無任何檔案 import 的孤兒元件，本次不處理也不刪除）
