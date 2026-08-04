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
