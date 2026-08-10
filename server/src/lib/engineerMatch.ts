// server/src/lib/engineerMatch.ts
// 工程師姓名解析：把使用者的口語稱呼（"darius"、"DARIUS"、"darius chang"）
// 對應回 VSMS 的正規姓名（Darius_Chang）。
//
// 為什麼需要這支：三個系統（VSMS testEngineer、VTMS assigneeName、SPM ABS
// LOGONID）都用 First_Last，但使用者不會這樣講。比對若讓呼叫端自行推測，
// 撞名時（will → Will_Wang / William_Wu / Willie_Lin）會靜默回傳錯的人。
// 因此比對規則放在後端且為確定性的，呼叫端只負責在多筆候選時詢問使用者。

export type MatchType = 'exact' | 'firstName' | 'lastName' | 'prefix' | 'contains'

export interface EngineerRecord {
  /** 穩定識別碼，即排程 testEngineer 存的值。改名時不會變動 */
  name: string
  /** 顯示名稱。人員改名只會改這個；省略時視為與 name 相同 */
  label?: string | null
  testUnit?: string | null
  /** 省略時視為在職。已停用者仍須查得到——歷史排程會提到他們 */
  isActive?: boolean
}

export interface EngineerMatch {
  /** 查詢 testEngineer 時使用這個值 */
  name: string
  /** 對使用者顯示時使用這個值 */
  label: string
  testUnit: string | null
  isActive: boolean
  matchType: MatchType
}

// 數字越小代表比對越強；也用於回傳排序
const RANK: Record<MatchType, number> = {
  exact: 0,
  firstName: 1,
  lastName: 2,
  prefix: 3,
  contains: 4,
}

/** 統一大小寫與分隔符：底線、空白、連字號等價 */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function classify(name: string, q: string): MatchType | null {
  const n = normalize(name)
  const segs = n.split('_').filter(Boolean)
  if (n === q) return 'exact'
  if (segs[0] === q) return 'firstName'
  if (segs[segs.length - 1] === q) return 'lastName'
  if (segs.some(s => s.startsWith(q))) return 'prefix'
  if (n.includes(q)) return 'contains'
  return null
}

/**
 * 依查詢字串找出候選工程師。
 *
 * 分層回傳，避免強比對被弱比對稀釋：
 * 1. 有完整姓名相符 → 只回那一筆
 * 2. 否則回「名相符／姓相符／任一段前綴相符」的聯集
 *    （will 會同時回 Will_Wang、William_Wu、Willie_Lin，讓呼叫端去問）
 * 3. 都沒有才退回子字串比對
 *
 * 結果依比對強度、再依姓名排序，確保順序穩定。
 */
export function matchEngineers(engineers: EngineerRecord[], query: string): EngineerMatch[] {
  const q = normalize(query)
  if (!q) return []

  const scored: EngineerMatch[] = []
  for (const e of engineers) {
    // value 與 label 都要比對：使用者可能用舊識別碼、也可能用改名後的顯示名稱。
    // 兩者都命中時取較強的那個。
    const label = e.label ?? e.name
    const byName = classify(e.name, q)
    const byLabel = label === e.name ? null : classify(label, q)
    const matchType =
      byName && byLabel ? (RANK[byName] <= RANK[byLabel] ? byName : byLabel) : byName ?? byLabel

    if (matchType) {
      scored.push({
        name: e.name,
        label,
        testUnit: e.testUnit ?? null,
        isActive: e.isActive ?? true,
        matchType,
      })
    }
  }

  const exact = scored.filter(x => x.matchType === 'exact')
  const strong = scored.filter(x => x.matchType !== 'exact' && x.matchType !== 'contains')
  const picked = exact.length > 0 ? exact : strong.length > 0 ? strong : scored

  // 序數比較（非 localeCompare）：C# 版必須產生完全相同的順序，
  // 兩邊的比對腳本才不會把排序差異報成不一致。
  return picked.sort(
    (a, b) => RANK[a.matchType] - RANK[b.matchType] || compareOrdinal(a.name, b.name),
  )
}

/** 與 C# StringComparer.Ordinal 一致的字串比較 */
export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
