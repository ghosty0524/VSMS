// PDN 對 VTMS 專案名稱的比對。VTMS 的 name 是自由文字，所以只做 trim + 不分
// 大小寫的相等；不相等時列出「互相包含」的名稱給人自己判斷，不自動修正。
import { describe, it, expect } from 'vitest'
import { matchPdn, SIMILAR_LIMIT } from '../lib/pdnMatch.js'

const projects = [
  { name: 'PDN-9999', planCount: 2 },
  { name: 'PDN-99990', planCount: 0 },
  { name: 'pdn-12345 ', planCount: 1 },
  { name: 'Other', planCount: 3 },
]

describe('matchPdn', () => {
  it('精確相等回 found 並帶原始名稱與計畫數', () => {
    expect(matchPdn('PDN-9999', projects)).toEqual({ status: 'found', name: 'PDN-9999', planCount: 2 })
  })

  it('比對忽略前後空白與大小寫，但回傳 VTMS 的原始寫法', () => {
    expect(matchPdn('  pdn-12345', projects)).toEqual({ status: 'found', name: 'pdn-12345 ', planCount: 1 })
  })

  it('多筆正規化後相等時取第一筆', () => {
    const dupes = [
      { name: 'PDN-7777', planCount: 1 },
      { name: 'pdn-7777', planCount: 9 },
    ]
    expect(matchPdn('PDN-7777', dupes)).toEqual({ status: 'found', name: 'PDN-7777', planCount: 1 })
  })

  it('不相等時列出雙向包含的名稱（少一碼會列出多一碼的、多一碼也會列出少一碼的）', () => {
    expect(matchPdn('PDN-999', projects)).toEqual({ status: 'not_found', similar: ['PDN-9999', 'PDN-99990'] })
    expect(matchPdn('PDN-999901', projects)).toEqual({ status: 'not_found', similar: ['PDN-9999', 'PDN-99990'] })
  })

  it('沒有相近名稱時 similar 為空陣列', () => {
    expect(matchPdn('ZZZ', projects)).toEqual({ status: 'not_found', similar: [] })
  })

  it('similar 依名稱排序且最多 SIMILAR_LIMIT 筆', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `PDN-1${i}`, planCount: 0 })).reverse()
    const r = matchPdn('PDN-1', many)
    expect(r.status).toBe('not_found')
    if (r.status === 'not_found') {
      expect(r.similar).toHaveLength(SIMILAR_LIMIT)
      expect(r.similar).toEqual(['PDN-10', 'PDN-11', 'PDN-12', 'PDN-13', 'PDN-14'])
    }
  })

  it('空清單回 not_found', () => {
    expect(matchPdn('PDN-1', [])).toEqual({ status: 'not_found', similar: [] })
  })

  it('空字串不會把整份清單當成相近', () => {
    expect(matchPdn('   ', projects)).toEqual({ status: 'not_found', similar: [] })
  })
})
