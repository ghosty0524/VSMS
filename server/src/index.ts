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
import { ssoAdopt } from './middleware/ssoAdopt.js'
import { ssoRecheck } from './middleware/ssoRecheck.js'
import { errorHandler } from './middleware/errorHandler.js'
import { canonicalRedirect } from './middleware/canonicalRedirect.js'
import authRouter from './routes/auth.js'
import schedulesRouter from './routes/schedules.js'
import optionsRouter from './routes/options.js'
import usersRouter from './routes/users.js'
import auditRouter from './routes/audit.js'
import analyticsRouter from './routes/analytics.js'
import calendarRouter from './routes/calendar.js'
import integrationRouter from './routes/integration.js'
import notifyRouter from './routes/notify.js'
import internalRouter from './routes/internal.js'
import { buildVersionRouter } from './routes/build.js'
import { healthRouter } from './routes/health.js'
import { getBuildVersion } from './lib/buildVersion.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const app = express()
// 正式流量經反向代理（F:\vportal，同一台機器）進來。只信任 loopback 的 X-Forwarded-*，
// 登入限流與稽核用的 req.ip 才會是真正的使用者位址，而不是 127.0.0.1；直接從 LAN
// 打 3001 的請求不受影響（它們不經過 loopback，header 會被忽略）。
app.set('trust proxy', 'loopback')

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

// 統一格式的健康檢查（整合計畫第 10 章）。同樣必須掛在 session 之前，理由同上。
// package.json 與 distPath 一樣依執行位置深度不同，用同一套候選法找。
const pkgJsonPath = [
  path.join(__dirname, '../../package.json'),    // tsx: server/src → 專案根
  path.join(__dirname, '../../../package.json'), // node: server/dist/src → 專案根
].find(p => fs.existsSync(p))
const pkgVersion = pkgJsonPath ? (JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { version: string }).version : '0.0.0'
app.use(healthRouter({
  service: 'vsms',
  version: pkgVersion,
  deployedAt: () => { const ms = getBuildVersion(distPath); return ms ? new Date(ms).toISOString() : null },
  checkDb: async () => { await prisma.$queryRaw`SELECT 1` },
}))

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
  // 一定要指定名稱，不能用 express-session 預設的 connect.sid。cookie 的識別是
  // （名稱、網域、路徑）—— **port 不在其中**。VTMS 跑在同一台的 localhost:4000
  // 且同樣用 express-session，兩邊若都叫 connect.sid，登入其中一個就會蓋掉另一個
  // 的 cookie；被蓋掉的那邊下一個請求送出的是對方的 session id，store 不認得，
  // 使用者看到的是「Session 已過期」，與真的逾時完全無法分辨，而且是雙向的。
  // （實際回報過的缺陷：登入 VTMS 後在新視窗登入 VSMS，VTMS 那邊就被踢出。）
  name: 'vsms.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // sliding expiry: cookie refreshed on every response
  // secure follows httpsEnabled: a secure cookie over plain HTTP is never sent back,
  // which would silently break login if HTTPS were ever turned off.
  cookie: { httpOnly: true, sameSite: 'lax', secure: httpsEnabled, maxAge: SESSION_TIMEOUT_MIN * 60 * 1000 },
}))

// 機器端點（vauth 推送組織快照）：掛在 ssoAdopt、guestReadOnly 之前，兩者都不會套用。
// 位置在 session middleware 之後——對帶 API key 的機器請求無害（沒有 cookie 就不會
// 建 session），要的是略過那兩道以使用者身分為前提的中介層。
app.use('/api/internal', internalRouter)

// ── API Routes ─────────────────────────────────────────
// Deny-by-default: guests can only issue GET (plus /logout) across all /api routes
// 單一登入認領：帶 vportal_sso 進來就換本地 session（AUTH_PROVIDER=vauth 才作用）。
app.use('/api', ssoAdopt)
app.use('/api', ssoRecheck)
app.use('/api', guestReadOnly)
app.use('/api', authRouter)
app.use('/api/schedules', schedulesRouter)
app.use('/api/options', optionsRouter)
app.use('/api/users', usersRouter)
app.use('/api/audit', auditRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/notify', notifyRouter)
app.use('/api/integration', integrationRouter)

// ── Static (serve SPA in production) ──────────────────
// distPath 已在檔案上方（session middleware 之前）解析過，這裡直接重用。
if (distPath) {
  // 直接打舊網址開頁面的人帶去正式網址；API 與代理轉進來的請求都放行（見中介層說明）。
  app.use(canonicalRedirect(process.env.PUBLIC_BASE_URL))
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
app.use(errorHandler)

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
        const summary = `[notify] daily run: checked=${r.checked} due=${r.due} sent=${r.sent} failed=${r.failed} skipped=${r.skipped} missedWindow=${r.missedWindow} excluded=${r.excluded}`
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
const { pullOrgSnapshotAtStartup } = await import('./lib/orgSync/pull.js')
await pullOrgSnapshotAtStartup()
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
