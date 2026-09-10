# 組織層級：部與課（B）— 設計文件

日期：2026-09-10
狀態：已與使用者確認，待實作
前置：A「人員頁重排」（`2026-09-10-people-page-redesign-design.md`）先上線，本設計蓋在它的列樣式與 `buildPeopleModel` 之上。
範圍：`test_units` 加一個 additive 欄位；VSMS server 的 options API 多回、多收一個欄位；前端分組與管轄單位選擇。需要 VSMS server 重啟。

## 背景與事實

- VTMS 的組織是兩層：`users.department` / `users.section`。正式資料：部門 RA、SI、SIT；只有 SIT 有課（SIT-HW、SIT-SW）。部級主管 Ericct_Hsieh 的 section 為空，課級主管 Polson_Cheng（SIT-HW）、Ashley_Liu（SIT-SW），Will_Wang（RA）、Brian_Kuo（SI）是沒有課的部門的主管。
- VSMS 的 `test_units` 只有一層，值正好是 VTMS 的「section ?? department」：SIT-HW、SIT-SW、RA、SI。748 筆排程全部掛在這四個葉單位。
- 部級主管 Ericct 在名冊裡有兩列（SIT-HW、SIT-SW），因為 VSMS 沒有「部」可以放他。使用者確認：部級主管也可能排工作給自己，所以他**必須能被兩個課的排程選到**，名冊的兩列是正確的語意，錯的只是畫面把兩列畫成兩個人。
- C# `Merged.Api` 的名冊查詢是 `SELECT e.value, e.label, u.value AS TestUnit, e.isActive FROM engineers e JOIN test_units u ON u.id = e.testUnitId`，明列欄位。VTMS 不讀 VSMS 的資料表。

## 決定

**排程、名冊、C# 名冊、甘特圖、篩選、統計全部維持以葉單位為準；「部」只是葉單位上的一個標籤，用於畫面分組與管轄單位的選擇便利。** 不新增「SIT」單位、不讓排程掛在部門、不把 `engineers.testUnitId` 改成可為空。

## 資料

`test_units` 加欄位：

```sql
ALTER TABLE test_units ADD COLUMN department VARCHAR(100) NULL;
```

- 用 `npx prisma db execute` 手動施作（不跑 `migrate dev`，見 memory `vsms-prisma-drift`），同步 `prisma/schema.prisma` 的 `TestUnit` 加 `department String? @db.VarChar(100)`。
- 初始資料：`UPDATE test_units SET department='SIT' WHERE value IN ('SIT-HW','SIT-SW')`；RA、SI 留 NULL。
- 語意：`department` 為 NULL 代表「這個單位自己就是一個部」。**不另建 departments 表**，部門名稱是自由文字，由 super_admin 在「測試單位」分頁維護；輸入時提供既有值的建議清單避免拼錯。

## API

`GET /api/options` 的 `testUnits[]` 多回 `department: string | null`；`PUT /api/options` 接受並寫入同名欄位（trim 後空字串存 NULL）。其餘不變。

前端 `TestUnitOption` 加 `department?: string | null`。

## 純函式：部 → 課的分組與部級上浮

`src/lib/orgGroups.ts`：

```ts
export interface DeptGroup {
  department: string              // NULL 的單位以自己的 label 當部門名
  isSingleLevel: boolean          // 只有一個葉單位且 department 為 NULL
  deptLevel: Person[]             // 部級：同一部門內出現在 >1 個課的人
  sections: { unitId: string; unitLabel: string; people: Person[] }[]
}
export function groupByDepartment(model: PeopleModel['active'], testUnits: TestUnitOption[]): DeptGroup[]
```

規則（不是猜測，可測）：
1. 部門 = `unit.department ?? unit.label`。部門排序依其第一個葉單位的 `sortOrder`。
2. 一個人在**同一部門**內的 membership 數 > 1 → 進 `deptLevel`，標「部級」，不再在各課下重複。
3. 其餘人列在自己的課下。跨兩個部門的人（Will：RA 與 SIT-SW）在兩個部門各列一次，因為那是兩個部。
4. `isSingleLevel` 的部門（RA、SI）畫成一層卡片，標題就是單位名，不顯示「課」的子標題。

「已停用」摺疊區塊沿用 A 的定義，但內部也改用同一個分組函式。

## 畫面

- 人員頁：部門卡片 → 其下先「部級」列（若有），再每個課一個子區塊。列樣式完全沿用 A 的 `PersonRow`；單位籤仍顯示所有 membership。
- 「測試單位」分頁（`TestUnitManager`）：每個單位多一個「所屬部門」輸入框（`<input list>` 帶既有部門建議），空白代表自己是一個部。改動走既有的 `PUT /api/options`。
- 管轄單位選擇器（A 的 `PersonFormModal` 帳號段）：依部門分組，勾部門 = 勾下面所有葉單位；存進 `allowedUnits` 時只存葉單位 label，**後端零改動**（`getAllowedUnits` 與所有 `allowedUnits.includes(testUnit)` 判斷維持原樣）。
- 排程表單、篩選列、甘特圖工具列、Excel 匯入匯出、統計頁：**不動**。

## 相容性與部署

- 新前端配舊後端：`department` 為 undefined → 全部視為 NULL → 每個單位自成一部，畫面退化成 A 的樣子，不壞。
- 舊前端配新後端：多一個欄位被忽略；但**舊前端的 `PUT /api/options` 不會帶 `department`**，後端必須把「body 沒有這個鍵」當成「不變」而不是清空。這是本設計唯一的後端邏輯要求，要有測試。
- 部署順序：`prisma db execute`（ALTER + UPDATE）→ `tsc -p server/tsconfig.json` + `pm2 restart vsms` → `npx vite build`。ALTER 是 additive，先上不影響現行程式。
- 重啟 VSMS server 前要再處理別人未提交的 `server/src/routes/auth.ts` + `lib/crypto.ts` + 測試（stash 或一起上，問使用者）。

## 測試

- `server/src/__tests__/optionsDepartment.test.ts`：`PUT /api/options` 帶 `department` 寫入；不帶時保留既有值；空字串存 NULL。用 prisma stub（比照 `optionsPutEngineerGuard.test.ts`），不碰真 DB。
- `src/__tests__/orgGroups.test.ts`：Ericct 上浮到 SIT 部級且不在兩課重複；Will 在 RA 與 SIT 各一次；RA 為單層；部門排序；department 全 NULL 時退化為每單位一部。
- `src/__tests__/allowedUnitsExpand.test.ts`：勾部門展開成葉單位、取消一個葉單位時部門變半選、存值只含葉單位。
- 實機：三系統檢查 → 用 C# 那條 SQL 在 DB 上跑一次，確認回傳形狀不變。

## 三系統檢查

- **Schema**：additive（一個 NULL 欄位）。Dapper 明列欄位，不受影響。
- **`/api/integration/*`**：無變動。
- **共用欄位語意**：`test_units.value`、`schedules.testUnit`、`engineers.*` 語意不變。新欄位只有 VSMS 前端讀。
- **Node / C#**：只動 VSMS Node 端；`GET /api/integration/engineers` 的回應形狀不變。

## 不做

- 不新增部門層級的單位、不讓排程掛部門、不動 `engineers` 表。
- 不同步 VTMS 的 `users.department/section`；兩邊各自維護，日後若要對齊再另開需求。
- 甘特圖工具列的單位籤不分組。
- 不改 `allowedUnits` 的儲存格式。
