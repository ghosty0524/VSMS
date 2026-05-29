// scripts/migrate-json-to-mysql.ts
/**
 * One-time migration: JSON files → MySQL via Prisma
 * Safe to run multiple times (uses upsert).
 * Run: npx tsx scripts/migrate-json-to-mysql.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
// All JSON data lives in server/data (the old top-level data/ dir is unused)
const DATA = path.join(ROOT, 'server', 'data')
const SERVER_DATA = path.join(ROOT, 'server', 'data')

function parseDbUrl(raw: string) {
  const u = new URL(raw)
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: u.username,
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  }
}

// PrismaMariaDb is a factory — pass connection config (not a pre-built pool)
const adapter = new PrismaMariaDb(parseDbUrl(process.env.DATABASE_URL!))
const prisma = new PrismaClient({ adapter })

function readJson<T>(dir: string, filename: string): T | null {
  const p = path.join(dir, filename)
  if (!fs.existsSync(p)) { console.log(`⚠️  Skipping missing file: ${p}`); return null }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
}

async function migrateOptions() {
  console.log('\n📂 Migrating options.json...')
  const opts = readJson<{
    categories: { id: string; value: string; label: string; isActive: boolean; sortOrder: number }[]
    testUnits: { id: string; value: string; label: string; isActive: boolean; sortOrder: number;
      engineers: { id: string; value: string; label: string; isActive: boolean; sortOrder: number }[] }[]
    restDays: { weekends: boolean; specificDates: string[] }
  }>(DATA, 'options.json')
  if (!opts) return

  // Clear reference data first — IDs may differ from previous partial migration
  await prisma.engineer.deleteMany()
  await prisma.testUnit.deleteMany()
  await prisma.category.deleteMany()

  for (const c of opts.categories) {
    await prisma.category.create({
      data: { id: c.id, value: c.value, label: c.label, isActive: c.isActive, sortOrder: c.sortOrder },
    })
  }
  console.log(`  ✓ ${opts.categories.length} categories`)

  for (const u of opts.testUnits) {
    await prisma.testUnit.create({
      data: {
        id: u.id, value: u.value, label: u.label, isActive: u.isActive, sortOrder: u.sortOrder,
        engineers: {
          create: u.engineers.map(e => ({
            id: e.id, value: e.value, label: e.label, isActive: e.isActive, sortOrder: e.sortOrder,
          })),
        },
      },
    })
  }
  console.log(`  ✓ ${opts.testUnits.length} testUnits (+ engineers)`)

  await prisma.restDaysConfig.upsert({
    where: { id: 1 },
    create: { id: 1, weekends: opts.restDays.weekends, specificDates: opts.restDays.specificDates },
    update: { weekends: opts.restDays.weekends, specificDates: opts.restDays.specificDates },
  })
  console.log('  ✓ restDays')
}

async function migrateUsers() {
  console.log('\n👤 Migrating auth.json...')
  const store = readJson<{ users: {
    id: string; username: string; displayName: string; passwordHash: string;
    role: string; isActive: boolean; allowedUnits: string[]; linkedEngineer: string;
    createdAt: string; lastLoginAt: string
  }[] }>(DATA, 'auth.json')
  if (!store) return

  for (const u of store.users) {
    await prisma.user.upsert({
      where: { username: u.username },
      create: {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        passwordHash: u.passwordHash,
        role: u.role as 'super_admin' | 'admin' | 'user',
        isActive: u.isActive,
        allowedUnits: u.allowedUnits ?? [],
        linkedEngineer: u.linkedEngineer ?? '',
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
      },
      update: {
        displayName: u.displayName,
        passwordHash: u.passwordHash,
        role: u.role as 'super_admin' | 'admin' | 'user',
        isActive: u.isActive,
        allowedUnits: u.allowedUnits ?? [],
        linkedEngineer: u.linkedEngineer ?? '',
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
      },
    })
  }
  console.log(`  ✓ ${store.users.length} users`)
}

async function migrateSchedules() {
  console.log('\n📅 Migrating schedules.json...')
  const schedules = readJson<{
    id: string; category: string; projectName: string; taskDescription: string;
    testUnit: string; testEngineer: string; timeResource: number;
    startDate: string; endDate: string; requiredPersonnel: string;
    testReport: string; isCompleted: boolean; isDelayed: boolean;
    delayReason: string; createdBy: string; updatedBy: string;
    createdAt: string; updatedAt: string
  }[]>(DATA, 'schedules.json')
  if (!schedules) return

  // Clear existing schedules — source of truth is server/data/schedules.json
  await prisma.schedule.deleteMany()

  for (const s of schedules) {
    await prisma.schedule.create({
      data: {
        id: s.id,
        category: s.category, projectName: s.projectName, taskDescription: s.taskDescription,
        testUnit: s.testUnit, testEngineer: s.testEngineer, timeResource: s.timeResource,
        startDate: s.startDate, endDate: s.endDate, requiredPersonnel: s.requiredPersonnel,
        testReport: s.testReport, isCompleted: s.isCompleted, isDelayed: s.isDelayed,
        delayReason: s.delayReason ?? '', createdBy: s.createdBy, updatedBy: s.updatedBy,
        createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt),
      },
    })
  }
  console.log(`  ✓ ${schedules.length} schedules`)
}

async function migrateAudit() {
  console.log('\n📋 Migrating audit.json...')
  const logs = readJson<{
    id: string; timestamp: string; username: string; displayName: string;
    action: string; target: string; fields: string[]
  }[]>(DATA, 'audit.json')
  if (!logs) return

  for (const l of logs) {
    await prisma.auditLog.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        timestamp: new Date(l.timestamp),
        username: l.username,
        displayName: l.displayName,
        action: l.action,
        target: l.target,
        fields: l.fields ?? [],
      },
      update: {},  // audit logs are immutable
    })
  }
  console.log(`  ✓ ${logs.length} audit logs`)
}

async function migrateNotify() {
  console.log('\n🔔 Migrating notify.json...')
  const cfg = readJson<{
    enabled: boolean; teamsWebhookUrl: string; systemUrl: string;
    recipients: { id: string; name: string; note: string; isActive: boolean }[]
  }>(DATA, 'notify.json')
  if (!cfg) return

  await prisma.notifyConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      enabled: cfg.enabled,
      teamsWebhookUrl: cfg.teamsWebhookUrl ?? '',
      systemUrl: cfg.systemUrl ?? 'http://localhost:3001',
    },
    update: {
      enabled: cfg.enabled,
      teamsWebhookUrl: cfg.teamsWebhookUrl ?? '',
      systemUrl: cfg.systemUrl ?? 'http://localhost:3001',
    },
  })

  if (cfg.recipients) {
    for (const r of cfg.recipients) {
      await prisma.recipient.upsert({
        where: { id: r.id },
        create: { id: r.id, name: r.name, note: r.note ?? '', isActive: r.isActive, notifyConfigId: 1 },
        update: { name: r.name, note: r.note ?? '', isActive: r.isActive },
      })
    }
  }
  console.log(`  ✓ notifyConfig + ${cfg.recipients?.length ?? 0} recipients`)
}

async function migrateCalendar() {
  console.log('\n📅 Migrating server/data/calendar.json...')
  const cal = readJson<{
    year: number; nonWeekendHolidays: string[]; sourceName?: string; updatedAt: string
  }>(SERVER_DATA, 'calendar.json')
  if (!cal) return

  await prisma.calendarConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1, year: cal.year,
      nonWeekendHolidays: cal.nonWeekendHolidays,
      sourceName: cal.sourceName ?? null,
      updatedAt: new Date(cal.updatedAt),
    },
    update: {
      year: cal.year,
      nonWeekendHolidays: cal.nonWeekendHolidays,
      sourceName: cal.sourceName ?? null,
      updatedAt: new Date(cal.updatedAt),
    },
  })
  console.log(`  ✓ calendarConfig (year ${cal.year}, ${cal.nonWeekendHolidays.length} holidays)`)
}

async function main() {
  console.log('🚀 Starting JSON → MySQL migration...')
  try {
    await migrateOptions()
    await migrateUsers()
    await migrateSchedules()
    await migrateAudit()
    await migrateNotify()
    await migrateCalendar()
    console.log('\n✅ Migration complete. Original JSON files preserved as backup.')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
