// src/lib/peopleActions.ts
//
// 人員頁列上的「停用／啟用」要橫跨兩個 API（名冊走 PUT /api/options、帳號走
// /api/users），沒有交易。流程抽成純函式並注入相依，第二步失敗時把「第一步
// 已經生效」講清楚，不回滾、不拋出，由呼叫端決定怎麼顯示。
import type { Person } from './peopleRows'

export interface PeopleDeps {
  patchEngineers: (targets: { unitId: string; engId: string }[], patch: { isActive: boolean }) => Promise<void>
  disableUser: (id: string) => Promise<unknown>
  enableUser: (id: string) => Promise<unknown>
}

export type ActionResult = { ok: true } | { ok: false; message: string }

export function membershipTargets(p: Person): { unitId: string; engId: string }[] {
  return p.memberships.map(m => ({ unitId: m.unitId, engId: m.engineer.id }))
}

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function setActive(p: Person, isActive: boolean, deps: PeopleDeps): Promise<ActionResult> {
  const verb = isActive ? '啟用' : '停用'
  const targets = membershipTargets(p)
  if (targets.length > 0) {
    try { await deps.patchEngineers(targets, { isActive }) }
    catch (e) { return { ok: false, message: `名冊${verb}失敗：${msgOf(e)}` } }
  }
  if (p.account && p.account.isActive !== isActive) {
    try { await (isActive ? deps.enableUser(p.account.id) : deps.disableUser(p.account.id)) }
    catch (e) {
      const prefix = targets.length > 0 ? `名冊已${verb}，但` : ''
      return { ok: false, message: `${prefix}帳號${verb}失敗：${msgOf(e)}` }
    }
  }
  return { ok: true }
}

export const deactivatePerson = (p: Person, deps: PeopleDeps) => setActive(p, false, deps)
export const activatePerson = (p: Person, deps: PeopleDeps) => setActive(p, true, deps)
