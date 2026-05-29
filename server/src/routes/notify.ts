// server/src/routes/notify.ts
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth)

function buildCard(body: object[]) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body,
      },
    }],
  }
}

// POST /api/notify
router.post('/', async (req, res) => {
  const config = await prisma.notifyConfig.findUnique({ where: { id: 1 } })

  if (!config?.enabled) {
    res.status(400).json({ ok: false, message: 'Teams 通知功能未開啟' })
    return
  }
  if (!config.teamsWebhookUrl) {
    res.status(400).json({ ok: false, message: '尚未設定 Teams Webhook URL' })
    return
  }

  const { summary } = req.body as { summary: string }
  const username = req.session.username ?? 'unknown'
  const dbUser = await prisma.user.findUnique({ where: { username } })
  const displayName = dbUser?.displayName ?? username
  const systemUrl = config.systemUrl || 'http://localhost:3001'

  const card = buildCard([
    { type: 'TextBlock', text: '📋 VSMS Dashboard 更新通知', weight: 'Bolder', size: 'Medium' },
    {
      type: 'FactSet',
      facts: [
        { title: '發佈時間', value: new Date().toLocaleString('zh-TW') },
        { title: '發佈人員', value: displayName },
      ],
    },
    { type: 'TextBlock', text: `本次更新摘要：\n${summary}`, wrap: true },
    { type: 'TextBlock', text: `📥 請點擊以下連結開啟系統下載最新 Dashboard\n${systemUrl}`, wrap: true, color: 'Accent' },
  ])

  try {
    const response = await fetch(config.teamsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    })
    if (!response.ok) {
      const text = await response.text()
      res.status(502).json({ ok: false, message: `Teams 回應錯誤：${text}` })
      return
    }
    await appendAudit(username, displayName, 'SEND_NOTIFICATION', 'teams', [])
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ ok: false, message: `無法連接 Teams Webhook：${String(err)}` })
  }
})

// POST /api/notify/test
router.post('/test', async (req, res) => {
  const { webhookUrl } = req.body as { webhookUrl: string }
  if (!webhookUrl) {
    res.status(400).json({ ok: false, message: '請提供 webhookUrl' })
    return
  }

  const card = buildCard([
    { type: 'TextBlock', text: '✅ VSMS Teams 通知測試', weight: 'Bolder', size: 'Medium' },
    { type: 'TextBlock', text: '此訊息為測試發送，表示 Webhook 設定正確。', wrap: true },
    { type: 'FactSet', facts: [{ title: '測試時間', value: new Date().toLocaleString('zh-TW') }] },
  ])

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    })
    if (!response.ok) {
      const text = await response.text()
      res.status(502).json({ ok: false, message: `Teams 回應錯誤：${text}` })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ ok: false, message: `無法連接 Webhook：${String(err)}` })
  }
})

export default router
