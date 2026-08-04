// server/src/lib/statsMode.ts
// 統計模式白名單與正規化，供 lib/workload.ts 與 routes/optionsMapping.ts 共用，
// 避免同一份清單散落多處而漏改。routes/ 依賴 lib/，方向不可反過來。
import type { CategoryStatsMode } from '../types.js'

export const VALID_STATS_MODES: readonly CategoryStatsMode[] = ['counted', 'workload_only', 'excluded']

// 查無對應或非法值一律視為 counted，寧可多算也不誤落入其他分支。
export function normalizeStatsMode(value: unknown): CategoryStatsMode {
  return VALID_STATS_MODES.includes(value as CategoryStatsMode)
    ? (value as CategoryStatsMode)
    : 'counted'
}
