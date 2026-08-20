import { Router } from 'express'
import type { Request } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit, DEFAULT_NOTIFY_RULE_ID } from '../lib/storage.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { validateTemplate, TEMPLATE_VARS } from '../lib/notifyTemplate.js'
import { resolveRule } from '../lib/notifyRule.js'
import { resolveRecipients } from '../lib/notifyRecipients.js'
import { buildTemplateVars, buildMailBody } from '../lib/notifyMailBody.js'
import { computeSendDate, daysBetween } from '../lib/notifyDate.js'
import { todayTaipei } from '../lib/today.js'
import { prismaNotifyStore } from '../lib/notifyStore.js'
import { runDailyNotify } from '../lib/notifyRunner.js'
import { getMailer, isMailerConfigured } from '../lib/mailer.js'

const router = Router()
router.use(requireAdmin)

type TemplateFields = {
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
}

// AuditAction 是封閉的字面聯集，沒有泛用的 'UPDATE' / 'CREATE' / 'DELETE'；
// 設定類異動一律記為 UPDATE_SETTINGS，差異寫在 target 與 fields 裡。
async function audit(req: Request, target: string, fields: string[]): Promise<void> {
  const username = req.session.username ?? ''
  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'UPDATE_SETTINGS', target, fields)
}

/**
 * 範本驗證發生在存檔時，不是寄出時。管理者把變數名打錯必須當場被擋下 ——
 * 等到寄出才發現，那批信已經寄出去了。
 */
export function templateFieldErrors(fields: TemplateFields): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of ['subjectTemplate', 'introTemplate', 'outroTemplate'] as const) {
    const value = fields[key]
    if (value === null || value === undefined) continue
    const result = validateTemplate(value)
    if (!result.ok) {
      errors[key] = `未知的變數：${result.unknown.join('、')}。可用變數：${TEMPLATE_VARS.join('、')}`
    }
  }
  return errors
}

// GET /api/notify/config
router.get('/config', async (_req, res) => {
  const row = await prisma.notifyConfig.findUnique({ where: { id: 1 } })
  const fallback = await prisma.recipient.findMany({ where: { notifyConfigId: 1 } })
  res.json({
    enabled: row?.enabled ?? false,
    systemUrl: row?.systemUrl ?? '',
    leadDays: row?.leadDays ?? 3,
    catchUpDays: row?.catchUpDays ?? 3,
    mailDomain: row?.mailDomain ?? '',
    smtpConfigured: isMailerConfigured(),
    fallbackRecipients: fallback.map(r => ({ id: r.id, name: r.name, note: r.note, isActive: r.isActive })),
    templateVars: TEMPLATE_VARS,
  })
})

// PUT /api/notify/config
router.put('/config', async (req, res) => {
  const body = req.body as Partial<{
    enabled: boolean; systemUrl: string; leadDays: number; catchUpDays: number; mailDomain: string
  }>
  if (body.leadDays !== undefined && (!Number.isInteger(body.leadDays) || body.leadDays < 1)) {
    res.status(422).json({ ok: false, errors: { leadDays: '提前天數必須是 1 以上的整數' } })
    return
  }
  // catchUpDays 至少要 1：等於 0 會讓補寄視窗收斂成單一天，寄信失敗時
  // 沒有隔天可以重試（attempts 停在 1/3），且該筆會被 runner 吸收進
  // missedWindow，不會以錯誤的形式浮現出來。
  if (body.catchUpDays !== undefined && (!Number.isInteger(body.catchUpDays) || body.catchUpDays < 1)) {
    res.status(422).json({
      ok: false,
      errors: { catchUpDays: '補寄天數必須是 1 以上的整數，至少要留一天讓失敗的寄送有機會重試' },
    })
    return
  }
  // 白名單：只挑選這幾個欄位組出 Prisma 的 data，不能把 req.body 整包丟給
  // update —— 否則呼叫端可以夾帶 id、teamsWebhookUrl 等欄位做 mass assignment，
  // 寫入這條路由從未打算開放的欄位。缺席的欄位維持缺席，讓局部更新只動到
  // 呼叫端真的送來的欄位。
  const data: Partial<{
    enabled: boolean; systemUrl: string; leadDays: number; catchUpDays: number; mailDomain: string
  }> = {}
  if (body.enabled !== undefined) data.enabled = body.enabled
  if (body.systemUrl !== undefined) data.systemUrl = body.systemUrl
  if (body.leadDays !== undefined) data.leadDays = body.leadDays
  if (body.catchUpDays !== undefined) data.catchUpDays = body.catchUpDays
  if (body.mailDomain !== undefined) data.mailDomain = body.mailDomain

  await prisma.notifyConfig.update({ where: { id: 1 }, data })
  await audit(req, '通知設定', Object.keys(data))
  res.json({ ok: true })
})

// GET /api/notify/rules
router.get('/rules', async (_req, res) => {
  const [rules, units] = await Promise.all([
    prisma.notifyRule.findMany(),
    prisma.testUnit.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ])
  res.json({
    rules,
    testUnits: units.map(u => ({ value: u.value, label: u.label })),
    templateVars: TEMPLATE_VARS,
  })
})

// POST /api/notify/rules — 為某個測試單位建立規則
router.post('/rules', async (req, res) => {
  const { testUnit } = req.body as { testUnit: string }
  if (!testUnit?.trim()) {
    res.status(422).json({ ok: false, errors: { testUnit: '測試單位不可空白' } })
    return
  }
  const created = await prisma.notifyRule.create({
    data: {
      testUnit: testUnit.trim(), enabled: true,
      subjectTemplate: null, introTemplate: null, outroTemplate: null, ccRecipients: '',
    },
  })
  await audit(req, `通知規則：${testUnit}（新增）`, [])
  res.json({ ok: true, rule: created })
})

// PUT /api/notify/rules/:id
router.put('/rules/:id', async (req, res) => {
  const body = req.body as Partial<TemplateFields & { enabled: boolean; ccRecipients: string }>
  const errors = templateFieldErrors({
    subjectTemplate: body.subjectTemplate ?? null,
    introTemplate: body.introTemplate ?? null,
    outroTemplate: body.outroTemplate ?? null,
  })
  if (Object.keys(errors).length) {
    res.status(422).json({ ok: false, errors })
    return
  }
  const existing = await prisma.notifyRule.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ ok: false, message: '找不到該規則' })
    return
  }
  // 預設規則的範本不得為 null —— resolveRule 沿用鏈的終點就是它。
  if (existing.testUnit === null) {
    for (const key of ['subjectTemplate', 'introTemplate', 'outroTemplate'] as const) {
      if (key in body && body[key] === null) {
        res.status(422).json({ ok: false, errors: { [key]: '預設規則不可設為「沿用預設」' } })
        return
      }
    }
  }
  // 白名單：testUnit 是預設規則的識別欄位（resolveRule 靠它挑出 fallback）、
  // id 是主鍵、updatedAt 由 Prisma 管理 —— 三者都不可經由這條路由被呼叫端
  // 改動。若整包 body 直接餵給 update，`PUT /rules/<預設規則 id>` 帶一個
  // `{ testUnit: 'X' }` 就能讓預設規則從 testUnit === null 消失，
  // resolveRule 從此找不到任何單位的 fallback，整個通知功能悄悄失效。
  const data: Partial<{
    enabled: boolean; subjectTemplate: string | null; introTemplate: string | null
    outroTemplate: string | null; ccRecipients: string
  }> = {}
  if (body.enabled !== undefined) data.enabled = body.enabled
  if (body.subjectTemplate !== undefined) data.subjectTemplate = body.subjectTemplate
  if (body.introTemplate !== undefined) data.introTemplate = body.introTemplate
  if (body.outroTemplate !== undefined) data.outroTemplate = body.outroTemplate
  if (body.ccRecipients !== undefined) data.ccRecipients = body.ccRecipients

  await prisma.notifyRule.update({ where: { id: req.params.id }, data })
  await audit(req, `通知規則：${existing.testUnit ?? '預設'}`, Object.keys(data))
  res.json({ ok: true })
})

// DELETE /api/notify/rules/:id
router.delete('/rules/:id', async (req, res) => {
  const existing = await prisma.notifyRule.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ ok: false, message: '找不到該規則' })
    return
  }
  // 預設規則用 testUnit === null 識別，也是固定主鍵 DEFAULT_NOTIFY_RULE_ID 的那一筆。
  // 兩個條件各自都能認出它，任一個成立就要擋下 —— 只查其中一個會漏掉資料
  // 異常時（例如主鍵被改過、或 testUnit 意外被清空）另一種情況下的保護。
  if (existing.testUnit === null || existing.id === DEFAULT_NOTIFY_RULE_ID) {
    res.status(400).json({ ok: false, message: '預設規則不可刪除', code: 'DEFAULT_RULE_PROTECTED' })
    return
  }
  await prisma.notifyRule.delete({ where: { id: req.params.id } })
  await audit(req, `通知規則：${existing.testUnit}（刪除）`, [])
  res.json({ ok: true })
})

// POST /api/notify/preview — 套用規則但不寄出
router.post('/preview', async (req, res) => {
  const { scheduleId } = req.body as { scheduleId: unknown }
  if (typeof scheduleId !== 'string' || !scheduleId.trim()) {
    res.status(422).json({ ok: false, errors: { scheduleId: '排程 ID 不可空白' } })
    return
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!schedule) {
    res.status(404).json({ ok: false, message: '找不到該排程' })
    return
  }
  const [config, rules, restDays] = await Promise.all([
    prisma.notifyConfig.findUnique({ where: { id: 1 } }),
    prisma.notifyRule.findMany(),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
  ])
  const rule = resolveRule(schedule.testUnit, rules)
  if (!rule) {
    res.status(400).json({ ok: false, message: '找不到預設通知規則' })
    return
  }
  const domain = config?.mailDomain ?? ''
  const primary = resolveRecipients(schedule.requiredPersonnel, domain)
  const cc = resolveRecipients(rule.ccRaw, domain)
  const leadDays = config?.leadDays ?? 3
  // 真正讀取管理者設定的休息日，不可硬編：預覽如果忽略了休息日設定，
  // 顯示出來的寄信日會和 runner 實際寄出的日子對不上，比沒有預覽更糟。
  const sendDate = computeSendDate(schedule.startDate, leadDays, {
    weekends: restDays?.weekends ?? true,
    specificDates: (restDays?.specificDates as string[]) ?? [],
  })
  // 與 runner 現在的算法一致：以「今天」為基準，而不是 sendDate —— 收件人
  // 是「今天」讀到這封信，補寄時 sendDate 已經早於今天，用 sendDate 算會
  // 高估剩餘天數。
  const today = todayTaipei()
  const daysUntilStart = Math.max(0, daysBetween(today, schedule.startDate))
  const vars = buildTemplateVars(schedule, config?.systemUrl ?? '', daysUntilStart)
  const body = buildMailBody(rule, schedule, vars)

  res.json({
    subject: body.subject,
    text: body.text,
    html: body.html,
    to: primary.addresses,
    cc: cc.addresses,
    unresolved: primary.unresolved,
    sendDate,
    unitEnabled: rule.enabled,
  })
})

// GET /api/notify/logs
router.get('/logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500)
  const logs = await prisma.notificationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const schedules = await prisma.schedule.findMany({
    where: { id: { in: logs.map(l => l.scheduleId) } },
    select: { id: true, projectName: true, testUnit: true, startDate: true },
  })
  const byId = new Map(schedules.map(s => [s.id, s]))
  res.json({
    logs: logs.map(l => ({
      ...l,
      projectName: byId.get(l.scheduleId)?.projectName ?? '(已刪除)',
      testUnit: byId.get(l.scheduleId)?.testUnit ?? '',
      startDate: byId.get(l.scheduleId)?.startDate ?? '',
    })),
  })
})

// POST /api/notify/run — 立即檢查並補寄
router.post('/run', async (req, res) => {
  if (!isMailerConfigured()) {
    res.status(400).json({ ok: false, message: 'SMTP 尚未設定，請先在 .env 設定 SMTP_HOST 與 SMTP_FROM' })
    return
  }
  const result = await runDailyNotify(prismaNotifyStore, getMailer())
  await audit(req, `手動執行通知：寄出 ${result.sent} 封`, [])
  res.json({ ok: true, ...result })
})

// POST /api/notify/test — 寄一封測試信
router.post('/test', async (req, res) => {
  const { to } = req.body as { to: unknown }
  // to 型別要先檢查再呼叫字串方法 —— 陣列、數字、物件都會讓 to?.trim() 拋出
  // TypeError，那個例外會落在這條路由的 try/catch 之外，一路衝到全域錯誤
  // 處理器，回傳 500 並把內部錯誤訊息（如 "to?.trim is not a function"）
  // 洩漏給呼叫端，而不是這條路由原本就有的 422 錯誤格式。
  if (typeof to !== 'string' || !to.trim()) {
    res.status(422).json({ ok: false, errors: { to: '收件地址不可空白' } })
    return
  }
  if (!isMailerConfigured()) {
    res.status(400).json({ ok: false, message: 'SMTP 尚未設定，請先在 .env 設定 SMTP_HOST 與 SMTP_FROM' })
    return
  }
  try {
    await getMailer().send({
      to: [to.trim()], cc: [],
      subject: '[VSMS] 通知功能測試信',
      text: `這是一封測試信，寄出時間 ${todayTaipei()}。收到即表示 SMTP 設定正確。`,
      html: `<p>這是一封測試信，寄出時間 ${todayTaipei()}。收到即表示 SMTP 設定正確。</p>`,
    })
    // 這條路由可以把信寄給管理者任意指定的地址，若不留紀錄就沒有人知道
    // 誰在什麼時候寄了信到哪裡去。
    await audit(req, `測試信：${to.trim()}`, [])
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({
      ok: false,
      message: `寄送失敗：${err instanceof Error ? err.message : String(err)}`,
    })
  }
})

export default router
