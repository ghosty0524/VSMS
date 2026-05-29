export const DASHBOARD_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
  background: #f1f5f9;
  color: #1e293b;
  font-size: 14px;
  line-height: 1.5;
}

/* ════════════════════════════════════════
   HEADER
════════════════════════════════════════ */
header {
  background: #1e293b;
  border-bottom: 1px solid #0f172a;
  padding: 14px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
header h1 {
  font-size: 17px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: 0.02em;
}
header .export-time {
  font-size: 13px;
  color: #94a3b8;
}

/* ════════════════════════════════════════
   篩選列
   ★ 所有控件統一 36px 高度 + 底部對齊
════════════════════════════════════════ */
.filters {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 12px 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: flex-end;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.filter-group label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  line-height: 1;
  height: 13px;
}

/* ★ 共用規則：input / trigger / 清除按鈕全部統一 */
.filter-group input[type=text],
.filter-group input[type=date],
.multi-select-trigger,
.clear-btn {
  height: 36px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 14px;
  font-family: inherit;
  line-height: 34px;
  min-width: 130px;
  outline: none;
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: border-color .15s, box-shadow .15s;
}
.filter-group input[type=text]:focus,
.filter-group input[type=date]:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
}
.filter-group input::placeholder { color: #94a3b8; }

/* 清除按鈕（差異覆寫） */
.clear-btn {
  min-width: unset;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  border-color: #fca5a5;
  color: #ef4444;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
.clear-btn:hover { background: #fef2f2; border-color: #f87171; }

/* ════════════════════════════════════════
   多選下拉（風格 B）
════════════════════════════════════════ */
.multi-select { position: relative; }

/* ★ 外觀由共用規則定義，此處只加行為樣式 */
.multi-select-trigger {
  cursor: pointer;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.multi-select-trigger:hover { border-color: #3b82f6; }
.multi-select-trigger.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
}
.trigger-label { flex: 1; color: #334155; font-size: 14px; }
.trigger-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  color: #fff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
}
.trigger-arrow {
  color: #94a3b8;
  font-size: 11px;
  transition: transform .15s;
}
.multi-select-trigger.active .trigger-arrow { transform: rotate(180deg); }

.multi-select-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  z-index: 100;
  min-width: 190px;
  max-height: 280px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  overflow: hidden;
}
.multi-select-dropdown.open { display: flex; flex-direction: column; }

.dropdown-search {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
}
.dropdown-search input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
  outline: none;
  color: #1e293b;
}
.dropdown-search input:focus { border-color: #3b82f6; }

.dropdown-options { overflow-y: auto; max-height: 200px; }

.multi-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  transition: background .1s;
  color: #334155;
}
.multi-select-option:hover { background: #f0f7ff; }
.multi-select-option input[type=checkbox] {
  accent-color: #3b82f6;
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
.multi-select-option.checked {
  background: #eff6ff;
  font-weight: 600;
  color: #1e40af;
}

.dropdown-footer {
  padding: 7px 12px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dropdown-footer button {
  font-size: 12px;
  color: #3b82f6;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-weight: 600;
}
.dropdown-footer button:hover { text-decoration: underline; }
.dropdown-count { font-size: 12px; color: #94a3b8; }

/* ════════════════════════════════════════
   狀態列（對齊管理介面 Tab 風格）
════════════════════════════════════════ */
.status-filter {
  background: #1e293b;
  border-bottom: 1px solid #0f172a;
  padding: 8px 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.status-filter > span {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.status-filter label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 500;
  transition: color .15s;
}
.status-filter label:hover { color: #fff; }
.status-filter input[type=checkbox] {
  accent-color: #3b82f6;
  width: 14px;
  height: 14px;
}

/* ════════════════════════════════════════
   甘特圖區塊
   ★ 四象限凍結窗格佈局
════════════════════════════════════════ */
.gantt-section {
  margin: 16px 20px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  min-height: 320px;
}
.gantt-section:has(.gantt-scroll.collapsed) {
  height: auto;
  min-height: unset;
}

.gantt-legend {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}
.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  display: inline-block;
  flex-shrink: 0;
}

.gantt-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  cursor: pointer;
  user-select: none;
  transition: background .15s;
}
.gantt-toggle:hover { background: #f1f5f9; }
.gantt-toggle > span:first-child {
  font-size: 14px;
  font-weight: 700;
  color: #475569;
}
.gantt-toggle-arrow {
  font-size: 13px;
  color: #94a3b8;
}

.gantt-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.gantt-scroll.collapsed { display: none; }

.gantt-tooltip {
  position: fixed;
  background: #1e293b;
  color: #f1f5f9;
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 10px;
  pointer-events: none;
  z-index: 200;
  max-width: 300px;
  line-height: 1.7;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

.row-tooltip {
  position: fixed;
  background: #1e293b;
  color: #f1f5f9;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  pointer-events: none;
  z-index: 201;
  max-width: 340px;
  line-height: 1.7;
  display: none;
  white-space: pre-wrap;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

/* ════════════════════════════════════════
   狀態 Badge
════════════════════════════════════════ */
.status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.status-Completed { background: #d1fae5; color: #065f46; }
.status-Delayed   { background: #fee2e2; color: #991b1b; }
.status-Testing   { background: #dbeafe; color: #1e40af; }
.status-Planned   { background: #f1f5f9; color: #475569; }

/* ════════════════════════════════════════
   排程列表
════════════════════════════════════════ */
.list-section {
  margin: 0 20px 24px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  overflow: hidden;
}
.list-section h2 {
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.list-table th {
  background: #f1f5f9;
  padding: 10px 12px;
  text-align: left;
  font-weight: 700;
  font-size: 13px;
  color: #334155;
  border-bottom: 2px solid #e2e8f0;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.list-table th:hover { background: #e2e8f0; }
.list-table td {
  padding: 9px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
  font-size: 14px;
}
.list-table tr:hover td {
  background: #f8fafc;
  cursor: pointer;
}
.sort-indicator { margin-left: 4px; color: #94a3b8; }

.unit-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.no-data {
  padding: 48px;
  text-align: center;
  color: #94a3b8;
  font-size: 15px;
}

/* ════════════════════════════════════════
   Modal
════════════════════════════════════════ */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 300;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(2px);
}
.modal-overlay.open { display: flex; }
.modal {
  background: #fff;
  border-radius: 12px;
  padding: 28px;
  max-width: 580px;
  width: 100%;
  max-height: 82vh;
  overflow-y: auto;
  box-shadow: 0 24px 48px rgba(0,0,0,0.22);
}
.modal h2 {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 18px;
  color: #1e293b;
}
.modal-close {
  float: right;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #94a3b8;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color .15s, background .15s;
}
.modal-close:hover { color: #1e293b; background: #f1f5f9; }

.modal-field { margin-bottom: 14px; }
.modal-field .field-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.modal-field .field-value {
  font-size: 15px;
  color: #1e293b;
  white-space: pre-wrap;
  line-height: 1.6;
}

/* ════════════════════════════════════════
   休息日列
════════════════════════════════════════ */
.list-table tr.rest-day td {
  background: rgba(0,0,0,0.035) !important;
}
.list-table tr.rest-day:hover td {
  background: rgba(0,0,0,0.065) !important;
}

/* ════════════════════════════════════════
   RWD
════════════════════════════════════════ */
@media (max-width: 768px) {
  .filters { flex-direction: column; }
  .filter-group { width: 100%; }
  .filter-group input,
  .multi-select-trigger { min-width: unset; width: 100%; }
  header h1 { font-size: 15px; }
  .gantt-section,
  .list-section { margin-left: 12px; margin-right: 12px; }
}
`