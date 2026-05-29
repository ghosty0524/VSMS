import type { Schedule, OptionsMap } from '../types'
import { DASHBOARD_CSS } from './styles'
import { DASHBOARD_JS } from './script'
import { UNIT_COLORS, EXTRA_COLORS, OVERFLOW_COLOR } from '../constants'

function getUnitColor(unit: string, allUnits: string[]): string {
  if (UNIT_COLORS[unit]) return UNIT_COLORS[unit]
  const extras = allUnits.filter(u => !UNIT_COLORS[u])
  return EXTRA_COLORS[extras.indexOf(unit) % EXTRA_COLORS.length]
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// ✅ 風格B 下拉選單
function buildMultiSelect(id: string, items: string[], label: string): string {
  const options = items
    .map(v => `
      <label class="multi-select-option">
        <input type="checkbox" value="${escapeAttr(v)}"> ${escapeAttr(v)}
      </label>`)
    .join('')
  return `
    <div class="filter-group">
      <label>${label}</label>
      <div class="multi-select">
        <div class="multi-select-trigger" id="${id}-trigger">
          <span class="trigger-label">全部</span>
          <span class="trigger-badge" id="${id}-badge" style="display:none">0</span>
          <span class="trigger-arrow">▾</span>
        </div>
        <div class="multi-select-dropdown" id="${id}-dropdown">
          <div class="dropdown-search">
            <input type="text" placeholder="搜尋…" id="${id}-search">
          </div>
          <div class="dropdown-options" id="${id}-options">${options}</div>
          <div class="dropdown-footer">
            <span class="dropdown-count" id="${id}-count">共 ${items.length} 項</span>
            <button type="button" id="${id}-clear">清除</button>
          </div>
        </div>
      </div>
    </div>`
}

const ALL_STATUSES = ['Completed', 'Delayed', 'Testing', 'Planned'] as const

export function generateDashboardHTML(schedules: Schedule[], options: OptionsMap): string {
  const activeCategories = options.categories.filter(c => c.isActive).map(c => c.value)
  const activeUnits = options.testUnits.filter(u => u.isActive).map(u => u.value)
  const allEngineers = Array.from(new Set(
    options.testUnits.flatMap(u => u.engineers.filter(e => e.isActive).map(e => e.value))
  ))
  const exportTime = new Date().toLocaleString('zh-TW')
  const dataJson = JSON.stringify(schedules)
  const optionsJson = JSON.stringify(options)

  const legendItems = activeUnits.map(u => {
    const color = getUnitColor(u, activeUnits)
    return `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeAttr(u)}</span>`
  }).join('')
  // ★ 溢出色圖例
  + `<span class="legend-item"><span class="legend-dot" style="background:${OVERFLOW_COLOR}"></span>超出時間資源</span>`

  const statusCheckboxes = ALL_STATUSES.map(s =>
    `<label><input type="checkbox" class="status-cb" value="${s}"${s !== 'Completed' ? ' checked' : ''}> <span class="status-badge status-${s}">${s}</span></label>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Validation 專案排程表</title>
<style>${DASHBOARD_CSS}</style>
</head>
<body>
<header>
  <h1>Validation 專案排程表</h1>
  <span class="export-time">匯出時間：${exportTime}</span>
</header>

<div class="filters">
  ${buildMultiSelect('cat', activeCategories, '工作類別')}
  ${buildMultiSelect('unit', activeUnits, '測試單位')}
  ${buildMultiSelect('eng', allEngineers, '測試人員')}
  <div class="filter-group">
    <label>關鍵字搜尋</label>
    <input type="text" id="search-input" placeholder="專案名稱、工作內容…">
  </div>
  <div class="filter-group">
    <label>起始日期</label>
    <input type="date" id="start-from">
  </div>
  <div class="filter-group">
    <label>結束日期</label>
    <input type="date" id="end-from">
  </div>
  <button type="button" class="clear-btn" id="clear-filters">清除所有篩選</button>
</div>

<div class="status-filter">
  <span>顯示狀態：</span>
  ${statusCheckboxes}
</div>

<div class="gantt-section">
  <div class="gantt-legend">${legendItems}</div>
  <!-- ✅ 收合控制列 -->
  <div class="gantt-toggle" id="gantt-toggle">
    <span>甘特圖</span>
    <span class="gantt-toggle-arrow" id="gantt-toggle-arrow">▲ 收合</span>
  </div>
  <!-- ★ 四象限凍結窗格容器 -->
  <div class="gantt-scroll" id="gantt-scroll"
       style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;">
    <div id="gantt-container"
         style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;">
    </div>
  </div>
</div>

<div id="gantt-tooltip" class="gantt-tooltip" style="display:none"></div>
<!-- ✅ 左側欄位 Tooltip -->
<div id="row-tooltip" class="row-tooltip"></div>

<div class="list-section">
  <h2>排程列表</h2>
  <div style="overflow-x:auto">
    <table class="list-table">
      <thead>
        <tr>
          <th>狀態</th>
          <th data-sort="category">工作類別<span class="sort-indicator"></span></th>
          <th>專案名稱</th>
          <th>工作內容</th>
          <th data-sort="testUnit">測試單位<span class="sort-indicator"></span></th>
          <th>測試人員</th>
          <th data-sort="startDate">起始日期<span class="sort-indicator"></span></th>
          <th data-sort="endDate">完成日期<span class="sort-indicator"></span></th>
          <th>需求人員</th>
          <th>測試報告</th>
        </tr>
      </thead>
      <tbody id="list-tbody"></tbody>
    </table>
  </div>
</div>

<div class="modal-overlay" id="modal-overlay">
  <div class="modal">
    <button type="button" class="modal-close" id="modal-close">✕</button>
    <h2>工作排程詳細資訊</h2>
    <div id="modal-body"></div>
  </div>
</div>

<script>
var SCHEDULE_DATA = ${dataJson};
var OPTIONS = ${optionsJson};
${DASHBOARD_JS}
</script>
</body>
</html>`
}