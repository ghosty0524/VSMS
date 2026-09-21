// server/src/lib/orgSync/types.ts
// 與 vauth 的 buildOrgSnapshot 及 VTMS 的同名檔案欄位一致；改欄位三邊要一起改。
export interface OrgUnitSnap { code: string; parentCode: string | null; isActive: boolean; sortOrder: number }
export interface OrgPersonSnap { id: string; username: string; isActive: boolean; unitCode: string; isUnitLead: boolean }
export interface OrgSnapshot { version: number; generatedAt: string; units: OrgUnitSnap[]; people: OrgPersonSnap[] }

export interface VsmsOrgCurrent {
  units: { id: string; value: string; label: string; department: string | null; isActive: boolean; sortOrder: number }[];
  engineers: { id: string; value: string; testUnitId: string; isActive: boolean; sortOrder: number }[];
  users: { id: string; username: string; role: string; isActive: boolean; allowedUnits: string[]; linkedEngineer: string }[];
}
export interface VsmsOrgPlan {
  units: {
    create: { value: string; department: string; isActive: boolean }[];
    update: { id: string; value: string; changes: Partial<{ department: string; isActive: boolean }> }[];
  };
  engineers: {
    create: { value: string; unitValue: string; isActive: boolean }[];
    update: { id: string; value: string; unitValue: string; changes: { isActive: boolean } }[];
  };
  users: {
    create: { id: string; username: string; role: 'admin' | 'user'; allowedUnits: string[]; linkedEngineer: string; isActive: boolean }[];
    update: { id: string; username: string; changes: Partial<{ role: 'admin' | 'user'; allowedUnits: string[]; linkedEngineer: string; isActive: boolean }> }[];
  };
  skipped: { username: string; reason: 'UNKNOWN_UNIT' | 'LOCAL_SUPER_ADMIN' }[];
}

/** User.displayName / username 的欄位長度（prisma schema：VarChar(50)）。 */
const MAX_USERNAME_LEN = 50

export function validateSnapshot(body: unknown): string | null {
  const s = body as Partial<OrgSnapshot> | null
  if (!s || typeof s !== 'object') return 'snapshot must be an object'
  if (!Number.isInteger(s.version) || (s.version as number) < 1) return 'version must be a positive integer'
  if (!Array.isArray(s.units) || s.units.length === 0) return 'units must be a non-empty array'
  if (!Array.isArray(s.people) || s.people.length === 0) return 'people must be a non-empty array'
  for (const u of s.units as unknown[]) {
    const x = u as OrgUnitSnap
    if (!u || typeof u !== 'object' || typeof x.code !== 'string' || !x.code) return 'unit.code required'
    // 少了這些欄位不會出錯，只會以 undefined 一路寫進 DB（isActive／sortOrder 變 null）。
    if (typeof x.isActive !== 'boolean') return 'unit.isActive must be a boolean'
    if (!Number.isInteger(x.sortOrder)) return 'unit.sortOrder must be an integer'
  }
  for (const p of s.people as unknown[]) {
    const x = p as OrgPersonSnap
    if (!p || typeof p !== 'object' || typeof x.username !== 'string' || !x.username || typeof x.unitCode !== 'string') return 'person.username/unitCode required'
    // id 是 users.id（沿用 vauth 的識別碼），缺了就會建出 id undefined 的帳號。
    if (typeof x.id !== 'string' || !x.id) return 'person.id required'
    if (typeof x.isUnitLead !== 'boolean' || typeof x.isActive !== 'boolean') return 'person.isUnitLead/isActive must be booleans'
    // User.displayName 是 VarChar(50)，超過長度會在 users.create 時整批失敗。
    if (x.username.length > MAX_USERNAME_LEN) return `person.username must be at most ${MAX_USERNAME_LEN} characters`
  }
  return null
}
