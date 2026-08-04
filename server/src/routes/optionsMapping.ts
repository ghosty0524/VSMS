// server/src/routes/optionsMapping.ts
// PUT /api/options 是全刪重建：任何未被映射帶過去的欄位，
// 都會在使用者存下一次設定時被靜默重設。映射抽在此處以便測試守住此不變式。
import type { CategoryOption, CategoryStatsMode } from '../types.js'

const VALID_STATS_MODES: readonly CategoryStatsMode[] = ['counted', 'workload_only', 'excluded']

export function normalizeStatsMode(value: unknown): CategoryStatsMode {
  return VALID_STATS_MODES.includes(value as CategoryStatsMode)
    ? (value as CategoryStatsMode)
    : 'counted'
}

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
  engineers: EngineerRow[]
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

export function toTestUnitCreateData(u: TestUnitOption) {
  return {
    id: u.id, value: u.value, label: u.label,
    isActive: u.isActive, sortOrder: u.sortOrder,
    color: normalizeColor(u.color),
  }
}
