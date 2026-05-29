// server/src/index.ts
import express from 'express'
import session from 'express-session'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.js'
import schedulesRouter from './routes/schedules.js'
import optionsRouter from './routes/options.js'
import usersRouter from './routes/users.js'
import auditRouter from './routes/audit.js'
import notifyRouter from './routes/notify.js'
import calendarRouter from './routes/calendar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const app = express()

app.use(express.json({ limit: '10mb' }))
app.use(session({
  secret: process.env.SESSION_SECRET ?? 'vsms-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}))

// ── API Routes ─────────────────────────────────────────
app.use('/api', authRouter)
app.use('/api/schedules', schedulesRouter)
app.use('/api/options', optionsRouter)
app.use('/api/users', usersRouter)
app.use('/api/audit', auditRouter)
app.use('/api/notify', notifyRouter)
app.use('/api/calendar', calendarRouter)

// ── Static (serve SPA in production) ──────────────────
const isProd = !process.argv[1]?.includes('tsx')
const distPath = isProd
  ? path.join(__dirname, '../../../dist')
  : path.join(__dirname, '../../dist')

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── Start server (only when executed directly) ─────────
const isMain = process.argv[1] === __filename ||
               process.argv[1]?.endsWith('index.js') ||
               process.argv[1]?.endsWith('index.ts')

if (isMain) {
  const { initDb } = await import('./lib/storage.js')
  const { prisma } = await import('./lib/db.js')
  const PORT = process.env.PORT ?? 3001
  await prisma.$connect()
  await initDb()
  app.listen(Number(PORT), () => {
    console.log(`VSMS Server running at http://localhost:${PORT}`)
  })
}
