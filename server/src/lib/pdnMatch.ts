//
// 排程的 projectName 就是 PDN；VTMS 專案的 name 也是 PDN，但兩邊都是自由
// 文字。這裡只做 trim + 不分大小寫的相等判斷；找不到時列出互相包含的名稱
// 給使用者自己看（例如少打一碼），不做任何自動修正，也不擋儲存。

export type PdnCheck =
  | { status: 'found'; name: string; planCount: number }
  | { status: 'not_found'; similar: string[] }

export const SIMILAR_LIMIT = 5

const norm = (s: string) => s.trim().toLowerCase()

export function matchPdn(pdn: string, projects: { name: string; planCount: number }[]): PdnCheck {
  const key = norm(pdn)
  if (!key) return { status: 'not_found', similar: [] }

  const exact = projects.find(p => norm(p.name) === key)
  if (exact) return { status: 'found', name: exact.name, planCount: exact.planCount }

  // 太短的輸入（例如打到一半就離開欄位）會匹配到一大堆不相干的名稱，不列相近
  if (key.length < 3) return { status: 'not_found', similar: [] }

  const similar = projects
    .filter(p => {
      const n = norm(p.name)
      return n.length > 0 && (n.includes(key) || key.includes(n))
    })
    .map(p => p.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, SIMILAR_LIMIT)

  return { status: 'not_found', similar }
}
