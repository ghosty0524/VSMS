// server/src/index.ts
import express from 'express'
import session from 'express-session'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { guestReadOnly } from './middleware/guestReadOnly.js'
import authRouter from './routes/auth.js'
import schedulesRouter from './routes/schedules.js'
import optionsRouter from './routes/options.js'
import usersRouter from './routes/users.js'
import auditRouter from './routes/audit.js'
import calendarRouter from './routes/calendar.js'
import integrationRouter from './routes/integration.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const app = express()

app.use(express.json({ limit: '10mb' }))

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
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TIMEOUT_MIN * 60 * 1000 },
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
app.use('/api/integration', integrationRouter)

// ── Static (serve SPA in production) ──────────────────
// 依執行位置不同（tsx 跑 server/src、node 跑 server/dist/src），dist 相對深度不同；
// 以 index.html 是否存在判斷，避免誤挑到同名的 server/dist 編譯輸出目錄
const distPath = [
  path.join(__dirname, '../../dist'),    // tsx: server/src → 專案根/dist
  path.join(__dirname, '../../../dist'), // node: server/dist/src → 專案根/dist
].find(p => fs.existsSync(path.join(p, 'index.html'))) ?? ''

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

const { initDb, scheduleAuditCleaner } = await import('./lib/storage.js')
const { prisma } = await import('./lib/db.js')
const PORT = process.env.PORT ?? 3001
await prisma.$connect()
await initDb()
scheduleAuditCleaner()
app.listen(Number(PORT), () => {
  console.log(`VSMS Server running at http://localhost:${PORT}`)
})
