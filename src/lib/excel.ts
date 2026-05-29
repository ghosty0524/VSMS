import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { Schedule } from '../types'

// ─── 匯入相關型別 ────────────────────────────────────────────
export interface ImportRow {
  category?: unknown
  projectName?: unknown
  taskDescription?: unknown
  testUnit?: unknown
  testEngineer?: unknown
  timeResource?: unknown
  startDate?: unknown
  endDate?: unknown
  requiredPersonnel?: unknown
  testReport?: unknown
  isCompleted?: unknown
  isDelayed?: unknown
  delayReason?: unknown
}

export interface ImportError { row: number; messages: string[] }
export interface ImportResult {
  valid: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]
  errors: ImportError[]
}

// ─── 工具函式 ────────────────────────────────────────────────
function str(v: unknown): string { return v == null ? '' : String(v).trim() }
function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  const s = str(v).toUpperCase()
  return s === 'TRUE' || s === '1' || s === 'YES'
}
function dateToYMD(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}
const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/

function normDate(v: unknown): string {
  if (v instanceof Date) return dateToYMD(v)
  // 容許 YYYY-MM-DD（ISO）或 YYYY/MM/DD，統一轉為 YYYY/MM/DD
  const s = str(v).replace(/-/g, '/')
  return DATE_RE.test(s) ? s : str(v)
}

// ─── 匯入解析 ────────────────────────────────────────────────
export function parseImportRows(rows: ImportRow[]): ImportResult {
  const valid: ImportResult['valid'] = []
  const errors: ImportError[] = []
  rows.forEach((r, idx) => {
    const msgs: string[] = []
    const rowNum = idx + 1
    const category = str(r.category)
    const projectName = str(r.projectName)
    const taskDescription = str(r.taskDescription)
    const testUnit = str(r.testUnit)
    const testEngineer = str(r.testEngineer)
    const startDate = normDate(r.startDate)
    const endDate = normDate(r.endDate)
    const requiredPersonnel = str(r.requiredPersonnel)
    const testReport = str(r.testReport)
    const isCompleted = parseBool(r.isCompleted)
    const isDelayed = parseBool(r.isDelayed)
    const delayReason = str(r.delayReason)
    if (!category) msgs.push('category 為必填')
    if (!projectName) msgs.push('projectName 為必填')
    if (!testUnit) msgs.push('testUnit 為必填')
    if (!testEngineer) msgs.push('testEngineer 為必填')
    if (!startDate) msgs.push('startDate 為必填')
    else if (!DATE_RE.test(startDate)) msgs.push('startDate 格式錯誤（須為 YYYY/MM/DD 或 YYYY-MM-DD）')
    if (!endDate) msgs.push('endDate 為必填')
    else if (!DATE_RE.test(endDate)) msgs.push('endDate 格式錯誤（須為 YYYY/MM/DD 或 YYYY-MM-DD）')
    const trNum = Number(r.timeResource)
    if (!r.timeResource || isNaN(trNum) || !Number.isInteger(trNum) || trNum < 1)
      msgs.push('timeResource 須為正整數')
    if (startDate && endDate && startDate > endDate)
      msgs.push('endDate 不可早於 startDate')
    if (msgs.length > 0) { errors.push({ row: rowNum, messages: msgs }); return }
    valid.push({ category, projectName, taskDescription, testUnit, testEngineer,
      timeResource: trNum, startDate, endDate, requiredPersonnel, testReport,
      isCompleted, isDelayed, delayReason })
  })
  return { valid, errors }
}

export function parseImportFile(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<ImportRow>(ws, { defval: '' })
        resolve(parseImportRows(rows))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

// ─── 匯出範本 & 排程 ─────────────────────────────────────────
const HEADERS = ['category','projectName','taskDescription','testUnit','testEngineer',
  'timeResource','startDate','endDate','requiredPersonnel','testReport',
  'isCompleted','isDelayed','delayReason']

function applyDateFmt(ws: XLSX.WorkSheet, rowCount: number) {
  for (let row = 1; row <= rowCount; row++) {
    for (const col of [6, 7]) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col })
      if (ws[addr]) ws[addr].z = 'yyyy/mm/dd'
    }
  }
}

export function downloadTemplate(): void {
  const example = ['NPI','示範專案','工作內容說明','SIT-HW','Eric',5,
    '2026/05/01', '2026/05/31','需求人員名稱','測試報告連結','FALSE','FALSE','']
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, example])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule')
  XLSX.writeFile(wb, 'schedule_template.xlsx')
}

export function exportSchedules(schedules: Schedule[], selectedUnits?: string[]): void {
  const filtered = selectedUnits && selectedUnits.length > 0
    ? schedules.filter(s => selectedUnits.includes(s.testUnit))
    : schedules

  const rows = filtered.map(s => [
    s.category, s.projectName, s.taskDescription, s.testUnit, s.testEngineer,
    s.timeResource,
    s.startDate,
    s.endDate,
    s.requiredPersonnel, s.testReport,
    s.isCompleted ? 'TRUE' : 'FALSE', s.isDelayed ? 'TRUE' : 'FALSE', s.delayReason,
  ])
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule')

  const unitSuffix = selectedUnits && selectedUnits.length > 0
    ? `_${selectedUnits.join('-')}`
    : '_all'
  XLSX.writeFile(wb, `schedules${unitSuffix}_${new Date().toISOString().slice(0,10)}.xlsx`)
}

// ─────────────────────────────────────────────────────────────
// generateAgentExcel：產生給 Copilot Agent 讀取的結構化 Excel
// 三個工作表：排程資料、KPI 摘要、即將到期清單
// 與 Dashboard 匯出同步觸發，直接下載至本機
// ─────────────────────────────────────────────────────────────

// 計算排程狀態（對齊後端邏輯）
function computeStatus(s: Schedule): string {
  if (s.isCompleted) return 'Completed'
  if (s.isDelayed)   return 'Delayed'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(s.startDate.replace(/\//g, '-'))
  const end   = new Date(s.endDate.replace(/\//g, '-'))
  if (today >= start && today <= end) return 'Testing'
  return 'Planned'
}

// 計算距今剩餘天數
function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr.replace(/\//g, '-'))
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

// 設定表頭樣式（深色背景白字）
function styleHeader(row: ExcelJS.Row, color = '1E293B') {
  row.eachCell(cell => {
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FF' + color },
    }
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.border    = {
      top:    { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
  })
  row.height = 28
}

// 設定資料列樣式（斑馬紋）
function styleDataRow(row: ExcelJS.Row, isEven: boolean) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
    }
    cell.border = {
      top:    { style: 'hair', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
    cell.font      = { size: 11 }
    cell.alignment = { vertical: 'middle', wrapText: false }
  })
  row.height = 22
}

export async function generateAgentExcel(schedules: Schedule[]): Promise<void> {
  const wb      = new ExcelJS.Workbook()
  const today   = new Date()
  today.setHours(0, 0, 0, 0)
  const dateStr = today.toISOString().slice(0, 10)

  // ── 工作表一：排程資料 ─────────────────────────────────────
  const ws1 = wb.addWorksheet('排程資料', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws1.columns = [
    { key: 'status',            header: '狀態',          width: 12 },
    { key: 'category',          header: '工作類別',      width: 14 },
    { key: 'projectName',       header: '專案名稱',      width: 28 },
    { key: 'taskDescription',   header: '工作內容',      width: 36 },
    { key: 'testUnit',          header: '測試單位',      width: 12 },
    { key: 'testEngineer',      header: '測試人員',      width: 12 },
    { key: 'startDate',         header: '起始日期',      width: 14 },
    { key: 'endDate',           header: '完成日期',      width: 14 },
    { key: 'requiredPersonnel', header: '需求人員',      width: 20 },
    { key: 'testReport',        header: '測試報告',      width: 30 },
    { key: 'delayReason',       header: '延遲原因',      width: 30 },
    { key: 'timeResource',      header: '時間資源(Day)', width: 16 },
  ]

  styleHeader(ws1.getRow(1))

  schedules.forEach((s, i) => {
    const row = ws1.addRow({
      status:            computeStatus(s),
      category:          s.category,
      projectName:       s.projectName,
      taskDescription:   s.taskDescription,
      testUnit:          s.testUnit,
      testEngineer:      s.testEngineer,
      startDate:         s.startDate,
      endDate:           s.endDate,
      requiredPersonnel: s.requiredPersonnel,
      testReport:        s.testReport,
      delayReason:       s.delayReason || '',
      timeResource:      s.timeResource,
    })
    styleDataRow(row, i % 2 === 0)
  })

  // ── 工作表二：KPI 摘要 ─────────────────────────────────────
  const ws2 = wb.addWorksheet('KPI 摘要', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const total     = schedules.length
  const completed = schedules.filter(s => s.isCompleted).length
  const delayed   = schedules.filter(s => s.isDelayed).length
  const testing   = schedules.filter(s => computeStatus(s) === 'Testing').length
  const planned   = schedules.filter(s => computeStatus(s) === 'Planned').length
  const expiring7 = schedules.filter(s => {
    if (s.isCompleted) return false
    const days = daysUntil(s.endDate)
    return days >= 0 && days <= 7
  }).length

  // 各測試單位統計
  const unitMap: Record<string, {
    total: number; completed: number; delayed: number; testing: number
  }> = {}
  schedules.forEach(s => {
    if (!unitMap[s.testUnit]) {
      unitMap[s.testUnit] = { total: 0, completed: 0, delayed: 0, testing: 0 }
    }
    unitMap[s.testUnit].total++
    if (s.isCompleted)              unitMap[s.testUnit].completed++
    if (s.isDelayed)                unitMap[s.testUnit].delayed++
    if (computeStatus(s) === 'Testing') unitMap[s.testUnit].testing++
  })

  ws2.columns = [
    { key: 'metric', header: '指標', width: 28 },
    { key: 'value',  header: '數值', width: 16 },
    { key: 'note',   header: '說明', width: 36 },
  ]

  styleHeader(ws2.getRow(1))

  const kpiRows = [
    { metric: '資料更新時間',       value: new Date().toLocaleString('zh-TW'), note: '本次匯出時間' },
    { metric: '排程總數',           value: total,     note: '所有排程筆數' },
    { metric: 'Completed 數',      value: completed, note: `完成率 ${total ? ((completed/total)*100).toFixed(1) : 0}%` },
    { metric: 'Delayed 數',        value: delayed,   note: `延遲率 ${total ? ((delayed/total)*100).toFixed(1) : 0}%` },
    { metric: 'Testing 數',        value: testing,   note: '目前進行中' },
    { metric: 'Planned 數',        value: planned,   note: '尚未開始' },
    { metric: '7 天內到期',        value: expiring7, note: '非 Completed，需注意' },
    { metric: '',                   value: '',        note: '' },
    { metric: '── 各測試單位統計 ──', value: '',      note: '' },
    ...Object.entries(unitMap).map(([unit, stat]) => ({
      metric: unit,
      value:  stat.total,
      note:   `Completed: ${stat.completed} ／ Delayed: ${stat.delayed} ／ Testing: ${stat.testing}`,
    })),
  ]

  kpiRows.forEach((r, i) => {
    const row = ws2.addRow(r)
    if (r.metric === '' || r.metric.startsWith('──')) {
      row.getCell(1).font = { bold: true, color: { argb: 'FF64748B' }, size: 11 }
      row.height = 20
    } else {
      styleDataRow(row, i % 2 === 0)
    }
  })

  // ── 工作表三：即將到期清單（7 天內）──────────────────────
  const ws3 = wb.addWorksheet('即將到期', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws3.columns = [
    { key: 'projectName',  header: '專案名稱', width: 28 },
    { key: 'testUnit',     header: '測試單位', width: 14 },
    { key: 'testEngineer', header: '測試人員', width: 14 },
    { key: 'endDate',      header: '到期日期', width: 14 },
    { key: 'daysLeft',     header: '剩餘天數', width: 12 },
    { key: 'status',       header: '狀態',     width: 12 },
    { key: 'category',     header: '工作類別', width: 14 },
  ]

  styleHeader(ws3.getRow(1), '991B1B')  // 紅色表頭

  const expiringList = schedules
    .filter(s => {
      if (s.isCompleted) return false
      const days = daysUntil(s.endDate)
      return days >= 0 && days <= 7
    })
    .sort((a, b) => daysUntil(a.endDate) - daysUntil(b.endDate))

  if (expiringList.length === 0) {
    const row = ws3.addRow({
      projectName: '✅ 近 7 天內沒有即將到期的排程',
      testUnit: '', testEngineer: '', endDate: '',
      daysLeft: '', status: '', category: '',
    })
    row.getCell(1).font = { italic: true, color: { argb: 'FF64748B' }, size: 11 }
    row.height = 22
  } else {
    expiringList.forEach((s, i) => {
      const days = daysUntil(s.endDate)
      const row  = ws3.addRow({
        projectName:  s.projectName,
        testUnit:     s.testUnit,
        testEngineer: s.testEngineer,
        endDate:      s.endDate,
        daysLeft:     days === 0 ? '今日到期 ⚠️' : `${days} 天`,
        status:       computeStatus(s),
        category:     s.category,
      })
      styleDataRow(row, i % 2 === 0)

      // 剩餘 ≤ 2 天標紅
      if (days <= 2) {
        row.getCell('daysLeft').font = {
          bold: true, color: { argb: 'FF991B1B' }, size: 11,
        }
      }
    })
  }

  // ── 產生並下載檔案 ─────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `vsms_agent_${dateStr}.xlsx`)
}
