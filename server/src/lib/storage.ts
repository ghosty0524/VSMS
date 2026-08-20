// server/src/lib/storage.ts
import { prisma } from './db.js'
import type { AuditAction } from '../types.js'

/** 預設通知規則的固定主鍵 —— 見 initDb 中的說明。 */
export const DEFAULT_NOTIFY_RULE_ID = 'default'

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
}

// Retention purge runs on a schedule instead of on every write
const AUDIT_RETENTION_DAYS = 180

export async function purgeOldAuditLogs(): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - AUDIT_RETENTION_DAYS)
  await prisma.auditLog.deleteMany({ where: { timestamp: { lt: cutoff } } })
}

export function scheduleAuditCleaner(): void {
  purgeOldAuditLogs().catch(err => console.error('[audit] purge failed:', err))
  setInterval(() => {
    purgeOldAuditLogs().catch(err => console.error('[audit] purge failed:', err))
  }, 24 * 60 * 60 * 1000).unref()
}

// ── DB Initialisation ────────────────────────────────────────
export async function initDb(): Promise<void> {
  // Ensure RestDaysConfig singleton
  await prisma.restDaysConfig.upsert({
    where: { id: 1 },
    create: { id: 1, weekends: true, specificDates: [] },
    update: {},
  })

  // Ensure NotifyConfig singleton（預設關閉，設定齊全前不寄任何信）
  await prisma.notifyConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled: false },
    update: {},
  })

  // 預設通知規則。resolveRule 的沿用鏈終點就是它，缺了整批不寄信。
  //
  // 用固定主鍵 upsert 而不是 findFirst-then-create：MySQL 的 UNIQUE 索引把每個
  // NULL 視為互異，所以 testUnit 上的 UNIQUE 擋不住第二筆 testUnit = NULL。
  // 主鍵 upsert 會編成 INSERT ... ON DUPLICATE KEY UPDATE，是原子的。
  await prisma.notifyRule.upsert({
    where: { id: DEFAULT_NOTIFY_RULE_ID },
    create: {
      id: DEFAULT_NOTIFY_RULE_ID,
      testUnit: null,
      enabled: true,
      subjectTemplate: '[VSMS 排程預告] {{projectName}} 將於 {{startDate}} 啟動',
      introTemplate: '您好，以下排程將於 {{daysUntilStart}} 天後啟動：',
      outroTemplate: '如需異動請至系統確認。',
      ccRecipients: '',
    },
    update: {},
  })
  // 清掉任何非正規的預設規則，讓 resolveRule 的 .find() 不會在不同次啟動挑到不同筆。
  await prisma.notifyRule.deleteMany({
    where: { testUnit: null, id: { not: DEFAULT_NOTIFY_RULE_ID } },
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
