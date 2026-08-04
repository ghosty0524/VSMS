# 人員參照完整性與列表複製

日期：2026-08-04

## 背景

### 人員參照會變成孤兒

`Schedule.testEngineer` 存的是人員的 `value` 字串，但系統沒有任何機制維護這個參照：

1. **刪除人員不檢查引用。** `removeEngineer` 把人從陣列濾掉即送出，`PUT /api/options` 全刪重建，排程裡的字串就此失去對應。對照之下，刪除設備會先 `count` 引用數並回 `DEVICE_IN_USE` 擋下（`server/src/routes/options.ts:139`）。兩者保護不對等。
2. **改名會連 `value` 一起改。** `updateEngineer` 同時覆寫 `value` 與 `label`，等同於「刪掉舊人員、新增同名新人員」。設備早已修掉這個問題並在程式碼註明「只更新 label，value 為識別碼保持不動」，人員這邊沒有。
3. **人員只能刪除，不能停用。** 類別與測試單位都有 `isActive` 停用機制，`Engineer` 也有 `isActive` 欄位，但 `EngineerManager` 未提供切換，後端也未使用。離職者只能被刪掉。

實測（2026-08-04，正式資料庫）：22 位現存人員的 `value` 與 `label` 全部一致；**`Ben_Ko` 已有 18 筆排程成為孤兒**。

後果是使用者會被介面誤導。編輯表單的人員下拉只由 `activeEngineers` 產生（`src/components/schedule/ScheduleFormModal.tsx:96`），孤兒值不在其中，下拉因此顯示「請選擇」。資料其實還在——只要不動那個下拉，儲存時仍會寫回原值——但甘特圖上明明顯示著 `Ben_Ko`，編輯時卻是空的，使用者很容易「順手補上」而讓原始測試者永久消失。

### 列表無法取得篩選後的資料

列表是虛擬化的，只渲染可視範圍加緩衝。使用者拖曳全選複製時**只會取得畫面上的二三十列，且沒有任何警示**——把 599 筆篩成 80 筆後複製，可能只拿到 30 筆卻以為是全部。

現有的「匯出 Excel」走 `exportSchedules(schedules, selectedUnits)`（`src/components/layout/Header.tsx:372`），吃的是全部排程再依測試單位篩一次，完全不理會列表當下的篩選與排序。目前沒有任何一條路徑能取得「眼前這張表」。

## 目標

- 人員異動（改名、離職、刪除）不再讓既有排程失去測試者
- 已成孤兒的排程可以被安全地檢視與編輯，不會誘導使用者誤改
- 列表模式能一鍵取得**完整的**篩選結果，而非畫面上的可視列

## 需求一：改名不動 `value`

`src/store/optionsStore.ts` 的 `updateEngineer` 只更新 `label`，`value` 保持不變，比照 `updateDevice` 的既有作法。

`value` 自此為穩定識別碼，`label` 為顯示名稱。甘特圖與列表已透過 `engLabel()` 由 value 查 label，因此改名後顯示會自動更新，既有排程的參照不受影響。

測試單位的 `updateTestUnit` 有同樣的問題（`Schedule.testUnit` 也存 value），但本次不動——單位改名遠少於人員改名，且一併修改會擴大測試面。列為後續事項。

## 需求二：人員可停用

`EngineerManager` 增加停用／啟用切換，`optionsStore` 增加 `toggleEngineer(unitId, engId, isActive)`，比照既有的 `toggleCategory` / `toggleTestUnit`。

`Engineer.isActive` 欄位與 `PUT /api/options` 的映射皆已存在，不需要 schema 變更。

停用的人員：
- 不出現在新增／編輯排程的人員下拉中（`activeEngineers` 已依 `isActive` 過濾）
- 既有排程的參照完整保留，甘特圖與列表照常顯示其名稱與顏色
- 在設定頁以刪除線標示，與類別、單位的呈現一致

這是人員離職的正確處理方式；刪除應保留給「建錯了要移除」的情境。

## 需求三：刪除仍被引用的人員時擋下

人員的移除是透過 `PUT /api/options` 的全刪重建達成（不在 payload 中即等同刪除），因此檢查必須放在該路由，不能做成 DELETE 端點。

`server/src/routes/options.ts` 的 `PUT` 在進入交易前：

1. 取得所有排程實際引用的 `testEngineer` 值集合（排除空字串）
2. 取得請求 body 中所有人員的 `value` 集合
3. 若有任何被引用的值不在 body 中，回 `400`，訊息列出人員名稱與筆數，`code: 'ENGINEER_IN_USE'`

錯誤訊息需引導使用者改用停用，例如：`「Ben_Ko」目前有 18 筆排程使用中，無法刪除。若該人員已離職，請改用「停用」。`

**此檢查同時保護改名**：需求一實施後改名不再變動 `value`，但若日後有其他程式路徑意外改動 `value`，這道防線會擋下。

前端 `optionsStore` 的 `removeEngineer` 需將後端錯誤往上拋，讓 `EngineerManager` 能顯示訊息而非無聲失敗。

## 需求四：表單保底顯示孤兒值

即使前三項到位，資料庫中仍有 18 筆既存孤兒。`ScheduleFormModal` 的人員下拉在 `form.testEngineer` 非空且不在 `activeEngineers` 中時，額外插入一個選項並預設選中：

```
{form.testEngineer}（已停用或已刪除）
```

該選項的 `value` 為原值，因此不改動就儲存時原值原樣寫回。使用者看得到真相，換人是有意識的決定而非被介面誘導。

此選項只在編輯既有排程時可能出現，新增排程時 `testEngineer` 為空字串，不受影響。

## 需求五：列表一鍵複製

列表模式的控制列增加「複製表格」按鈕，將**當前 `filtered` 陣列的全部資料**（非可視列）轉為 TSV 寫入剪貼簿。

- 欄位與順序同列表顯示的十欄（不含操作欄）
- 第一列為標題列
- 分隔字元為 tab，換行為 `\n`；欄位內的 tab 與換行替換為空白，避免破壞表格結構
- 狀態欄輸出狀態文字（不含符號），日期原樣輸出
- 使用 `navigator.clipboard.writeText`；失敗時顯示提示而非無聲失敗
- 複製成功後短暫顯示已複製幾筆，讓使用者確認拿到的是完整結果而非畫面上那幾列

TSV 貼進 Excel、Google 試算表與郵件用戶端皆會自動還原為表格。不新增相依套件。

現有的 Excel 匯出不在本次範圍內，維持匯出全部排程的行為。

## 不在此範圍內

- 修改既有的 18 筆 `Ben_Ko` 孤兒資料（屬資料異動，需另行決定是否補建為停用人員）
- `updateTestUnit` 的同類問題
- 讓 Excel 匯出改吃列表篩選結果
- 人員停用後的既有排程提醒或批次改派

## 測試計畫

| 對象 | 內容 |
|---|---|
| `updateEngineer` | 改名後 `value` 不變、`label` 更新 |
| `toggleEngineer` | 停用後 `isActive` 為 false 且不影響其他人員 |
| 人員引用檢查 | 被引用者不在 body 中 → 400 與 `ENGINEER_IN_USE`；未被引用者可正常移除；空字串 `testEngineer` 不誤判 |
| options round-trip | 停用狀態與 `value` 在 GET/PUT 之間不遺失 |
| 表單保底選項 | 孤兒值出現於選項且被選中；值在選項中時不重複插入；新增模式不插入 |
| TSV 轉換 | 欄位順序與標題正確；含 tab／換行的欄位不破壞結構；空清單不產生只有標題的誤導輸出 |
