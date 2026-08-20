export interface NotifyRuleRow {
  id: string
  /** null = 預設規則 */
  testUnit: string | null
  enabled: boolean
  /** null = 沿用預設規則；空字串 = 刻意留白 */
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
  ccRecipients: string
}

export interface ResolvedRule {
  enabled: boolean
  subject: string
  intro: string
  outro: string
  /** 預設副本與單位副本串接後的原始字串，交給 resolveRecipients 切分去重 */
  ccRaw: string
}

/**
 * 覆寫式繼承：單位規則欄位為 null 時沿用預設規則。
 *
 * 刻意不做成複製式（每單位一份完整範本）—— 那樣共同措辭改一次要改 N 次，
 * 各單位內容必然逐漸漂移。
 */
export function resolveRule(testUnit: string, rules: NotifyRuleRow[]): ResolvedRule | null {
  const fallback = rules.find(r => r.testUnit === null)
  if (!fallback) return null

  const unit = rules.find(r => r.testUnit === testUnit) ?? null
  const inherit = (a: string | null, b: string | null) => (a !== null ? a : b) ?? ''

  const ccParts = [fallback.ccRecipients, unit?.ccRecipients ?? '']
    .map(s => s.trim())
    .filter(Boolean)

  return {
    enabled: unit ? unit.enabled : fallback.enabled,
    subject: inherit(unit?.subjectTemplate ?? null, fallback.subjectTemplate),
    intro: inherit(unit?.introTemplate ?? null, fallback.introTemplate),
    outro: inherit(unit?.outroTemplate ?? null, fallback.outroTemplate),
    ccRaw: ccParts.join(', '),
  }
}
