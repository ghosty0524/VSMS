export interface ResolvedRecipients {
  addresses: string[]
  /** 無法組成有效地址的原始 token，供 UI 提示管理者 */
  unresolved: string[]
}

// 半形/全形逗號、頓號、半形/全形分號，以及任何空白
const SEPARATORS = /[,，、;；\s]+/

const VALID_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * requiredPersonnel 是自由文字，內容為對齊後的公司帳號名。
 *
 * 已含 @ 的 token 原樣視為完整 email：對齊作業是人工進行的，過渡期必然出現
 * 混雜格式，硬拼 domain 會產出 wang@x.com@example.com 這種寄不出去又不易
 * 察覺的地址。
 */
export function resolveRecipients(raw: string, mailDomain: string): ResolvedRecipients {
  const addresses: string[] = []
  const unresolved: string[] = []
  const seen = new Set<string>()

  for (const token of (raw ?? '').split(SEPARATORS)) {
    const name = token.trim()
    if (!name) continue

    const candidate = name.includes('@') ? name : (mailDomain ? `${name}@${mailDomain}` : name)
    if (!VALID_ADDRESS.test(candidate)) {
      if (!unresolved.includes(name)) unresolved.push(name)
      continue
    }
    const key = candidate.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    addresses.push(candidate)
  }

  return { addresses, unresolved }
}

export interface RecipientPlanInput {
  /** 排程的需求人員欄位（自由文字，可含多人） */
  requiredPersonnel: string
  /** 排程的測試人員欄位（Schedule.testEngineer，單一值） */
  testEngineer: string
  /** 預設規則與單位規則串接後的固定副本原始字串 */
  ruleCcRaw: string
  /** 代收群組（Recipient 表）串接後的原始字串 */
  fallbackRaw: string
  mailDomain: string
}

export interface RecipientPlan {
  to: string[]
  cc: string[]
  /** true 表示需求人員無法對應，已改寄代收群組 */
  usingFallback: boolean
  /** 需求人員欄位中無法組成有效地址的原始 token */
  unresolved: string[]
}

/**
 * 決定一封通知信的收件人與副本。
 *
 * runner 與 preview 端都必須用這一支：兩邊若各自拼收件人，預覽畫面遲早會
 * 顯示出跟實際寄出不同的副本名單，比沒有預覽更糟。
 *
 * 副本一律帶入該排程的測試人員。代收情境（需求人員對應不出信箱）下規則的
 * 固定副本要清空——那批人不該收到寄錯對象的信；測試人員則保留，他是最有
 * 能力指出正確需求人員的人。
 */
export function planRecipients(input: RecipientPlanInput): RecipientPlan {
  const { mailDomain } = input
  const primary = resolveRecipients(input.requiredPersonnel, mailDomain)
  const usingFallback = primary.addresses.length === 0
  const to = usingFallback
    // 代收群組也要走同一支解析：Recipient.name 存的可能是帳號名而非完整信箱。
    ? resolveRecipients(input.fallbackRaw, mailDomain).addresses
    : primary.addresses

  // 測試人員對應不出地址就靜默略過，不擋整封信——與規則副本一致的處理方式。
  const engineer = resolveRecipients(input.testEngineer, mailDomain).addresses
  const ruleCc = usingFallback ? [] : resolveRecipients(input.ruleCcRaw, mailDomain).addresses

  // resolveRecipients 只在單次呼叫內去重，跨清單要自己來：測試人員很可能同時
  // 出現在規則副本裡，或本身就是需求人員，不去重就會對同一人重複寄送。
  const taken = new Set(to.map(a => a.toLowerCase()))
  const cc: string[] = []
  for (const address of [...ruleCc, ...engineer]) {
    const key = address.toLowerCase()
    if (taken.has(key)) continue
    taken.add(key)
    cc.push(address)
  }

  return { to, cc, usingFallback, unresolved: primary.unresolved }
}
