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
function tableRows(s: ScheduleForMail): Array<[string, string]> {
  return [
    ['專案名稱', s.projectName ?? ''],
    ['測試單位', s.testUnit ?? ''],
    ['測試工程師', s.testEngineer ?? ''],
    ['機台', s.device ?? ''],
    ['任務說明', s.taskDescription ?? ''],
    ['起迄日期', `${s.startDate} ~ ${s.endDate}`],
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
