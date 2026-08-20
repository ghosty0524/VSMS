export const TEMPLATE_VARS = [
  'projectName', 'taskDescription', 'category', 'testUnit', 'testEngineer',
  'device', 'startDate', 'endDate', 'timeResource', 'requiredPersonnel',
  'daysUntilStart', 'systemUrl',
] as const

export type TemplateVar = typeof TEMPLATE_VARS[number]
export type TemplateVars = Record<TemplateVar, string>

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g
const KNOWN = new Set<string>(TEMPLATE_VARS)

/**
 * 存檔時執行，不是寄出時。管理者把變數名打錯必須當場被擋下 —— 等到寄出才
 * 發現，那批信已經寄出去了。
 */
export function validateTemplate(template: string): { ok: true } | { ok: false; unknown: string[] } {
  const unknown: string[] = []
  for (const m of (template ?? '').matchAll(PLACEHOLDER)) {
    const name = m[1]
    if (!KNOWN.has(name) && !unknown.includes(name)) unknown.push(name)
  }
  return unknown.length ? { ok: false, unknown } : { ok: true }
}

/** 未知變數原樣保留，不輸出 undefined —— 破綻要看得見，不要靜默吞掉。 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return (template ?? '').replace(PLACEHOLDER, (whole, name: string) =>
    KNOWN.has(name) ? vars[name as TemplateVar] ?? '' : whole)
}

export function escapeHtml(value: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
