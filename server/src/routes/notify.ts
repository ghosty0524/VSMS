import { Router } from 'express'
import type { Request } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit, DEFAULT_NOTIFY_RULE_ID } from '../lib/storage.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { validateTemplate, TEMPLATE_VARS } from '../lib/notifyTemplate.js'
import { resolveRule } from '../lib/notifyRule.js'
import { planRecipients, resolveRecipients } from '../lib/notifyRecipients.js'
import { buildTemplateVars, buildMailBody } from '../lib/notifyMailBody.js'
import { computeSendDate, daysBetween } from '../lib/notifyDate.js'
import { todayTaipei } from '../lib/today.js'
import { prismaNotifyStore } from '../lib/notifyStore.js'
import { runDailyNotify } from '../lib/notifyRunner.js'
import { platformDeliverer, fetchDeliveryStatuses, notifyConfigured } from '../lib/notifyClient.js'

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
    smtpConfigured: notifyConfigured(),
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

// --- 代收群組（需求人員無法對應時的收件人）------------------------------

/**
 * 驗證一筆代收人員的名稱。
 *
 * 代收群組是最後一道防線：需求人員對應不出信箱時整封信改寄給它。若它本身也
 * 填錯，runner 會走到「無 fallback 收件人」那條路 —— 不寄、不留記錄，只在
 * 管理者手動重跑時才看得到錯誤。因此在存檔時就擋下，不留到寄信當下。
 *
 * 一筆只允許一位收件人：Recipient 逐列停用/刪除，一列塞多人的話就沒辦法
 * 單獨停用其中一位。
 */
function recipientNameError(name: string, mailDomain: string): string | null {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '代收人員不可空白'

  const { addresses, unresolved } = resolveRecipients(trimmed, mailDomain)
  if (addresses.length > 1 || (addresses.length === 1 && unresolved.length > 0)) {
    return '一筆只能填一位代收人員，請分開新增'
  }
  if (addresses.length === 0) {
    // 網域沒設時每個裸帳號名都會失敗。訊息要指向真正該修的地方，否則管理者
    // 會反覆懷疑是自己名字打錯。
    return mailDomain.trim()
      ? `「${trimmed}」無法組成有效信箱；請填公司帳號名或完整 email`
      : '尚未設定寄件網域，請先填寫「寄件網域」再新增代收人員'
  }
  return null
}

// POST /api/notify/recipients
router.post('/recipients', async (req, res) => {
  const { name, note } = req.body as { name?: unknown; note?: unknown }
  if (typeof name !== 'string') {
    res.status(422).json({ ok: false, errors: { name: '代收人員不可空白' } })
    return
  }
  const config = await prisma.notifyConfig.findUnique({ where: { id: 1 } })
  const error = recipientNameError(name, config?.mailDomain ?? '')
  if (error) {
    res.status(422).json({ ok: false, errors: { name: error } })
    return
  }
  const created = await prisma.recipient.create({
    data: {
      name: name.trim(),
      note: typeof note === 'string' ? note.trim() : '',
      isActive: true,
      notifyConfigId: 1,
    },
  })
  await audit(req, `代收人員：${created.name}（新增）`, [])
  res.json({ ok: true, recipient: created })
})

// PUT /api/notify/recipients/:id
router.put('/recipients/:id', async (req, res) => {
  const existing = await prisma.recipient.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ ok: false, message: '找不到該代收人員' })
    return
  }
  const body = req.body as Partial<{ name: string; note: string; isActive: boolean }>

  // 白名單，與 PUT /config 同樣的理由：不能把 req.body 整包丟給 update，
  // 否則呼叫端可以夾帶 id 或 notifyConfigId 改寫這條路由沒打算開放的欄位。
  const data: Partial<{ name: string; note: string; isActive: boolean }> = {}
  if (body.name !== undefined) {
    const config = await prisma.notifyConfig.findUnique({ where: { id: 1 } })
    const error = recipientNameError(body.name, config?.mailDomain ?? '')
    if (error) {
      res.status(422).json({ ok: false, errors: { name: error } })
      return
    }
    data.name = body.name.trim()
  }
  if (body.note !== undefined) data.note = String(body.note).trim()
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

  await prisma.recipient.update({ where: { id: req.params.id }, data })
  await audit(req, `代收人員：${existing.name}`, Object.keys(data))
  res.json({ ok: true })
})

// DELETE /api/notify/recipients/:id
router.delete('/recipients/:id', async (req, res) => {
  const existing = await prisma.recipient.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ ok: false, message: '找不到該代收人員' })
    return
  }
  await prisma.recipient.delete({ where: { id: req.params.id } })
  await audit(req, `代收人員：${existing.name}（刪除）`, [])
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
  const [config, rules, restDays, fallbackRows] = await Promise.all([
    prisma.notifyConfig.findUnique({ where: { id: 1 } }),
    prisma.notifyRule.findMany(),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
    // 代收群組也要讀：預覽若不知道 runner 會改寄代收群組，需求人員對應不出
    // 信箱時顯示出來的收件人會是空的，和實際寄出的對不上。
    prisma.recipient.findMany({ where: { isActive: true, notifyConfigId: 1 } }),
  ])
  const rule = resolveRule(schedule.testUnit, rules)
  if (!rule) {
    res.status(400).json({ ok: false, message: '找不到預設通知規則' })
    return
  }
  const domain = config?.mailDomain ?? ''
  const plan = planRecipients({
    requiredPersonnel: schedule.requiredPersonnel,
    testEngineer: schedule.testEngineer,
    ruleCcRaw: rule.ccRaw,
    fallbackRaw: fallbackRows.map(r => r.name).filter(Boolean).join(', '),
    mailDomain: domain,
  })
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
    to: plan.to,
    cc: plan.cc,
    unresolved: plan.unresolved,
    sendDate,
    unitEnabled: rule.enabled,
  })
})

// GET /api/notify/logs
router.get('/logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500)
  // 以 updatedAt 而非 createdAt 排序：重試走的是 upsert-update，createdAt
  // 停在第一次建立的時間，用它排序會讓今天才處理完的記錄沉在下面，看起來
  // 就像當天沒跑。前端也要把這個時間顯示出來，排序依據才是看得見的。
  const logs = await prisma.notificationLog.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  const schedules = await prisma.schedule.findMany({
    where: { id: { in: logs.map(l => l.scheduleId) } },
    select: { id: true, projectName: true, testUnit: true, startDate: true },
  })
  const byId = new Map(schedules.map(s => [s.id, s]))
  // 每列若有 deliveryId，去平台換回目前的寄送狀態；平台連不上或沒有
  // deliveryId（尚未上線平台前的舊列、或 dropped）時 statuses 查不到，
  // platformStatus 一律回 null，前端退回顯示本地 status。
  const statuses = await fetchDeliveryStatuses(logs.map(l => l.deliveryId).filter((x): x is string => !!x))
  res.json({
    logs: logs.map(l => {
      const s = l.deliveryId ? statuses.get(l.deliveryId) : undefined
      return {
        ...l,
        // 查不到就回空字串，由前端決定怎麼呈現（灰字提示）。這裡若自己填一段
        // 文字，前端的 fallback 判斷永遠不成立，會變成死碼。
        projectName: byId.get(l.scheduleId)?.projectName ?? '',
        testUnit: byId.get(l.scheduleId)?.testUnit ?? '',
        startDate: byId.get(l.scheduleId)?.startDate ?? '',
        platformStatus: s?.status ?? null,
        platformError: s?.lastError ?? null,
        platformSentAt: s?.sentAt ?? null,
      }
    }),
  })
})

// POST /api/notify/run — 立即檢查並補寄
router.post('/run', async (req, res) => {
  if (!notifyConfigured()) {
    res.status(400).json({ ok: false, message: 'NOTIFY_URL 或 VAUTH_SERVICE_KEY 未設定' })
    return
  }
  const result = await runDailyNotify(prismaNotifyStore, platformDeliverer)
  await audit(req, `手動執行通知：寄出 ${result.sent} 封、重複略過 ${result.deduped} 封`, [])
  res.json({ ok: true, ...result })
})

// POST /api/notify/test — 寄一封測試信（改打平台 admin test-mail）
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
  if (!notifyConfigured()) {
    res.status(400).json({ ok: false, message: 'NOTIFY_URL 或 VAUTH_SERVICE_KEY 未設定' })
    return
  }
  const notifyUrl = process.env.NOTIFY_URL?.trim() as string
  // 同 notifyClient.deliver() 的 10 秒逾時：這條路由代管理者直接打平台，
  // 平台若掛住不回應，不能讓這個請求跟著無限期掛住。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const platformRes = await fetch(`${notifyUrl}/notify/admin/test-mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.VAUTH_SERVICE_KEY?.trim() ?? '' },
      body: JSON.stringify({ to: to.trim() }),
      signal: controller.signal,
    })
    const data = await platformRes.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
    if (platformRes.status === 503) {
      res.status(400).json({ ok: false, message: 'SMTP 在平台尚未設定' })
      return
    }
    if (!platformRes.ok) {
      res.status(502).json({ ok: false, message: `寄送失敗：${data.error?.message ?? platformRes.status}` })
      return
    }
    // 這條路由可以把信寄給管理者任意指定的地址，若不留紀錄就沒有人知道
    // 誰在什麼時候寄了信到哪裡去。
    await audit(req, `測試信：${to.trim()}`, [])
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({
      ok: false,
      message: `寄送失敗：${err instanceof Error ? err.message : String(err)}`,
    })
  } finally {
    clearTimeout(timer)
  }
})

export default router
