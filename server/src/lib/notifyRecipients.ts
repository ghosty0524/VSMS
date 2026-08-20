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
