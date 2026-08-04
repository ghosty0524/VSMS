import { describe, it, expect } from 'vitest'
import { schedulesToTsv, schedulesToHtmlTable } from '../lib/clipboardTable'
import type { Schedule } from '../types'

function makeSchedule(over: Partial<Schedule>): Schedule {
  return {
    id: '1', category: 'NPI', projectName: 'P', taskDescription: '', testUnit: 'SIT-HW',
    testEngineer: 'eric', timeResource: 5, startDate: '2026/01/05', endDate: '2026/01/09',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
    ...over,
  }
}

const identityLabel = (v: string) => v

describe('schedulesToTsv', () => {
  it('第一列為標題列，欄位與順序同列表顯示的十欄（不含操作欄）', () => {
    const tsv = schedulesToTsv([makeSchedule({})], identityLabel)
    const [header] = tsv.split('\n')
    expect(header.split('\t')).toEqual([
      '狀態', '工作類別', 'PDN Number', '工作內容', '測試單位', '測試人員',
      '起始日', '完成日', '需求人員', '測試報告',
    ])
  })

  it('狀態欄輸出狀態文字，不含符號', () => {
    const tsv = schedulesToTsv([makeSchedule({ isCompleted: true })], identityLabel)
    const dataRow = tsv.split('\n')[1]
    expect(dataRow.split('\t')[0]).toBe('Completed')
  })

  it('測試人員欄使用 engLabel 轉換後的顯示名稱', () => {
    const tsv = schedulesToTsv(
      [makeSchedule({ testEngineer: 'eric' })],
      (v) => (v === 'eric' ? 'Eric Wang' : v),
    )
    const dataRow = tsv.split('\n')[1]
    expect(dataRow.split('\t')[5]).toBe('Eric Wang')
  })

  it('欄位內含 tab 時替換為空白，不破壞表格結構', () => {
    const tsv = schedulesToTsv(
      [makeSchedule({ taskDescription: 'foo\tbar' })],
      identityLabel,
    )
    const dataRow = tsv.split('\n')[1]
    const cells = dataRow.split('\t')
    // 十欄，不因欄位內的 tab 被拆成十一欄以上
    expect(cells).toHaveLength(10)
    expect(cells[3]).toBe('foo bar')
  })

  it('欄位內含換行時替換為空白，不新增列', () => {
    const tsv = schedulesToTsv(
      [makeSchedule({ taskDescription: 'line1\nline2\r\nline3' })],
      identityLabel,
    )
    const lines = tsv.split('\n')
    // 標題列 + 1 筆資料列，換行沒有把資料炸成多列
    expect(lines).toHaveLength(2)
    expect(lines[1].split('\t')[3]).toBe('line1 line2 line3')
  })

  it('空清單不產生只有標題列的誤導輸出', () => {
    const tsv = schedulesToTsv([], identityLabel)
    expect(tsv).toBe('')
  })

  it('輸入的每一列都出現在輸出中（虛擬化陷阱的防迴歸測試）', () => {
    const schedules = Array.from({ length: 250 }, (_, i) =>
      makeSchedule({ id: String(i), projectName: `PDN-${i}` }),
    )
    const tsv = schedulesToTsv(schedules, identityLabel)
    const lines = tsv.split('\n')
    expect(lines).toHaveLength(251) // 標題 + 250 筆，即使遠超畫面可視列數
    for (const s of schedules) {
      expect(tsv).toContain(s.projectName)
    }
  })

  it('日期欄原樣輸出', () => {
    const tsv = schedulesToTsv(
      [makeSchedule({ startDate: '2026/03/01', endDate: '2026/03/10' })],
      identityLabel,
    )
    const cells = tsv.split('\n')[1].split('\t')
    expect(cells[6]).toBe('2026/03/01')
    expect(cells[7]).toBe('2026/03/10')
  })
})

describe('schedulesToHtmlTable', () => {
  it('標題列文字與順序同 TSV', () => {
    const html = schedulesToHtmlTable([makeSchedule({})], identityLabel)
    const headerCells = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(m => m[1])
    expect(headerCells).toEqual([
      '狀態', '工作類別', 'PDN Number', '工作內容', '測試單位', '測試人員',
      '起始日', '完成日', '需求人員', '測試報告',
    ])
  })

  it('輸出結構為 <table> 內含 <thead> 與 <tbody>', () => {
    const html = schedulesToHtmlTable([makeSchedule({})], identityLabel)
    expect(html).toMatch(/<table[^>]*>[\s\S]*<thead>[\s\S]*<\/thead>[\s\S]*<tbody>[\s\S]*<\/tbody>[\s\S]*<\/table>/)
  })

  it('儲存格內的 &、< 與 > 會被跳脫，不破壞表格結構', () => {
    const html = schedulesToHtmlTable(
      [makeSchedule({ taskDescription: 'A<B> & C' })],
      identityLabel,
    )
    expect(html).toContain('A&lt;B&gt; &amp; C')
    expect(html).not.toContain('A<B> & C')
  })

  it('儲存格內含 tab 或換行不破壞列結構（僅一個 <tr> 對應一筆資料）', () => {
    const html = schedulesToHtmlTable(
      [makeSchedule({ taskDescription: 'line1\nline2\ttab\r\nline3' })],
      identityLabel,
    )
    const bodyMatch = html.match(/<tbody>([\s\S]*)<\/tbody>/)
    expect(bodyMatch).not.toBeNull()
    const trCount = (bodyMatch![1].match(/<tr>/g) ?? []).length
    expect(trCount).toBe(1)
  })

  it('輸入的每一列都出現在輸出中（虛擬化陷阱的防迴歸測試）', () => {
    const schedules = Array.from({ length: 250 }, (_, i) =>
      makeSchedule({ id: String(i), projectName: `PDN-${i}` }),
    )
    const html = schedulesToHtmlTable(schedules, identityLabel)
    const trCount = (html.match(/<tr>/g) ?? []).length
    // 250 筆資料列 + 1 列標題列
    expect(trCount).toBe(251)
    for (const s of schedules) {
      expect(html).toContain(s.projectName)
    }
  })

  it('空清單回傳空字串', () => {
    const html = schedulesToHtmlTable([], identityLabel)
    expect(html).toBe('')
  })
})
