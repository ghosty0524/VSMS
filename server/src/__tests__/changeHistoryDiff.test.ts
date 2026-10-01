// server/src/__tests__/changeHistoryDiff.test.ts
// 差異函式是純函式；仍先 mock 掉 db 與 vtmsClient：changeHistory.ts 之後會 import 它們，
// 而 DATABASE_URL 指到唯一一份正式 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ prisma: {} }))
vi.mock('../lib/vtmsClient.js', () => ({ getTestPlanProgressBatch: vi.fn() }))

import {
  parsePdn, scheduleEntityLabel, diffSchedule, createChanges, SCHEDULE_FIELD_SPECS,
} from '../lib/changeHistory.js'
import { scheduleRow } from './helpers/scheduleRow.js'

describe('parsePdn（A／B／C 統一規則：/PDN[-_ ]?(\\d{6})(?!\\d)/i）', () => {
  it('取第一個匹配，輸出 PDN- 加六碼', () => {
    expect(parsePdn('PDN-250048 ECA-6710C')).toBe('PDN-250048')
    expect(parsePdn('ECA-6710C (PDN-250048 / PDN-250049)')).toBe('PDN-250048')
  })

  it('分隔可為空格、底線或沒有，不分大小寫，一律正規化成 PDN-六碼', () => {
    expect(parsePdn('pdn 250048 X')).toBe('PDN-250048')
    expect(parsePdn('PDN_250048 ECA-6710C')).toBe('PDN-250048')
    expect(parsePdn('PDN250048-ECA')).toBe('PDN-250048')
    expect(parsePdn('pdn-250048 rework')).toBe('PDN-250048')
  })

  it('第 7 位還是數字就不算；後面若有合格的會取到那一個', () => {
    expect(parsePdn('PDN2500481')).toBeNull()
    expect(parsePdn('PDN-2500481 ECA')).toBeNull()
    expect(parsePdn('PDN2500481 / PDN-250049')).toBe('PDN-250049')
  })

  it('解析不出時回 null', () => {
    expect(parsePdn('PDN 待 PM 提供')).toBeNull()
    expect(parsePdn('PDN-12345')).toBeNull()
    expect(parsePdn('PDN--250048')).toBeNull()
    expect(parsePdn('')).toBeNull()
    expect(parsePdn(null)).toBeNull()
  })
})

describe('scheduleEntityLabel', () => {
  it('專案名稱 / 類別 / 測試人員', () => {
    expect(scheduleEntityLabel(scheduleRow())).toBe('PDN-250048 ECA-6710C / NPI / Lily_Lee')
  })

  it('空的段落省略：測試人員空白時省略該段，類別空白時同樣省略', () => {
    expect(scheduleEntityLabel(scheduleRow({ testEngineer: '' }))).toBe('PDN-250048 ECA-6710C / NPI')
    expect(scheduleEntityLabel(scheduleRow({ testEngineer: '   ' }))).toBe('PDN-250048 ECA-6710C / NPI')
    expect(scheduleEntityLabel(scheduleRow({ category: '' }))).toBe('PDN-250048 ECA-6710C / Lily_Lee')
  })

  it('不含任務說明或任何手填文字', () => {
    const label = scheduleEntityLabel(scheduleRow({
      taskDescription: '任務說明-機密', requiredPersonnel: '需求人員-機密', delayReason: '延遲原因-機密',
      testReport: '報告-機密', adminFlagNote: '主管備註-機密', userFlagNote: '使用者備註-機密',
    }))
    expect(label).toBe('PDN-250048 ECA-6710C / NPI / Lily_Lee')
    expect(label).not.toMatch(/機密/)
  })
})

describe('diffSchedule', () => {
  it('記值欄位存前後值，依規格表順序', () => {
    const before = scheduleRow()
    const after = scheduleRow({ endDate: '2026/10/17', testEngineer: 'Will_Wang', timeResource: 8 })
    expect(diffSchedule(before, after)).toEqual([
      { field: 'testEngineer', label: '測試人員', before: 'Lily_Lee', after: 'Will_Wang' },
      { field: 'timeResource', label: '工時', before: 5, after: 8 },
      { field: 'endDate', label: '結束日', before: '2026/10/03', after: '2026/10/17' },
    ])
  })

  it('勾選欄位存「是／否」', () => {
    expect(diffSchedule(scheduleRow(), scheduleRow({ isCompleted: true, adminFlag: true }))).toEqual([
      { field: 'isCompleted', label: '完成', before: '否', after: '是' },
      { field: 'adminFlag', label: '主管旗標', before: '否', after: '是' },
    ])
  })

  it('手填欄位只記有改，changes 不含任何原文', () => {
    const before = scheduleRow({ delayReason: '舊的延遲原因-機密A', adminFlagNote: '舊備註-機密B' })
    const after = scheduleRow({
      taskDescription: '新的任務說明-機密C',
      requiredPersonnel: 'Kevin_Yu-機密D',
      delayReason: '新的延遲原因-機密E',
      testReport: '\\\\nas\\report-機密F.docx',
      adminFlagNote: '新備註-機密G',
      userFlagNote: '使用者備註-機密H',
    })
    const changes = diffSchedule(before, after)
    expect(changes).toEqual([
      { field: 'taskDescription', label: '任務說明', changed: true },
      { field: 'requiredPersonnel', label: '需求人員', changed: true },
      { field: 'delayReason', label: '延遲原因', changed: true },
      { field: 'testReport', label: '測試報告', changed: true },
      { field: 'adminFlagNote', label: '主管旗標備註', changed: true },
      { field: 'userFlagNote', label: '使用者旗標備註', changed: true },
    ])
    const json = JSON.stringify(changes)
    expect(json).not.toMatch(/機密/)
    expect(json).not.toContain(before.taskDescription)
    expect(json).not.toContain(before.requiredPersonnel)
  })

  it('沒有任何變動回空陣列', () => {
    expect(diffSchedule(scheduleRow(), scheduleRow())).toEqual([])
  })

  it('NULL 與空字串視為相同（旗標備註 DB 是 NULL、前端送空字串）', () => {
    expect(diffSchedule(
      scheduleRow({ adminFlagNote: null, userFlagNote: null }),
      scheduleRow({ adminFlagNote: '', userFlagNote: '' }),
    )).toEqual([])
  })

  it('空值顯示為 null', () => {
    expect(diffSchedule(scheduleRow({ device: '' }), scheduleRow({ device: 'Chamber-B' }))).toEqual([
      { field: 'device', label: '設備', before: null, after: 'Chamber-B' },
    ])
  })

  it('VTMS 關聯計畫存計畫名稱；查不到名稱時退回存 id', () => {
    expect(diffSchedule(
      scheduleRow({ vtmsPlanId: 'plan-old' }),
      scheduleRow({ vtmsPlanId: 'plan-new' }),
      { 'plan-new': 'EMC 預測試計畫' },
    )).toEqual([
      { field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: 'plan-old', after: 'EMC 預測試計畫' },
    ])
  })

  it('規格表涵蓋所有可寫欄位與 vtmsPlanId（新增可寫欄位時要一起加）', () => {
    expect(SCHEDULE_FIELD_SPECS.map(s => s.field).sort()).toEqual([
      'adminFlag', 'adminFlagNote', 'category', 'delayReason', 'device', 'endDate',
      'isCancelled', 'isCompleted', 'isDelayed', 'projectName', 'requiredPersonnel',
      'startDate', 'taskDescription', 'testEngineer', 'testReport', 'testUnit',
      'timeResource', 'userFlag', 'userFlagNote', 'vtmsPlanId',
    ])
  })
})

describe('createChanges', () => {
  it('只列八個關鍵欄位的初始值，before 為 null', () => {
    expect(createChanges(scheduleRow())).toEqual([
      { field: 'category', label: '類別', before: null, after: 'NPI' },
      { field: 'projectName', label: '專案名稱', before: null, after: 'PDN-250048 ECA-6710C' },
      { field: 'device', label: '設備', before: null, after: 'Chamber-A' },
      { field: 'testUnit', label: '測試單位', before: null, after: 'EMC' },
      { field: 'testEngineer', label: '測試人員', before: null, after: 'Lily_Lee' },
      { field: 'timeResource', label: '工時', before: null, after: 5 },
      { field: 'startDate', label: '開始日', before: null, after: '2026/10/01' },
      { field: 'endDate', label: '結束日', before: null, after: '2026/10/03' },
    ])
  })
})
