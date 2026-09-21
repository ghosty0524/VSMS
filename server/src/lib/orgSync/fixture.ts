// server/src/lib/orgSync/fixture.ts
// 共用 fixture（三個 repo 的測試都用同一份資料，2026-09-21 正式庫查證）。原樣，含 26 人。
import type { OrgSnapshot, OrgUnitSnap } from './types.js'

// 單位：sortOrder 依 VTMS settings.departments 順序 SI、RA、SIT；課 SIT-HW、SIT-SW
export const FIXTURE_UNITS: OrgUnitSnap[] = [
  { code: 'SI',     parentCode: null,  isActive: true, sortOrder: 1 },
  { code: 'RA',     parentCode: null,  isActive: true, sortOrder: 2 },
  { code: 'SIT',    parentCode: null,  isActive: true, sortOrder: 3 },
  { code: 'SIT-HW', parentCode: 'SIT', isActive: true, sortOrder: 1 },
  { code: 'SIT-SW', parentCode: 'SIT', isActive: true, sortOrder: 2 },
];
// [username, unitCode, isUnitLead, isActive]
export const FIXTURE_PEOPLE: [string, string, boolean, boolean][] = [
  ['Japon_Chen', 'RA', false, true], ['Lily_Lee', 'RA', false, true], ['Michael_Kuo', 'RA', false, true],
  ['Will_Wang', 'RA', true, true], ['William_Wu', 'RA', false, true],
  ['Alancc_Yen', 'SI', false, true], ['Brian_Kuo', 'SI', true, true], ['Paul_Ding', 'SI', false, true],
  ['Wade_Huang', 'SI', false, true], ['Raymond_Lin', 'SI', false, false],
  ['Ericct_Hsieh', 'SIT', true, true],
  ['Darius_Chang', 'SIT-HW', false, true], ['Harry_Chen', 'SIT-HW', false, true], ['Jacky_Yan', 'SIT-HW', false, true],
  ['Michael_Chang', 'SIT-HW', false, true], ['Polson_Cheng', 'SIT-HW', true, true], ['Rock_Cai', 'SIT-HW', false, true],
  ['Wayhon_Ni', 'SIT-HW', false, true], ['Willie_Lin', 'SIT-HW', false, true],
  ['Hsuan_Chang', 'SIT-HW', false, false], ['Ben_Ko', 'SIT-HW', false, false],
  ['Ashley_Liu', 'SIT-SW', true, true], ['Jeffrey_Shen', 'SIT-SW', false, true], ['Kirin_Shen', 'SIT-SW', false, true],
  ['Nervo_Kuo', 'SIT-SW', false, true],
];
export function fixtureSnapshot(version = 1): OrgSnapshot {
  return {
    version, generatedAt: '2026-09-21T00:00:00.000Z',
    units: FIXTURE_UNITS,
    people: FIXTURE_PEOPLE.map(([username, unitCode, isUnitLead, isActive]) => ({ id: 'id-' + username, username, isActive, unitCode, isUnitLead })),
  };
}
