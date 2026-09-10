# 人員頁重排（A）— 設計文件

日期：2026-09-10
狀態：已與使用者確認，待實作
範圍：純前端，不動 server、不動 schema。
後續：B「組織層級」（`2026-09-10-org-hierarchy-design.md`）蓋在本設計的列樣式上，A 先上線。

## 背景

2026-09-09 上線的「人員」分頁把名冊（`engineers`）與帳號（`users`）合併成一頁，但一列最多九個控制項、兩組動作同排、欄位不對齊、停用者混在啟用者中間。使用者確認的事實與決定：

- super_admin 在這頁主要做的是**帳號**操作（開帳號、重設密碼、停用），名冊很少改。
- **名冊名稱一定等於帳號 username**。正式資料 26 個帳號全部成立（含 admin 角色的 Brian_Kuo、Will_Wang），名冊 label 全等於 value。
- admin 就是**部級主管**；只有部級主管以上能建排程；部級主管也可能排工作給自己（Will 有 37 筆）。
- 顏色不需要「還原」功能。
- 相同功能的按鈕要在同一條垂直線上。
- 停用的人另外擺放，預設摺疊。

## 身分模型

**一個名字就是一個人。** 列的來源是名冊與帳號的聯集：

- 名冊列以 `engineer.value` 為鍵；同一個 value 在多個單位各有一列（例如 Ericct_Hsieh 在 SIT-HW 與 SIT-SW），這代表「屬於多個單位」，合併成一人一列、單位以籤顯示。
- 帳號以 `username` 為鍵，**不分角色**，`username === engineer.value` 即為同一人。`linkedEngineer` 不再用來對應（它對 admin 一律為空，是舊模型的產物），但建立 user 角色帳號時仍照後端要求送 `linkedEngineer = 姓名`。
- 只有帳號沒有名冊的人（目前只有 super_admin `admin`）也列出，單位欄空白，放在最後一組「無單位」。
- 只有名冊沒有帳號的人，帳號欄顯示「建立帳號」。

純函式 `src/lib/peopleRows.ts` 重寫為：

```ts
export interface Person {
  name: string                    // engineer.value === username
  memberships: { unitId: string; unitValue: string; unitLabel: string; engineerId: string; color: string | null; sortOrder: number }[]
  rosterActive: boolean           // 任一 membership isActive
  account: SafeUser | null
}
export interface PeopleModel {
  active: PersonGroup[]           // 依單位分組，只含 rosterActive 或帳號啟用的人
  inactive: PersonGroup[]         // 名冊全部停用、且（無帳號或帳號停用）的人
  unassigned: Person[]            // 沒有名冊列的帳號
}
export interface PersonGroup { unitId: string | null; unitLabel: string; people: Person[] }
export function buildPeopleModel(testUnits: TestUnitOption[], users: SafeUser[]): PeopleModel
```

規則：
- 一人多單位時，在啟用清單裡**每個單位各列一次**（B 上線後改成部級上浮；A 階段先維持逐單位列出，但同一人的屬性只有一份）。
- 「停用」的定義：名冊每一列都 `isActive=false`，且帳號不存在或 `isActive=false`。任一條件不成立就在啟用清單。
- 同組內排序：`sortOrder` 升冪；`unassigned` 依 `createdAt`。
- `duplicate` 孤兒（兩個帳號指到同一人）在新模型不可能發生（鍵是 username，唯一）；舊的 `orphanAccounts` 概念取消。

## 版面

### 列

固定欄寬的 CSS grid，每列相同的 `grid-template-columns`，所以同功能按鈕永遠在同一條垂直線：

| 欄 | 寬 | 內容 |
|---|---|---|
| 色塊 | 28px | `<input type="color">` 的自訂外觀；值為該人第一個 membership 的 `color ?? resolveEngineerColor`。改色套到所有 membership。**沒有還原按鈕**。 |
| 姓名 | 1fr | `name`；名冊停用但帳號啟用的人（理論上少見）姓名旁標「名冊停用」小籤 |
| 單位 | auto（最大 220px） | 每個 membership 一個籤，籤色用單位色 |
| 帳號 | 220px | 有帳號：角色徽章＋狀態＋上次登入（`上次登入 2026/9/3`），停用者徽章變灰加「已停用」。無帳號：一顆「建立帳號」按鈕（虛線框），**放在帳號欄內**，不佔動作區 |
| 動作 | 64px + 64px | 「編輯」、「停用」（或「啟用」）。用 `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100` 顯示，**佔位不變**，鍵盤 Tab 也能到 |

角色徽章文字：`super_admin`→「系統管理員」、`admin`→「部級主管」、`user`→「測試人員」。資料值不動。

### 分組

啟用清單依單位分組（B 之後改成部 → 課），每組是一個卡片，標題為單位名＋人數，底部一列「新增人員」輸入框（沿用現在的 `addEngineer`）。

最底下一個「無單位帳號」組（只有 `unassigned` 非空時顯示），再底下是「**已停用（N）**」區塊：預設摺疊，標題列可點展開，展開後依單位分組、列樣式相同、動作只有「啟用」與「編輯」。摺疊狀態存 `uiStore`（`peopleInactiveOpen: boolean`，預設 false）。

### 表單（一個人一份）

「編輯」與「建立帳號」都開同一個置中視窗 `PersonFormModal`（沿用 `ScheduleFormModal` 的 `fixed inset-0` 結構與 `useEscapeKey`），不再列內展開。分兩段：

**人員段**（有名冊列才顯示）
- 姓名（label）：改名只動 label，沿用 `updateEngineer`（value 是排程存的識別碼，不改）。
- 顏色：色塊，無還原。
- 單位歸屬：籤加減。加＝在該單位 `addEngineer`；減＝該單位 `removeEngineer`，後端 `ENGINEER_IN_USE` 擋下時把訊息顯示在籤旁。
- 名冊啟用：開關，套到所有 membership。

**帳號段**
- 無帳號：標題「建立帳號」，username 唯讀等於姓名，角色單選「測試人員／部級主管」（不提供 super_admin），密碼（≥8 字元）。選部級主管時「管轄單位」預設帶入該人的 memberships；選測試人員時 `linkedEngineer` 自動等於姓名。
- 有帳號：角色（**2026-09-10 追加**：測試人員 ↔ 部級主管可切換，super_admin 唯讀；後端 `PUT /api/users/:id` 接受 `role`，不能改 super_admin、不能改自己，升 admin 清 `linkedEngineer` 並套用管轄單位、降 user 清管轄單位並把 `linkedEngineer` 設為 username）、管轄單位（admin）、VTMS 兩個權限、新密碼（留空不改）、帳號啟用開關。
- 沒有名冊列的帳號（`unassigned`）：只顯示帳號段。

**底部危險區**：「刪除人員」（有名冊列時；逐單位 `removeEngineer`，任一單位被 `ENGINEER_IN_USE` 擋下就顯示訊息並保留其餘）與「永久刪除帳號」（帳號已停用時才顯示；沿用兩段式）。都用 `DeleteConfirmDialog`。

送出：人員段與帳號段分別呼叫既有 API（`PUT /api/options` 一次；`POST/PUT /api/users/:id` 一次），任一失敗把錯誤顯示在對應段，不做交易。

### 列上的「停用／啟用」

- 「停用」一次做兩件事：所有 membership `isActive=false` ＋ 帳號 `disableUser`（若有）。`DeleteConfirmDialog`（非危險色）寫明兩件事；該人隨即移到「已停用」區塊。
- 「啟用」不確認：所有 membership `isActive=true` ＋ 帳號 `enableUser`（若有）。
- 兩個 API 分開呼叫；第二個失敗時 toast 說明「名冊已停用，但帳號停用失敗」（或反之），不回滾。

## 元件與檔案

| 檔案 | 責任 |
|---|---|
| `src/lib/peopleRows.ts`（重寫） | `buildPeopleModel`、`roleLabel(role)`、`isPersonInactive(person)` 純函式 |
| `src/lib/peopleActions.ts`（新） | `deactivatePerson`、`activatePerson`、`membershipTargets`：橫跨名冊與帳號兩個 API 的流程，回傳 `{ ok: true } | { ok: false; message }`，相依注入可測。改色、改名、單位歸屬則直接用 `optionsStore` 的兩個批次動作 `patchEngineers`／`setPersonUnits`（一次 PUT 套到所有 membership） |
| `src/components/settings/PeopleManager.tsx`（重寫） | 分組、列、摺疊區塊；不含表單 |
| `src/components/settings/PersonRow.tsx`（新） | 單一列，grid 欄位與滑過動作 |
| `src/components/settings/PersonFormModal.tsx`（新） | 一人一份的表單 |
| `src/store/uiStore.ts` | 加 `peopleInactiveOpen` |

`PeopleManager.tsx` 現在 577 行，拆成三個檔案後每個應在 250 行以內。

## 測試

- `src/__tests__/peopleRows.test.ts`（重寫）：同名多單位合併成一人；admin 帳號對到名冊列；只有帳號的人進 `unassigned`；停用判定（名冊全停＋帳號停／名冊全停但帳號啟用／名冊停一個單位）；排序。
- `src/__tests__/peopleActions.test.ts`（新）：停用套到所有 membership 並呼叫 `disableUser`；第二步失敗回傳 `ok:false` 且不拋出；改色套到所有 membership。
- 版面用 harness 實機驗證：三種寬度下「編輯」「停用」按鈕的 x 座標相同（用 `getBoundingClientRect` 量）；停用區塊預設摺疊；Ericct 的列有兩個籤。

## 三系統檢查

- Schema：無變動。`/api/integration/*`：無變動。共用欄位語意：無變動。C# / VTMS：無影響。

## 不做

- 拖曳排序、批次停用、匯入名冊、建立 super_admin。（改帳號角色原本在此清單，2026-09-10 已追加實作。）
- 甘特圖工具列與篩選列不動。
- 部 → 課分組與部級上浮（B）。
