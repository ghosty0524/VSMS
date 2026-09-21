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

export function validateSnapshot(body: unknown): string | null {
  const s = body as Partial<OrgSnapshot> | null
  if (!s || typeof s !== 'object') return 'snapshot must be an object'
  if (!Number.isInteger(s.version) || (s.version as number) < 1) return 'version must be a positive integer'
  if (!Array.isArray(s.units) || s.units.length === 0) return 'units must be a non-empty array'
  if (!Array.isArray(s.people) || s.people.length === 0) return 'people must be a non-empty array'
  for (const u of s.units) if (typeof u.code !== 'string' || !u.code) return 'unit.code required'
  for (const p of s.people) if (typeof p.username !== 'string' || !p.username || typeof p.unitCode !== 'string') return 'person.username/unitCode required'
  return null
}
