// server/src/lib/storage.ts
import { prisma } from './db.js'
import type { AuditAction } from '../types.js'

// ── Audit ────────────────────────────────────────────────────
export async function appendAudit(
  username: string,
  displayName: string,
  action: AuditAction,
  target: string,
  fields: string[] = []
): Promise<void> {
  await prisma.auditLog.create({
    data: { username, displayName, action, target, fields },
  })
  // Keep last 180 days only
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 180)
  await prisma.auditLog.deleteMany({ where: { timestamp: { lt: cutoff } } })
}

// ── DB Initialisation ────────────────────────────────────────
export async function initDb(): Promise<void> {
  // Ensure RestDaysConfig singleton
  await prisma.restDaysConfig.upsert({
    where: { id: 1 },
    create: { id: 1, weekends: true, specificDates: [] },
    update: {},
  })

  // Ensure NotifyConfig singleton
  await prisma.notifyConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled: false, teamsWebhookUrl: '', systemUrl: '' },
    update: {},
  })

  // Seed default categories/testUnits only if completely empty (fresh install)
  const catCount = await prisma.category.count()
  if (catCount === 0) {
    function opt(id: string, value: string, sortOrder: number) {
      return { id, value, label: value, isActive: true, sortOrder }
    }
    function eng(id: string, name: string, idx: number) {
      return { id, value: name, label: name, isActive: true, sortOrder: idx }
    }

    await prisma.category.createMany({
      data: [
        opt('c1', 'NPI', 0), opt('c2', 'AVL', 1), opt('c3', '2nd Source', 2),
        opt('c4', 'Security', 3), opt('c5', 'Regression', 4),
      ],
    })

    const units = [
      { id: 'u1', name: 'SIT-HW', order: 0, engineers: ['Eric','Darius','Jacky','Polson','Willie','Harry','Hsuan','Jeffrey','Wayhon','Ben'] },
      { id: 'u2', name: 'SIT-SW', order: 1, engineers: ['Eric','Ashley','Kirin'] },
      { id: 'u3', name: 'RA',     order: 2, engineers: ['Will','Lily','Japon','Michael'] },
      { id: 'u4', name: 'SI',     order: 3, engineers: ['Brian','Wade','Raymond','Paul'] },
    ]

    for (const u of units) {
      await prisma.testUnit.create({
        data: {
          id: u.id, value: u.name, label: u.name, isActive: true, sortOrder: u.order,
          engineers: {
            create: u.engineers.map((name, i) => eng(`${u.id}e${i}`, name, i)),
          },
        },
      })
    }
  }
}
