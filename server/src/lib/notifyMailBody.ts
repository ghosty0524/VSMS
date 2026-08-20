import { renderTemplate, escapeHtml } from './notifyTemplate.js'
import type { TemplateVars } from './notifyTemplate.js'
import type { ResolvedRule } from './notifyRule.js'

export interface ScheduleForMail {
  projectName: string
  taskDescription: string
  category: string
  testUnit: string
  testEngineer: string
  device: string
  startDate: string
  endDate: string
  timeResource: number
  requiredPersonnel: string
}

export function buildTemplateVars(
  s: ScheduleForMail,
  systemUrl: string,
  daysUntilStart: number,
): TemplateVars {
  return {
    projectName: s.projectName ?? '',
    taskDescription: s.taskDescription ?? '',
    category: s.category ?? '',
    testUnit: s.testUnit ?? '',
    testEngineer: s.testEngineer ?? '',
    device: s.device ?? '',
    startDate: s.startDate ?? '',
    endDate: s.endDate ?? '',
    timeResource: String(s.timeResource ?? ''),
    requiredPersonnel: s.requiredPersonnel ?? '',
    daysUntilStart: String(daysUntilStart),
    systemUrl: systemUrl ?? '',
  }
}

/**
 * 資料表格由程式固定產生，不經範本 —— 管理者只能改主旨與前後文字段落，
 * 因此改不壞版面，而各單位的差異本來就集中在提醒詞。
 */
/**
 * 空值一律顯示 None，不留空白。
 *
 * 需要這條規則是因為機台只有 RA 在填 —— SIT-HW / SIT-SW / SI 的排程一律
 * 留白，沒有它那些信會出現一行後面什麼都沒有的「機台：」。
 */
const orNone = (value: string | null | undefined): string => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? 'None' : trimmed
}

function tableRows(s: ScheduleForMail): Array<[string, string]> {
  const start = (s.startDate ?? '').trim()
  const end = (s.endDate ?? '').trim()
  return [
    ['專案名稱', orNone(s.projectName)],
    ['測試單位', orNone(s.testUnit)],
    ['測試工程師', orNone(s.testEngineer)],
    ['機台', orNone(s.device)],
    ['任務說明', orNone(s.taskDescription)],
    // 兩端都空才整格顯示 None，只缺一端仍看得出缺的是哪一端
    ['起迄日期', start || end ? `${orNone(start)} ~ ${orNone(end)}` : 'None'],
    // timeResource 是非空的 Int，0 是有效值而不是「沒填」，所以不套 orNone
    ['工時', `${s.timeResource} 人天`],
  ]
}

export function buildMailBody(
  rule: ResolvedRule,
  s: ScheduleForMail,
  vars: TemplateVars,
): { subject: string; text: string; html: string } {
  const subject = renderTemplate(rule.subject, vars)
  const intro = renderTemplate(rule.intro, vars)
  const outro = renderTemplate(rule.outro, vars)
  const rows = tableRows(s)
  const url = vars.systemUrl

  const textParts = [
    intro,
    rows.map(([label, value]) => `${label}：${value}`).join('\n'),
    outro,
    url ? `系統連結：${url}` : '',
  ].filter(Boolean)

  const htmlParts = [
    intro ? `<p>${escapeHtml(intro)}</p>` : '',
    '<table cellpadding="6" cellspacing="0" border="0">' +
      rows.map(([label, value]) =>
        `<tr><td style="color:#666">${escapeHtml(label)}</td>` +
        `<td>${escapeHtml(value)}</td></tr>`).join('') +
      '</table>',
    outro ? `<p>${escapeHtml(outro)}</p>` : '',
    url ? `<p><a href="${escapeHtml(url)}">在 VSMS 中檢視</a></p>` : '',
  ].filter(Boolean)

  return {
    subject,
    text: textParts.join('\n\n'),
    html: htmlParts.join('\n'),
  }
}
