import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }))

vi.mock('../lib/db.js', () => {
  const tx = { restDaysConfig: { findUnique, upsert } }
  return { prisma: { ...tx, $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
})

import { parseStoredRestDates, updateRestDates, InvalidStoredHolidaysError } from '../lib/restDaysStore.js'

const row = (specificDates: unknown) => ({ id: 1, weekends: true, specificDates })

beforeEach(() => { findUnique.mockReset(); upsert.mockReset() })

describe('parseStoredRestDates', () => {
  it('兩種格式都收，正規化成斜線、排序、去重', () => {
    expect(parseStoredRestDates(['2026-10-09', '2026/02/27', '2026/10/09'])).toEqual(['2026/02/27', '2026/10/09'])
  })
  it('接受 MySQL 回的 JSON 字串', () => {
    expect(parseStoredRestDates('["2026/11/20"]')).toEqual(['2026/11/20'])
  })
  it('壞 JSON 或不是陣列時拋錯', () => {
    expect(() => parseStoredRestDates('{oops')).toThrow(/specificDates/)
    expect(() => parseStoredRestDates({ a: 1 })).toThrow(/specificDates/)
  })
  it('有不合法的日期時丟 InvalidStoredHolidaysError 並列出', () => {
    try {
      parseStoredRestDates(['2026/10/09', '2026/02/30'])
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidStoredHolidaysError)
      expect((e as InvalidStoredHolidaysError).bad).toEqual(['2026/02/30'])
    }
  })
})

describe('updateRestDates', () => {
  it('讀出、套用變更、去重排序後寫回', async () => {
    findUnique.mockResolvedValue(row(['2026/10/26']))

    const r = await updateRestDates(d => [...d, '2026/10/09', '2026/10/26'])

    const after = ['2026/10/09', '2026/10/26']
    expect(r).toEqual({ before: ['2026/10/26'], after })
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, weekends: true, specificDates: after },
      update: { weekends: true, specificDates: after },
    })
  })

  it('清單沒有變動時不寫入', async () => {
    findUnique.mockResolvedValue(row(['2026/10/09']))

    await updateRestDates(d => [...d, '2026/10/09'])

    expect(upsert).not.toHaveBeenCalled()
  })

  it('缺列時拋錯、不寫入', async () => {
    findUnique.mockResolvedValue(null)

    await expect(updateRestDates(d => d)).rejects.toThrow(/id=1/)
    expect(upsert).not.toHaveBeenCalled()
  })

  // 兩個請求同時進來：第二個必須讀到第一個寫入後的清單，不能各自從舊清單算、互相蓋掉
  it('同時呼叫時依序執行，後者看得到前者的結果', async () => {
    let stored = ['2026/10/26']
    findUnique.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5))
      return row(stored)
    })
    upsert.mockImplementation(async ({ update }: { update: { specificDates: string[] } }) => {
      stored = update.specificDates
    })

    await Promise.all([
      updateRestDates(d => [...d, '2026/10/09']),
      updateRestDates(d => [...d, '2026/12/25']),
    ])

    expect(stored).toEqual(['2026/10/09', '2026/10/26', '2026/12/25'])
  })

  it('前一個失敗不會卡住後面的呼叫', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row([]))

    await expect(updateRestDates(d => d)).rejects.toThrow()
    await expect(updateRestDates(d => [...d, '2026/10/09'])).resolves.toMatchObject({ after: ['2026/10/09'] })
  })
})
