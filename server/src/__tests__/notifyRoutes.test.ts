import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { templateFieldErrors } from '../routes/notify.js'
import { DEFAULT_NOTIFY_RULE_ID } from '../lib/storage.js'
import { addDays, computeSendDate, daysBetween } from '../lib/notifyDate.js'
import { todayTaipei } from '../lib/today.js'

// notify.ts 現在寄信改打平台，路由測試不能真的打網路——mock 掉 client 層，
// 只驗證路由怎麼組請求/怎麼合併回應，deliver 本身的行為由 notifyClient.test.ts
// 涵蓋。
const fetchDeliveryStatusesMock = vi.fn(async () => new Map<string, { status: string; lastError: string | null; sentAt: string | null }>())
const deliverMock = vi.fn(async () => ({ id: 'd-mock', deduped: false, dropped: false }))
vi.mock('../lib/notifyClient.js', () => ({
  fetchDeliveryStatuses: (...args: unknown[]) => fetchDeliveryStatusesMock(...(args as [])),
  platformDeliverer: { deliver: (...args: unknown[]) => deliverMock(...(args as [])) },
}))

describe('templateFieldErrors', () => {
  it('returns no errors when every template is valid', () => {
    expect(templateFieldErrors({
      subjectTemplate: '[VSMS] {{projectName}}',
      introTemplate: null,
      outroTemplate: '',
    })).toEqual({})
  })

  it('names the offending field and the unknown variable', () => {
    const errors = templateFieldErrors({
      subjectTemplate: '{{projectNmae}}',
      introTemplate: null,
      outroTemplate: null,
    })
    expect(errors.subjectTemplate).toContain('projectNmae')
  })

  it('reports each bad field separately', () => {
    const errors = templateFieldErrors({
      subjectTemplate: '{{foo}}',
      introTemplate: '{{bar}}',
      outroTemplate: null,
    })
    expect(Object.keys(errors).sort()).toEqual(['introTemplate', 'subjectTemplate'])
  })

  it('ignores a null template', () => {
    expect(templateFieldErrors({
      subjectTemplate: null, introTemplate: null, outroTemplate: null,
    })).toEqual({})
  })
})

describe('notify router guards', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const { default: notifyRouter } = await import('../routes/notify.js')
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => { (req as unknown as { session: object }).session = {}; next() })
    app.use('/api/notify', notifyRouter)

    const res = await request(app).get('/api/notify/config')
    expect(res.status).toBe(401)
  })

  // catchUpDays: 0 是刻意的偏離 —— runner 現在會用它算補寄視窗起點
  // (addDays(today, -catchUpDays))，等於 0 時視窗收斂成單一天：失敗的
  // 寄送沒有隔天可以重試（attempts 停在 1/3），且該筆會被吸收進
  // missedWindow，不會以錯誤的形式浮現出來。所以 API 要在存檔時就擋下，
  // 不能讓管理者存進一個會靜默壞掉重試機制的值。這條驗證發生在觸碰資料庫
  // 之前，所以不需要真的接資料庫就能測。
  it('rejects catchUpDays of 0 with 422 before touching the database', async () => {
    const { default: notifyRouter } = await import('../routes/notify.js')
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      (req as unknown as { session: object }).session = {
        sessionId: 'test-session', username: 'admin', role: 'admin',
      }
      next()
    })
    app.use('/api/notify', notifyRouter)

    const res = await request(app).put('/api/notify/config').send({ catchUpDays: 0 })
    expect(res.status).toBe(422)
    // 訊息本身要講清楚「為什麼」不能是 0（留一天讓失敗的寄送重試），不能只
    // 是隨便一句泛用錯誤字串 —— 光有錯誤欄位不足以說明原因，管理者看了訊息
    // 才知道該怎麼改。
    expect(res.body.errors.catchUpDays).toContain('重試')
  })
})

// ── Prisma stub ──────────────────────────────────────────────
// 正式環境的 DATABASE_URL 指到唯一一份 vsms 資料庫（沒有獨立測試庫），notify
// 路由又能寄出真信、改掉預設通知規則，絕對不能在測試中打真的 DB 或真的
// mailer。這裡把 '../lib/db.js' 換成記憶體版 prisma stub —— notify.ts 與
// storage.ts 的 appendAudit 都從同一個解析後路徑匯入，所以兩邊拿到的是同一份
// stub。
interface FakeRule {
  id: string
  testUnit: string | null
  enabled: boolean
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
  ccRecipients: string
}

interface FakeSchedule {
  id: string
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

interface FakeConfig {
  id: number
  enabled: boolean
  systemUrl: string
  leadDays: number
  catchUpDays: number
  mailDomain: string
  teamsWebhookUrl: string
}

interface FakeRecipient {
  id: string
  name: string
  note: string
  isActive: boolean
  notifyConfigId: number
}

interface FakeLog {
  id: string
  scheduleId: string
  sendDate: string
  status: string
  recipients: string
  errorMessage: string | null
  attempts: number
  messageId: string | null
  smtpResponse: string | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
  deliveryId: string | null
}

interface FakeState {
  config: FakeConfig
  rules: FakeRule[]
  schedules: FakeSchedule[]
  logs: FakeLog[]
  recipients: FakeRecipient[]
  restDays: { id: number; weekends: boolean; specificDates: string[] }
  deletedRuleIds: string[]
  lastRuleUpdateData: Record<string, unknown> | null
  lastConfigUpdateData: Record<string, unknown> | null
}

function makeDefaultState(): FakeState {
  return {
    config: { id: 1, enabled: true, systemUrl: '', leadDays: 3, catchUpDays: 3, mailDomain: '', teamsWebhookUrl: '' },
    rules: [],
    schedules: [],
    logs: [],
    recipients: [],
    restDays: { id: 1, weekends: true, specificDates: [] },
    deletedRuleIds: [],
    lastRuleUpdateData: null,
    lastConfigUpdateData: null,
  }
}

function makeFakePrisma(state: FakeState) {
  return {
    notifyConfig: {
      findUnique: async () => state.config,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.lastConfigUpdateData = data
        state.config = { ...state.config, ...data } as FakeConfig
        return state.config
      },
    },
    recipient: {
      findMany: async ({ where }: { where?: { isActive?: boolean } } = {}) =>
        state.recipients.filter(r => where?.isActive === undefined || r.isActive === where.isActive),
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.recipients.find(r => r.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<FakeRecipient, 'id'> }) => {
        const created: FakeRecipient = { id: 'new-rcpt-' + state.recipients.length, ...data }
        state.recipients.push(created)
        return created
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const i = state.recipients.findIndex(r => r.id === where.id)
        state.recipients[i] = { ...state.recipients[i], ...data } as FakeRecipient
        return state.recipients[i]
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.recipients = state.recipients.filter(r => r.id !== where.id)
      },
    },
    notifyRule: {
      findMany: async () => state.rules,
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.rules.find(r => r.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.lastRuleUpdateData = data
        const idx = state.rules.findIndex(r => r.id === where.id)
        if (idx >= 0) state.rules[idx] = { ...state.rules[idx], ...data } as FakeRule
        return state.rules[idx]
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.deletedRuleIds.push(where.id)
        state.rules = state.rules.filter(r => r.id !== where.id)
      },
      create: async ({ data }: { data: Omit<FakeRule, 'id'> }) => {
        const created: FakeRule = { id: `new-rule-${state.rules.length}`, ...data }
        state.rules.push(created)
        return created
      },
    },
    schedule: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.schedules.find(s => s.id === where.id) ?? null,
      findMany: async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        state.schedules.filter(s => !where?.id?.in || where.id.in.includes(s.id)),
    },
    notificationLog: {
      findMany: async (
        { orderBy, take }: { orderBy?: Record<string, 'asc' | 'desc'>; take?: number } = {},
      ) => {
        const [key, dir] = Object.entries(orderBy ?? {})[0] ?? ['createdAt', 'desc']
        const at = (l: FakeLog) => (l[key as keyof FakeLog] as Date).getTime()
        const sorted = [...state.logs].sort((a, b) => dir === 'desc' ? at(b) - at(a) : at(a) - at(b))
        return typeof take === 'number' ? sorted.slice(0, take) : sorted
      },
    },
    restDaysConfig: {
      findUnique: async () => state.restDays,
    },
    user: {
      findUnique: async () => ({ username: 'admin', displayName: 'Admin' }),
      // POST /api/notify/run 會經 runDailyNotify → prismaNotifyStore 呼叫
      // 這兩支；測試不關心通知內容，回空／null 即可，重點是不能因為方法
      // 不存在而丟 TypeError、把整條路由拖進 500。
      findMany: async () => [],
      findFirst: async () => null,
    },
    auditLog: {
      create: async () => undefined,
    },
  }
}

let currentPrisma: ReturnType<typeof makeFakePrisma>
vi.mock('../lib/db.js', () => ({
  get prisma() { return currentPrisma },
}))

async function buildAdminApp() {
  const { default: notifyRouter } = await import('../routes/notify.js')
  const app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { sessionId: 's1', username: 'admin', role: 'admin' } as unknown as Request['session']
    next()
  })
  app.use('/api/notify', notifyRouter)
  // 對齊 server/src/index.ts 的錯誤處理順序：路由自己沒接住的例外會落到這裡，
  // 回傳 INTERNAL_SERVER_ERROR —— Fix 2 要驗證的正是「不能讓例外流到這裡」。
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error'
    res.status(500).json({ ok: false, code: 'INTERNAL_SERVER_ERROR', message })
  })
  return app
}

beforeEach(() => {
  vi.resetModules()
  fetchDeliveryStatusesMock.mockReset()
  fetchDeliveryStatusesMock.mockResolvedValue(new Map())
  deliverMock.mockReset()
  deliverMock.mockResolvedValue({ id: 'd-mock', deduped: false, dropped: false })
})

describe('DELETE /api/notify/rules/:id — 預設規則保護', () => {
  // 兩個條件（testUnit === null／id === DEFAULT_NOTIFY_RULE_ID）各自都要能
  // 單獨擋下刪除；下面兩個測試分別只滿足其中一個條件，只留一個判斷式的
  // 回歸會讓其中一個失敗。
  it('僅 testUnit 為 null（id 不是 DEFAULT_NOTIFY_RULE_ID）也要擋下', async () => {
    const state = makeDefaultState()
    state.rules = [{
      id: 'corrupted-id', testUnit: null, enabled: true,
      subjectTemplate: 'x', introTemplate: '', outroTemplate: '', ccRecipients: '',
    }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).delete('/api/notify/rules/corrupted-id')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DEFAULT_RULE_PROTECTED')
    expect(state.deletedRuleIds).toEqual([])
  })

  it('僅 id 為 DEFAULT_NOTIFY_RULE_ID（testUnit 不是 null）也要擋下', async () => {
    const state = makeDefaultState()
    state.rules = [{
      id: DEFAULT_NOTIFY_RULE_ID, testUnit: 'RA', enabled: true,
      subjectTemplate: 'x', introTemplate: '', outroTemplate: '', ccRecipients: '',
    }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).delete(`/api/notify/rules/${DEFAULT_NOTIFY_RULE_ID}`)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('DEFAULT_RULE_PROTECTED')
    expect(state.deletedRuleIds).toEqual([])
  })
})

describe('POST /api/notify/preview — 休息日設定與 daysUntilStart', () => {
  it('sendDate 反映 specificDates 假日造成的往前挪；daysUntilStart 以今天而非 sendDate 為基準', async () => {
    const state = makeDefaultState()
    // 固定日期而非用「今天」推算 sendDate，避免測試結果隨執行日期的星期幾而
    // 飄動：2031/03/10 是週一，往前推 5 天的 2031/03/05 是週三（非週末），
    // 只有在 restDaysConfig.specificDates 真的被讀取時才會往前多挪一天。
    const startDate = '2031/03/10'
    const leadDays = 5
    const naiveSendDate = addDays(startDate, -leadDays) // 2031/03/05，週三
    state.config = { ...state.config, leadDays, mailDomain: 'example.com' }
    state.restDays = { id: 1, weekends: false, specificDates: [naiveSendDate] }
    state.rules = [{
      id: DEFAULT_NOTIFY_RULE_ID, testUnit: null, enabled: true,
      subjectTemplate: '距開始還有 {{daysUntilStart}} 天',
      introTemplate: '', outroTemplate: '', ccRecipients: '',
    }]
    state.schedules = [{
      id: 'sched-1', projectName: 'P', taskDescription: 'T', category: 'C',
      testUnit: 'RA', testEngineer: 'E', device: 'D',
      startDate, endDate: startDate, timeResource: 1, requiredPersonnel: 'someone',
    }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).post('/api/notify/preview').send({ scheduleId: 'sched-1' })

    expect(res.status).toBe(200)

    const expectedSendDate = computeSendDate(startDate, leadDays, {
      weekends: false, specificDates: [naiveSendDate],
    })
    // 前提檢查：確定這個 fixture 真的會造成往前挪一天，不然下面的斷言測不出
    // 「忽略 specificDates」的回歸。
    expect(expectedSendDate).not.toBe(naiveSendDate)
    expect(res.body.sendDate).toBe(expectedSendDate)

    // 用真正的 daysBetween(今天, startDate) 算期望值（跟路由內部算法相同的
    // 函式），而不是拿 sendDate 去算 —— 如果路由回歸成以 sendDate 為基準，
    // 這裡會因為兩者相差 leadDays 天而顯著不同，不會因為執行日期恰好而巧合通過。
    const expectedDaysUntilStart = Math.max(0, daysBetween(todayTaipei(), startDate))
    expect(res.body.subject).toBe(`距開始還有 ${expectedDaysUntilStart} 天`)
  })
})

describe('Mass assignment 防護（Fix 1）', () => {
  it('PUT /rules/:id：testUnit、id、updatedAt 不會出現在交給 Prisma 的 data 裡', async () => {
    const state = makeDefaultState()
    state.rules = [{
      id: 'rule-1', testUnit: 'RA', enabled: true,
      subjectTemplate: '', introTemplate: '', outroTemplate: '', ccRecipients: '',
    }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).put('/api/notify/rules/rule-1').send({
      subjectTemplate: 'New Subject',
      enabled: false,
      testUnit: 'HACKED',
      id: 'other-id',
      updatedAt: '2020-01-01T00:00:00.000Z',
    })

    expect(res.status).toBe(200)
    const data = state.lastRuleUpdateData
    expect(data).not.toBeNull()
    expect(Object.keys(data ?? {}).sort()).toEqual(['enabled', 'subjectTemplate'])
    expect(data).not.toHaveProperty('testUnit')
    expect(data).not.toHaveProperty('id')
    expect(data).not.toHaveProperty('updatedAt')
  })

  it('PUT /config：id、teamsWebhookUrl 不會出現在交給 Prisma 的 data 裡', async () => {
    const state = makeDefaultState()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).put('/api/notify/config').send({
      enabled: true,
      id: 999,
      teamsWebhookUrl: 'http://evil.example.com/hook',
    })

    expect(res.status).toBe(200)
    const data = state.lastConfigUpdateData
    expect(data).not.toBeNull()
    expect(Object.keys(data ?? {})).toEqual(['enabled'])
    expect(data).not.toHaveProperty('id')
    expect(data).not.toHaveProperty('teamsWebhookUrl')
  })
})

describe('POST /api/notify/test — 型別防護（Fix 2）', () => {
  it('to 不是字串時回 422，不是 500', async () => {
    const state = makeDefaultState()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).post('/api/notify/test').send({ to: ['a@example.com'] })

    expect(res.status).toBe(422)
    expect(res.body.errors?.to).toBeTruthy()
    expect(res.body.code).not.toBe('INTERNAL_SERVER_ERROR')
  })
})

describe('POST /api/notify/preview — 收件人與實際寄出一致', () => {
  it('副本含規則固定副本與該排程的測試人員', async () => {
    const state = makeDefaultState()
    state.config = { ...state.config, mailDomain: 'example.com' }
    state.rules = [{
      id: DEFAULT_NOTIFY_RULE_ID, testUnit: null, enabled: true,
      subjectTemplate: 'S', introTemplate: '', outroTemplate: '',
      ccRecipients: 'dept_head',
    }]
    state.schedules = [{
      id: 'sched-1', projectName: 'P', taskDescription: 'T', category: 'C',
      testUnit: 'RA', testEngineer: 'Darius_Chang', device: 'D',
      startDate: '2031/03/10', endDate: '2031/03/10', timeResource: 1,
      requiredPersonnel: 'Amy_Chen',
    }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).post('/api/notify/preview').send({ scheduleId: 'sched-1' })

    expect(res.status).toBe(200)
    expect(res.body.to).toEqual(['Amy_Chen@example.com'])
    expect(res.body.cc).toEqual(['dept_head@example.com', 'Darius_Chang@example.com'])
  })
})

describe('GET /api/notify/logs — 排序鍵與顯示欄位一致', () => {
  const log = (o: Partial<FakeLog> & { id: string; sendDate: string; updatedAt: Date }): FakeLog => ({
    scheduleId: 'sched-1', status: 'sent', recipients: 'a@example.com',
    errorMessage: null, attempts: 1, messageId: null, smtpResponse: null,
    sentAt: null, createdAt: o.updatedAt, deliveryId: null, ...o,
  })

  it('依 updatedAt 排序，補寄的舊 sendDate 記錄排在最前面', async () => {
    // 使用者回報的情境：今天才補寄出去的那筆，sendDate 是好幾天前。若用
    // sendDate 排序，它會沉到下面，看起來就像「今天沒跑」。
    const state = makeDefaultState()
    state.logs = [
      // 08/20 就建立、今天重試才成功的那筆。createdAt 停在 08/20，只有
      // updatedAt 會動 —— 用 createdAt 排序它就永遠浮不上來。
      log({
        id: 'retried-today', sendDate: '2026/08/20',
        createdAt: new Date('2026-08-20T00:00:00Z'),
        updatedAt: new Date('2026-08-27T00:00:00Z'),
      }),
      log({
        id: 'sent-once-on-08-26', sendDate: '2026/08/26',
        createdAt: new Date('2026-08-26T00:00:00Z'),
        updatedAt: new Date('2026-08-26T00:00:00Z'),
      }),
    ]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).get('/api/notify/logs')

    expect(res.status).toBe(200)
    expect(res.body.logs.map((l: { id: string }) => l.id)).toEqual([
      'retried-today',
      'sent-once-on-08-26',
    ])
  })

  it('回傳 updatedAt，前端才有辦法把排序依據顯示出來', async () => {
    const state = makeDefaultState()
    state.logs = [log({ id: 'l1', sendDate: '2026/08/25', updatedAt: new Date('2026-08-27T00:00:00Z') })]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).get('/api/notify/logs')

    expect(res.body.logs[0].updatedAt).toBe('2026-08-27T00:00:00.000Z')
  })

  it('排程已刪除時 projectName 回空字串，由前端決定怎麼呈現', async () => {
    // 回字串 '(已刪除)' 會讓前端的 `l.projectName || …` 永遠不成立，灰字提示
    // 變成死碼。空字串才讓兩邊的約定成立。
    const state = makeDefaultState()
    state.logs = [log({ id: 'l1', scheduleId: 'gone', sendDate: '2026/08/25', updatedAt: new Date('2026-08-27T00:00:00Z') })]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).get('/api/notify/logs')

    expect(res.body.logs[0].projectName).toBe('')
    expect(res.body.logs[0].testUnit).toBe('')
  })

  it('有 deliveryId 的列會去平台換回目前狀態，合併成 platformStatus／platformError／platformSentAt', async () => {
    const state = makeDefaultState()
    state.logs = [log({ id: 'l1', sendDate: '2026/08/25', updatedAt: new Date('2026-08-27T00:00:00Z'), status: 'accepted', deliveryId: 'd1' })]
    currentPrisma = makeFakePrisma(state)
    fetchDeliveryStatusesMock.mockResolvedValue(new Map([
      ['d1', { status: 'sent', lastError: null, sentAt: '2026-08-27T00:05:00.000Z' }],
    ]))
    const app = await buildAdminApp()

    const res = await request(app).get('/api/notify/logs')

    expect(fetchDeliveryStatusesMock).toHaveBeenCalledWith(['d1'])
    expect(res.body.logs[0]).toMatchObject({
      platformStatus: 'sent', platformError: null, platformSentAt: '2026-08-27T00:05:00.000Z',
    })
  })

  it('沒有 deliveryId 的列（舊資料或 dropped）platformStatus 一律為 null，不去查平台', async () => {
    const state = makeDefaultState()
    state.logs = [log({ id: 'l1', sendDate: '2026/08/25', updatedAt: new Date('2026-08-27T00:00:00Z'), status: 'error', deliveryId: null })]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).get('/api/notify/logs')

    expect(fetchDeliveryStatusesMock).toHaveBeenCalledWith([])
    expect(res.body.logs[0]).toMatchObject({ platformStatus: null, platformError: null, platformSentAt: null })
  })
})

describe('POST /api/notify/run', () => {
  it('NOTIFY_URL 未設定時回 400，不呼叫 runDailyNotify', async () => {
    const prevUrl = process.env.NOTIFY_URL
    delete process.env.NOTIFY_URL
    try {
      const state = makeDefaultState()
      currentPrisma = makeFakePrisma(state)
      const app = await buildAdminApp()

      const res = await request(app).post('/api/notify/run')

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('NOTIFY_URL')
      expect(deliverMock).not.toHaveBeenCalled()
    } finally {
      if (prevUrl === undefined) delete process.env.NOTIFY_URL
      else process.env.NOTIFY_URL = prevUrl
    }
  })

  it('NOTIFY_URL 已設定時執行 runDailyNotify 並回傳結果', async () => {
    const prevUrl = process.env.NOTIFY_URL
    process.env.NOTIFY_URL = 'http://127.0.0.1:4100'
    try {
      const state = makeDefaultState()
      currentPrisma = makeFakePrisma(state)
      const app = await buildAdminApp()

      const res = await request(app).post('/api/notify/run')

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body).toHaveProperty('checked')
    } finally {
      if (prevUrl === undefined) delete process.env.NOTIFY_URL
      else process.env.NOTIFY_URL = prevUrl
    }
  })
})

describe('POST /api/notify/test — 改打平台 test-mail', () => {
  it('NOTIFY_URL 未設定時回 400，不打網路', async () => {
    const prevUrl = process.env.NOTIFY_URL
    delete process.env.NOTIFY_URL
    const fetchSpy = vi.spyOn(global, 'fetch')
    try {
      const state = makeDefaultState()
      currentPrisma = makeFakePrisma(state)
      const app = await buildAdminApp()

      const res = await request(app).post('/api/notify/test').send({ to: 'a@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('NOTIFY_URL')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
      if (prevUrl === undefined) delete process.env.NOTIFY_URL
      else process.env.NOTIFY_URL = prevUrl
    }
  })

  it('平台回 503（SMTP 未設定）時回 400，訊息說平台尚未設定', async () => {
    const prevUrl = process.env.NOTIFY_URL
    process.env.NOTIFY_URL = 'http://127.0.0.1:4100'
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new globalThis.Response(JSON.stringify({ error: { code: 'SMTP_UNSET', message: 'x' } }), { status: 503 }),
    )
    try {
      const state = makeDefaultState()
      currentPrisma = makeFakePrisma(state)
      const app = await buildAdminApp()

      const res = await request(app).post('/api/notify/test').send({ to: 'a@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.message).toContain('平台尚未設定')
    } finally {
      fetchSpy.mockRestore()
      if (prevUrl === undefined) delete process.env.NOTIFY_URL
      else process.env.NOTIFY_URL = prevUrl
    }
  })

  it('平台成功時代理呼叫 POST /notify/admin/test-mail 並回 200，寫入稽核', async () => {
    const prevUrl = process.env.NOTIFY_URL
    process.env.NOTIFY_URL = 'http://127.0.0.1:4100'
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new globalThis.Response(JSON.stringify({ ok: true, messageId: 'm1', response: '250 ok' }), { status: 200 }),
    )
    try {
      const state = makeDefaultState()
      currentPrisma = makeFakePrisma(state)
      const app = await buildAdminApp()

      const res = await request(app).post('/api/notify/test').send({ to: 'a@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://127.0.0.1:4100/notify/admin/test-mail')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ to: 'a@example.com' })
    } finally {
      fetchSpy.mockRestore()
      if (prevUrl === undefined) delete process.env.NOTIFY_URL
      else process.env.NOTIFY_URL = prevUrl
    }
  })
})

describe('代收群組（fallback recipients）CRUD', () => {
  const withDomain = () => {
    const state = makeDefaultState()
    state.config = { ...state.config, mailDomain: 'example.com' }
    return state
  }

  it('新增後出現在 GET /config 的 fallbackRecipients 裡', async () => {
    const state = withDomain()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const created = await request(app)
      .post('/api/notify/recipients').send({ name: 'Amy_Chen', note: 'QA 窗口' })
    expect(created.status).toBe(200)

    const cfg = await request(app).get('/api/notify/config')
    expect(cfg.body.fallbackRecipients).toEqual([
      { id: 'new-rcpt-0', name: 'Amy_Chen', note: 'QA 窗口', isActive: true },
    ])
  })

  it('帳號名接上 mailDomain 組不成有效信箱時擋下', async () => {
    // 代收群組是最後一道防線，它自己填錯的話信就真的寄不出去了。
    const state = withDomain()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).post('/api/notify/recipients').send({ name: '@broken' })

    expect(res.status).toBe(422)
    expect(res.body.errors?.name).toBeTruthy()
    expect(state.recipients).toHaveLength(0)
  })

  it('mailDomain 未設定時擋下，並指出是網域沒設', async () => {
    // 沒有網域，任何裸帳號名都組不成信箱 —— 錯誤訊息要指向真正該修的地方，
    // 否則管理者會反覆懷疑自己名字打錯。
    const state = makeDefaultState()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).post('/api/notify/recipients').send({ name: 'Amy_Chen' })

    expect(res.status).toBe(422)
    expect(res.body.errors?.name).toContain('寄件網域')
  })

  it('一筆只能是一位收件人，填多個要擋下', async () => {
    const state = withDomain()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).post('/api/notify/recipients').send({ name: 'Amy_Chen, Kevin_Yu' })

    expect(res.status).toBe(422)
    expect(state.recipients).toHaveLength(0)
  })

  it('空白名稱擋下', async () => {
    const state = withDomain()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    expect((await request(app).post('/api/notify/recipients').send({ name: '   ' })).status).toBe(422)
  })

  it('可以停用而不刪除；停用後 runner 就撈不到', async () => {
    const state = withDomain()
    state.recipients = [{ id: 'r1', name: 'Amy_Chen', note: '', isActive: true, notifyConfigId: 1 }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).put('/api/notify/recipients/r1').send({ isActive: false })

    expect(res.status).toBe(200)
    expect(state.recipients[0].isActive).toBe(false)
    // runner 只取 isActive: true
    expect(await currentPrisma.recipient.findMany({ where: { isActive: true } })).toEqual([])
  })

  it('改名時同樣要通過信箱驗證', async () => {
    const state = withDomain()
    state.recipients = [{ id: 'r1', name: 'Amy_Chen', note: '', isActive: true, notifyConfigId: 1 }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    const res = await request(app).put('/api/notify/recipients/r1').send({ name: '@broken' })

    expect(res.status).toBe(422)
    expect(state.recipients[0].name).toBe('Amy_Chen')
  })

  it('刪除後就不在清單裡', async () => {
    const state = withDomain()
    state.recipients = [{ id: 'r1', name: 'Amy_Chen', note: '', isActive: true, notifyConfigId: 1 }]
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    expect((await request(app).delete('/api/notify/recipients/r1')).status).toBe(200)
    expect(state.recipients).toHaveLength(0)
  })

  it('操作不存在的代收人員回 404，不是 500', async () => {
    const state = withDomain()
    currentPrisma = makeFakePrisma(state)
    const app = await buildAdminApp()

    expect((await request(app).put('/api/notify/recipients/nope').send({ isActive: false })).status).toBe(404)
    expect((await request(app).delete('/api/notify/recipients/nope')).status).toBe(404)
  })
})
