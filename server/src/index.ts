// server/src/index.ts
import express from 'express'
import compression from 'compression'
import session from 'express-session'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import cron from 'node-cron'
import { runDailyNotify } from './lib/notifyRunner.js'
import { prismaNotifyStore } from './lib/notifyStore.js'
import { getMailer, isMailerConfigured } from './lib/mailer.js'
import { guestReadOnly } from './middleware/guestReadOnly.js'
import authRouter from './routes/auth.js'
import schedulesRouter from './routes/schedules.js'
import optionsRouter from './routes/options.js'
import usersRouter from './routes/users.js'
import auditRouter from './routes/audit.js'
import calendarRouter from './routes/calendar.js'
import integrationRouter from './routes/integration.js'
import notifyRouter from './routes/notify.js'
import { buildVersionRouter } from './routes/build.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const app = express()

// gzip 所有可壓縮回應（排程 JSON 與 2.6MB singlefile SPA 傳輸量可降七成以上）
app.use(compression())
app.use(express.json({ limit: '10mb' }))

// 依執行位置不同（tsx 跑 server/src、node 跑 server/dist/src），dist 相對深度不同；
// 以 index.html 是否存在判斷，避免誤挑到同名的 server/dist 編譯輸出目錄。
// 提前到這裡計算，讓下面的 /api/build 探測路由與後面的 static serving 共用同一份
// 解析結果，不必算兩次。
const distPath = [
  path.join(__dirname, '../../dist'),    // tsx: server/src → 專案根/dist
  path.join(__dirname, '../../../dist'), // node: server/dist/src → 專案根/dist
].find(p => fs.existsSync(path.join(p, 'index.html'))) ?? ''

// 前端版本探測路由：必須掛在 app.use(session(...)) 之前！
// session 用 rolling:true，任何通過該 middleware 的回應都會刷新 session cookie；
// 這條路由會被前端每隔幾分鐘/每次視窗取得焦點時輪詢，若排在 session 之後，
// 輪詢本身會不斷延長 session，讓閒置逾時（idle timeout）形同虛設。
// 不要為了跟其他 /api 路由「排整齊」把它搬到 session 之後。
app.use(buildVersionRouter(distPath))

// HTTPS when both cert and key are configured, plain HTTP otherwise (tests, local dev).
// Shares the same mkcert certificate as VTMS — see HTTPS_CERT_FILE in .env.
// Serving over TLS is required because VTMS sends HSTS for this host, and HSTS is
// scoped to the host without the port: once a browser has loaded VTMS over HTTPS it
// rewrites http://<host>:3001 to https:// before any packet leaves the machine.
const httpsCertFile = process.env.HTTPS_CERT_FILE?.trim() || ''
const httpsKeyFile = process.env.HTTPS_KEY_FILE?.trim() || ''
const httpsEnabled = Boolean(httpsCertFile && httpsKeyFile)

// Without SESSION_SECRET a random per-boot secret is used instead of a known
// hardcoded string. Sessions live in MemoryStore and reset on restart anyway.
let sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  sessionSecret = randomBytes(32).toString('hex')
  console.warn('[server] SESSION_SECRET is not set — using a random per-boot secret. Set SESSION_SECRET in .env for stable deployments.')
}
const SESSION_TIMEOUT_MIN = Number(process.env.SESSION_TIMEOUT_MIN ?? 30)
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // sliding expiry: cookie refreshed on every response
  // secure follows httpsEnabled: a secure cookie over plain HTTP is never sent back,
  // which would silently break login if HTTPS were ever turned off.
  cookie: { httpOnly: true, sameSite: 'lax', secure: httpsEnabled, maxAge: SESSION_TIMEOUT_MIN * 60 * 1000 },
}))

// ── API Routes ─────────────────────────────────────────
// Deny-by-default: guests can only issue GET (plus /logout) across all /api routes
app.use('/api', guestReadOnly)
app.use('/api', authRouter)
app.use('/api/schedules', schedulesRouter)
app.use('/api/options', optionsRouter)
app.use('/api/users', usersRouter)
app.use('/api/audit', auditRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/notify', notifyRouter)
app.use('/api/integration', integrationRouter)

// ── Static (serve SPA in production) ──────────────────
// distPath 已在檔案上方（session middleware 之前）解析過，這裡直接重用。
if (distPath) {
  app.use(express.static(distPath))
  app.get('/{*splat}', (req, res, next) => {
    // Unknown API routes must return JSON 404, not the SPA shell
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── Error handling ─────────────────────────────────────
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'API endpoint not found', path: req.originalUrl })
})
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error'
  console.error(`[server] ${req.method} ${req.originalUrl} failed:`, err)
  res.status(500).json({ ok: false, code: 'INTERNAL_SERVER_ERROR', message })
})

// 每天 08:00（伺服器本地時間）檢查並寄出預告信。
//
// 必須在 listen 之後才啟動：本檔把 app export 給測試使用，掛在模組頂層會讓
// 每次跑測試都起一個排程器。
function startNotifyCron(): void {
  if (!isMailerConfigured()) {
    console.warn('[notify] SMTP is not configured — the daily notification job will not run.')
    console.warn('[notify] Set SMTP_HOST and SMTP_FROM in .env to enable it.')
    return
  }
  cron.schedule('0 8 * * *', () => {
    // 未捕捉的錯誤會拖垮同 process 的前端服務，一律吞在這裡並記錄。
    runDailyNotify(prismaNotifyStore, getMailer())
      .then(r => {
        const summary = `[notify] daily run: checked=${r.checked} due=${r.due} sent=${r.sent} failed=${r.failed} skipped=${r.skipped} missedWindow=${r.missedWindow}`
        // failed、errors、missedWindow 任一非零都代表有東西需要管理者注意，
        // 要用 console.error（不是 console.log）並把訊息內容印出來，不能只印
        // 筆數 —— 「信件已寄出但寫入記錄失敗，下次可能重複寄信」這類最重要
        // 的訊息，之前只印在 errors=N 的數字裡，內容從沒被印出來過。
        if (r.failed || r.errors.length || r.missedWindow) {
          console.error(`${summary} errors=${r.errors.length}`)
          for (const e of r.errors) console.error(`[notify]   ${e.scheduleId}: ${e.message}`)
        } else {
          console.log(summary)
        }
      })
      .catch(err => console.error('[notify] daily run failed:', err))
  }, { timezone: 'Asia/Taipei' })
  // 明確指定時區：process 的時區與 todayTaipei() 硬編的 UTC+8 目前恰好一致
  // （伺服器本來就跑在 Asia/Taipei），但那只是巧合，不是保證。這個專案已經
  // 出過一次 UTC 對台灣時間的日期落差問題，這裡不要再重蹈覆轍。
  console.log('[notify] daily notification job scheduled at 08:00 Asia/Taipei')
}

const { initDb, scheduleAuditCleaner } = await import('./lib/storage.js')
const { prisma } = await import('./lib/db.js')
const PORT = process.env.PORT ?? 3001
await prisma.$connect()
await initDb()
scheduleAuditCleaner()
if (httpsEnabled) {
  let cert: Buffer, key: Buffer
  try {
    cert = fs.readFileSync(httpsCertFile)
    key = fs.readFileSync(httpsKeyFile)
  } catch (err) {
    console.error(
      `[server] HTTPS is enabled but the certificate files could not be read.\n` +
      `  HTTPS_CERT_FILE = ${httpsCertFile}\n` +
      `  HTTPS_KEY_FILE  = ${httpsKeyFile}\n` +
      `  Error: ${err instanceof Error ? err.message : String(err)}`
    )
    process.exit(1)
  }
  https.createServer({ cert, key }, app).listen(Number(PORT), () => {
    console.log(`VSMS Server running at https://localhost:${PORT}`)
    startNotifyCron()
  })
} else {
  app.listen(Number(PORT), () => {
    console.log(`VSMS Server running at http://localhost:${PORT}`)
    startNotifyCron()
  })
}
