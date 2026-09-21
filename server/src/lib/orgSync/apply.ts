// server/src/lib/orgSync/apply.ts
// deriveVsmsOrg 的計畫寫入 Prisma；版本守衛與稽核記錄也在這裡。
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../db.js'
import { appendAudit } from '../storage.js'
import { deriveVsmsOrg } from './derive.js'
import { orgSyncState } from './state.js'
import type { OrgSnapshot, VsmsOrgCurrent, VsmsOrgPlan } from './types.js'

export interface SyncResult {
  ok: true; version: number; dryRun: boolean; ignored?: true
  plan: VsmsOrgPlan
  applied?: { units: { created: number; updated: number }; engineers: { created: number; updated: number }; users: { created: number; updated: number } }
}

// 用 Prisma 的交易 handle 或 prisma 本體都可以（型別只取用到的方法）。
type Db = Pick<typeof prisma, 'testUnit' | 'engineer' | 'user'>

export async function loadVsmsOrgCurrent(db: Db = prisma): Promise<VsmsOrgCurrent> {
  const [units, engineers, users] = await Promise.all([
    db.testUnit.findMany({ select: { id: true, value: true, label: true, department: true, isActive: true, sortOrder: true } }),
    db.engineer.findMany({ select: { id: true, value: true, testUnitId: true, isActive: true, sortOrder: true } }),
    db.user.findMany({ select: { id: true, username: true, role: true, isActive: true, allowedUnits: true, linkedEngineer: true } }),
  ])
  return {
    units, engineers,
    users: users.map(u => ({ ...u, allowedUnits: Array.isArray(u.allowedUnits) ? (u.allowedUnits as string[]) : [] })),
  }
}

export async function applyVsmsOrgPlan(plan: VsmsOrgPlan): Promise<NonNullable<SyncResult['applied']>> {
  await prisma.$transaction(async tx => {
    // 單位：新的接在最後（sortOrder），color 不動。
    const maxUnit = await tx.testUnit.aggregate({ _max: { sortOrder: true } })
    let nextUnit = (maxUnit._max.sortOrder ?? -1) + 1
    for (const u of plan.units.create) {
      await tx.testUnit.create({ data: { id: uuidv4(), value: u.value, label: u.value, department: u.department, isActive: u.isActive, sortOrder: nextUnit++ } })
    }
    for (const u of plan.units.update) await tx.testUnit.update({ where: { id: u.id }, data: u.changes })

    // 名冊：value → testUnitId 要含剛建的單位，所以重查一次。
    const units = await tx.testUnit.findMany({ select: { id: true, value: true } })
    const unitId = new Map(units.map(u => [u.value, u.id]))
    const perUnitNext = new Map<string, number>()
    for (const e of plan.engineers.create) {
      const testUnitId = unitId.get(e.unitValue)
      if (!testUnitId) throw new Error(`[orgSync] unit ${e.unitValue} missing after create`)
      if (!perUnitNext.has(testUnitId)) {
        const m = await tx.engineer.aggregate({ _max: { sortOrder: true }, where: { testUnitId } })
        perUnitNext.set(testUnitId, (m._max.sortOrder ?? -1) + 1)
      }
      const sortOrder = perUnitNext.get(testUnitId)!
      perUnitNext.set(testUnitId, sortOrder + 1)
      await tx.engineer.create({ data: { id: uuidv4(), value: e.value, label: e.value, isActive: e.isActive, sortOrder, color: null, testUnitId } })
    }
    for (const e of plan.engineers.update) await tx.engineer.update({ where: { id: e.id }, data: e.changes })

    // 帳號：新建 passwordHash '!'（登入走 vauth），id 沿用 vauth。
    for (const u of plan.users.create) {
      await tx.user.create({ data: { id: u.id, username: u.username, displayName: u.username, passwordHash: '!', role: u.role, isActive: u.isActive, allowedUnits: u.allowedUnits, linkedEngineer: u.linkedEngineer } })
    }
    for (const u of plan.users.update) await tx.user.update({ where: { id: u.id }, data: u.changes })
  })
  const applied = {
    units: { created: plan.units.create.length, updated: plan.units.update.length },
    engineers: { created: plan.engineers.create.length, updated: plan.engineers.update.length },
    users: { created: plan.users.create.length, updated: plan.users.update.length },
  }
  const total = Object.values(applied).reduce((n, x) => n + x.created + x.updated, 0)
  if (total > 0) await appendAudit('system', 'vauth org sync', 'ORG_SYNC', 'org', [`units +${applied.units.created} ~${applied.units.updated}`, `engineers +${applied.engineers.created} ~${applied.engineers.updated}`, `users +${applied.users.created} ~${applied.users.updated}`])
  return applied
}

export async function syncVsmsOrg(snapshot: OrgSnapshot, opts: { dryRun: boolean }): Promise<SyncResult> {
  const plan = deriveVsmsOrg(snapshot, await loadVsmsOrgCurrent())
  if (!opts.dryRun && snapshot.version < orgSyncState.lastAppliedVersion) return { ok: true, version: snapshot.version, dryRun: false, ignored: true, plan }
  if (opts.dryRun) return { ok: true, version: snapshot.version, dryRun: true, plan }
  const applied = await applyVsmsOrgPlan(plan)
  orgSyncState.lastAppliedVersion = snapshot.version
  console.log(`[orgSync] applied snapshot v${snapshot.version}: units +${applied.units.created} ~${applied.units.updated}, engineers +${applied.engineers.created} ~${applied.engineers.updated}, users +${applied.users.created} ~${applied.users.updated}, skipped ${plan.skipped.length}`)
  return { ok: true, version: snapshot.version, dryRun: false, plan, applied }
}
