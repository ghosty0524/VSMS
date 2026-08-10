import { describe, it, expect } from 'vitest'
import { matchEngineers, type EngineerRecord } from '../lib/engineerMatch.js'

// 取自實際名單中會造成歧義的組合：
// - Will/William/Willie 三人前綴重疊
// - Chang/Kuo 等姓氏重複
const ROSTER: EngineerRecord[] = [
  { name: 'Darius_Chang', testUnit: 'RA' },
  { name: 'Hsuan_Chang', testUnit: 'RA' },
  { name: 'Will_Wang', testUnit: 'SI' },
  { name: 'William_Wu', testUnit: 'SI' },
  { name: 'Willie_Lin', testUnit: 'EMC' },
  { name: 'Alancc_Yen', testUnit: 'EMC' },
]

const names = (rows: { name: string }[]) => rows.map(r => r.name)

// 2026-08-04 起人員改名只更新 label、value 保持不變，兩者自此可能不同。
// value 是排程實際存的識別碼，label 是使用者在畫面上看到的名字。
describe('matchEngineers 顯示名稱（label）', () => {
  const RENAMED: EngineerRecord[] = [
    { name: 'Darius_Chang', label: 'Darius_Chang', testUnit: 'RA' },
    { name: 'Willie_Lin', label: 'Wilson_Lin', testUnit: 'EMC' }, // 已改名
  ]

  it('以改名後的顯示名稱查得到', () => {
    const r = matchEngineers(RENAMED, 'wilson')
    expect(names(r)).toEqual(['Willie_Lin'])
    expect(r[0].matchType).toBe('firstName')
  })

  it('以原本的 value 仍查得到', () => {
    expect(names(matchEngineers(RENAMED, 'willie'))).toEqual(['Willie_Lin'])
  })

  it('回傳同時帶 name 與 label，讓呼叫端查詢用 name、顯示用 label', () => {
    const r = matchEngineers(RENAMED, 'wilson')
    expect(r[0].name).toBe('Willie_Lin')
    expect(r[0].label).toBe('Wilson_Lin')
  })

  it('value 與 label 都相符時取較強的比對', () => {
    // value 為完整相符（exact）、label 僅前綴相符 → 應取 exact
    const rows: EngineerRecord[] = [{ name: 'Amy_Ko', label: 'Amyrose_Ko', testUnit: 'RA' }]
    expect(matchEngineers(rows, 'amy_ko')[0].matchType).toBe('exact')
  })

  it('未提供 label 時 label 等於 name', () => {
    expect(matchEngineers(ROSTER, 'darius')[0].label).toBe('Darius_Chang')
  })
})

describe('matchEngineers 完全相符', () => {
  it('忽略大小寫比對完整姓名', () => {
    expect(names(matchEngineers(ROSTER, 'darius_chang'))).toEqual(['Darius_Chang'])
    expect(names(matchEngineers(ROSTER, 'DARIUS_CHANG'))).toEqual(['Darius_Chang'])
  })

  it('底線、空白、連字號視為等價分隔符', () => {
    expect(names(matchEngineers(ROSTER, 'darius chang'))).toEqual(['Darius_Chang'])
    expect(names(matchEngineers(ROSTER, 'darius-chang'))).toEqual(['Darius_Chang'])
  })

  it('標記 matchType 為 exact', () => {
    expect(matchEngineers(ROSTER, 'darius_chang')[0].matchType).toBe('exact')
  })

  it('完整姓名相符時不被同前綴的其他人稀釋', () => {
    expect(names(matchEngineers(ROSTER, 'will_wang'))).toEqual(['Will_Wang'])
  })
})

describe('matchEngineers 只給名字', () => {
  it('名字唯一時回傳單一結果並標記 firstName', () => {
    const r = matchEngineers(ROSTER, 'darius')
    expect(names(r)).toEqual(['Darius_Chang'])
    expect(r[0].matchType).toBe('firstName')
  })

  it('名字與其他人前綴重疊時一併回傳，避免選錯人', () => {
    // 最強比對排最前面，其餘依姓名排序
    expect(names(matchEngineers(ROSTER, 'will')))
      .toEqual(['Will_Wang', 'William_Wu', 'Willie_Lin'])
  })

  it('前綴重疊時仍以 matchType 區分強弱', () => {
    const r = matchEngineers(ROSTER, 'will')
    expect(r.find(x => x.name === 'Will_Wang')?.matchType).toBe('firstName')
    expect(r.find(x => x.name === 'Willie_Lin')?.matchType).toBe('prefix')
  })
})

describe('matchEngineers 只給姓', () => {
  it('同姓者全部回傳並標記 lastName', () => {
    const r = matchEngineers(ROSTER, 'chang')
    expect(names(r)).toEqual(['Darius_Chang', 'Hsuan_Chang'])
    expect(r.every(x => x.matchType === 'lastName')).toBe(true)
  })
})

describe('matchEngineers 其他情況', () => {
  it('查無相符時回傳空陣列', () => {
    expect(matchEngineers(ROSTER, 'nobody')).toEqual([])
  })

  it('前面各層都無相符時退回子字串比對', () => {
    const r = matchEngineers(ROSTER, 'anc')
    expect(names(r)).toEqual(['Alancc_Yen'])
    expect(r[0].matchType).toBe('contains')
  })

  it('空白查詢字串回傳空陣列', () => {
    expect(matchEngineers(ROSTER, '   ')).toEqual([])
  })

  it('保留 testUnit', () => {
    expect(matchEngineers(ROSTER, 'darius')[0].testUnit).toBe('RA')
  })

  it('保留 isActive，讓呼叫端能提示該工程師已停用', () => {
    // 已離職的工程師仍會出現在歷史排程中，必須查得到
    const withLeaver: EngineerRecord[] = [...ROSTER, { name: 'Ben_Ko', testUnit: 'RA', isActive: false }]
    const r = matchEngineers(withLeaver, 'ben')
    expect(r).toHaveLength(1)
    expect(r[0].isActive).toBe(false)
  })

  it('未提供 isActive 時預設為 true', () => {
    expect(matchEngineers(ROSTER, 'darius')[0].isActive).toBe(true)
  })

  it('同層結果依姓名排序，確保回傳順序穩定', () => {
    expect(names(matchEngineers(ROSTER, 'chang'))).toEqual(['Darius_Chang', 'Hsuan_Chang'])
  })
})
