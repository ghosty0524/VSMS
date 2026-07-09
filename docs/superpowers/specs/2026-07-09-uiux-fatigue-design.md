# UI/UX 視覺疲勞降低調整設計

日期：2026-07-09
狀態：已與需求方確認執行

## 目標

在不改變版面結構與操作流程的前提下，降低長時間使用的視覺疲勞、提升舒適度。
深色模式**不在本次範圍**（需先完成色彩變數化，另立一期）。

## 調整項目

1. **最小字級提升**（甘特圖）：
   - 週刻度、星期標記 SVG `fontSize` 10 → 11
   - Bar 內工程師名 11 → 12
   - 左側清單狀態籤 `text-[11px]` → `text-xs`(12px)、任務說明 `text-[11px]` → `text-xs`
   - 「今日」標籤 10 → 11（同步放大紅色標籤矩形）
   - 狀態籤寬 72px → 84px，任務說明縮排 86px → 98px 以容納字級與狀態圖示

2. **降低大面積純白**：甘特圖 SVG 本體底色 `#ffffff` → `#fafbfc`，
   斑馬紋偶數列維持、奇數列 `#f8fafc` → `#f1f5f9`（左右兩側同步），圖例列 `bg-white` → `bg-slate-50`。

3. **休息日去紅字**：表頭星期標記休息日由紅字(`#ef4444`)改為表頭欄位淡灰底
   （`rgba(100,116,139,.14)`）+ `#64748b` 粗體字。紅色只保留給「今日」線與 Delayed。

4. **狀態非顏色指示**：狀態籤文字前加符號（Completed ✓、Delayed !、Testing ▶、Planned ○），
   不再僅靠底色區分。

5. **錯誤 Toast 不自動消失**：`Header` toast 之 `error` 類型停留至手動關閉；
   success/info 維持自動消失。

6. **Session 逾時前提醒**：前端追蹤最後一次 API 活動時間，逾時前 3 分鐘顯示提醒
   （「閒置過久即將自動登出」+「繼續使用」按鈕，點擊呼叫 `/api/me` 刷新 session）。
   `/api/me` 回應加入 `sessionTimeoutMin` 供前端取得實際逾時設定（預設 30）。

7. **偏好持久化**：甘特圖左欄寬 `ganttLeftWidth` 由 sessionStorage 改 localStorage，
   登出不再清除（顯示偏好，非敏感資料）。

8. **Modal 鍵盤支援**：共用 `useEscapeKey` hook；ScheduleFormModal、ExcelImportModal、
   ExportExcelModal、DeleteConfirmDialog 支援 Esc 關閉；DeleteConfirmDialog 開啟時
   焦點落在「取消」按鈕（防誤按確認）。

9. **載入狀態**：「連線中…」「載入資料中…」改為 spinner + 文字。

## 不做的事

- 不動版面結構、不動篩選/排序邏輯、不動甘特圖互動
- 不做深色模式、不做密度切換（先以 12px 下限驗證接受度）
- 頁面底色 `bg-gray-100` 維持（已非純白，變動需視覺迭代）

## 驗證

- `npm run build` + `npm run test:all` 通過
- dev server 實機截圖確認甘特圖字級/休息日/狀態籤呈現無跑版
