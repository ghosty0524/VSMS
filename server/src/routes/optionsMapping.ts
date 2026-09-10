// server/src/routes/optionsMapping.ts
// PUT /api/options 是全刪重建：任何未被映射帶過去的欄位，
// 都會在使用者存下一次設定時被靜默重設。映射抽在此處以便測試守住此不變式。
import type { CategoryOption } from '../types.js'
// 白名單與正規化邏輯集中於 lib/statsMode.ts，此處僅 re-export 以維持既有
// import 路徑（integration.ts、測試皆從此檔匯入 normalizeStatsMode）。
export { normalizeStatsMode } from '../lib/statsMode.js'
import { normalizeStatsMode } from '../lib/statsMode.js'

interface CategoryRow {
  id: string
  value: string
  label: string
  isActive: boolean
  sortOrder: number
  statsMode: string
}

export function toCategoryResponse(row: CategoryRow): CategoryOption {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    statsMode: normalizeStatsMode(row.statsMode),
  }
}

export function toCategoryCreateData(c: CategoryOption) {
  return {
    id: c.id,
    value: c.value,
    label: c.label,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    statsMode: normalizeStatsMode(c.statsMode),
  }
}

import type { EngineerOption, TestUnitOption } from '../types.js'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** 只接受 #RRGGBB；其餘一律視為未自訂，避免把垃圾值寫進資料庫 */
function normalizeColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null
}

interface EngineerRow {
  id: string
  value: string
  label: string
  isActive: boolean
  sortOrder: number
  color: string | null
}

interface TestUnitRow extends Omit<EngineerRow, 'color'> {
  color: string | null
  department: string | null
  engineers: EngineerRow[]
}

/** trim 後空字串或非字串一律 null（清掉部門） */
export function normalizeDepartment(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v ? v : null
}

export function toEngineerResponse(row: EngineerRow): EngineerOption {
  return {
    id: row.id, value: row.value, label: row.label,
    isActive: row.isActive, sortOrder: row.sortOrder,
    color: normalizeColor(row.color),
  }
}

export function toTestUnitResponse(row: TestUnitRow): TestUnitOption {
  return {
    id: row.id, value: row.value, label: row.label,
    isActive: row.isActive, sortOrder: row.sortOrder,
    color: normalizeColor(row.color),
    department: row.department ?? null,
    engineers: row.engineers.map(toEngineerResponse),
  }
}

export function toEngineerCreateData(e: EngineerOption) {
  return {
    id: e.id, value: e.value, label: e.label,
    isActive: e.isActive, sortOrder: e.sortOrder,
    color: normalizeColor(e.color),
  }
}

/**
 * PUT 是全刪重建：body 沒帶 department 鍵（舊前端）要保留資料庫原值，
 * 所以由路由先讀舊值當 fallback 傳進來；帶了鍵就以 body 為準（含清空）。
 */
export function toTestUnitCreateData(u: TestUnitOption, fallbackDepartment: string | null) {
  return {
    id: u.id, value: u.value, label: u.label,
    isActive: u.isActive, sortOrder: u.sortOrder,
    color: normalizeColor(u.color),
    department: 'department' in u ? normalizeDepartment(u.department) : fallbackDepartment,
  }
}
