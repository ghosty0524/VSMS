import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deliver, fetchDeliveryStatuses, notifyConfigured } from '../lib/notifyClient.js'

beforeEach(() => {
  process.env.NOTIFY_URL = 'http://127.0.0.1:4100'
  process.env.VAUTH_SERVICE_KEY = 'k'
})

describe('notifyClient.deliver', () => {
  it('POST /notify/deliveries 帶 service key，source 固定 vsms，回 id/deduped/mail', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'd1', deduped: false, inbox: { created: 1 }, mail: { queued: true, unresolved: [] } }), { status: 201 }))
    const r = await deliver({ key: 'k1', channels: ['inapp'], recipients: [{ userId: 'u1' }], severity: 'info', title: 't', body: 'b' }, { fetchFn: fetchFn as unknown as typeof fetch })
    expect(r).toEqual({ id: 'd1', deduped: false, dropped: false, mail: { queued: true, unresolved: [] } })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:4100/notify/deliveries')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Service-Key']).toBe('k')
    expect(JSON.parse(init.body as string)).toMatchObject({ source: 'vsms', key: 'k1', linkUrl: '' })
  })
  it('200 deduped', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'd1', deduped: true, applied: 'ignore' }), { status: 200 }))
    expect(await deliver({ key: 'k', channels: ['inapp'], recipients: [{ userId: 'u1' }], severity: 'info', title: 't', body: 'b' }, { fetchFn: fetchFn as unknown as typeof fetch })).toMatchObject({ id: 'd1', deduped: true })
  })
  it('未設定 NOTIFY_URL 或 key → dropped，不打網路', async () => {
    const fetchFn = vi.fn()
    process.env.VAUTH_SERVICE_KEY = ''
    const r = await deliver({ key: 'k', channels: ['inapp'], recipients: [{ userId: 'u1' }], severity: 'info', title: 't', body: 'b' }, { fetchFn: fetchFn as unknown as typeof fetch })
    expect(r).toEqual({ id: null, deduped: false, dropped: true })
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('非 2xx 丟例外並帶錯誤碼', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'BAD_KEY', message: 'x' } }), { status: 400 }))
    await expect(deliver({ key: '', channels: ['inapp'], recipients: [{ userId: 'u1' }], severity: 'info', title: 't', body: 'b' }, { fetchFn: fetchFn as unknown as typeof fetch })).rejects.toThrow(/BAD_KEY/)
  })
  it('收件人可以是 { username }（平台以 username 解析跨系統身分）', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 'd1', deduped: false }), { status: 201 }))
    await deliver({ key: 'k', channels: ['inapp'], recipients: [{ username: 'darius.chang' }], severity: 'info', title: 't', body: 'b' }, { fetchFn: fetchFn as unknown as typeof fetch })
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).recipients).toEqual([{ username: 'darius.chang' }])
  })
})

describe('notifyConfigured', () => {
  it('NOTIFY_URL 與 VAUTH_SERVICE_KEY 都設定時回 true', () => {
    expect(notifyConfigured()).toBe(true)
  })
  it('缺 NOTIFY_URL 時回 false', () => {
    process.env.NOTIFY_URL = ''
    expect(notifyConfigured()).toBe(false)
  })
  it('缺 VAUTH_SERVICE_KEY 時回 false', () => {
    process.env.VAUTH_SERVICE_KEY = '  '
    expect(notifyConfigured()).toBe(false)
  })
})

describe('notifyClient.fetchDeliveryStatuses', () => {
  it('ids 為空時不打網路，回空 Map', async () => {
    const fetchFn = vi.fn()
    const r = await fetchDeliveryStatuses([], { fetchFn: fetchFn as unknown as typeof fetch })
    expect(r.size).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('正常回應時組成 Map，鍵為 delivery id', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      deliveries: [
        { id: 'd1', mail: [{ id: 'm1', status: 'sent', lastError: null, sentAt: '2026-09-21T00:00:00.000Z' }] },
        { id: 'd2', mail: [] },
      ],
    }), { status: 200 }))
    const r = await fetchDeliveryStatuses(['d1', 'd2'], { fetchFn: fetchFn as unknown as typeof fetch })
    expect(r.get('d1')).toEqual({ status: 'sent', lastError: null, sentAt: '2026-09-21T00:00:00.000Z' })
    expect(r.has('d2')).toBe(false)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:4100/notify/deliveries?ids=d1%2Cd2&limit=500')
    expect((init.headers as Record<string, string>)['X-Service-Key']).toBe('k')
  })

  it('500 時回空 Map，不拋出', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 500 }))
    const r = await fetchDeliveryStatuses(['d1'], { fetchFn: fetchFn as unknown as typeof fetch })
    expect(r.size).toBe(0)
  })

  it('fetch 例外時回空 Map，不拋出', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const r = await fetchDeliveryStatuses(['d1'], { fetchFn: fetchFn as unknown as typeof fetch })
    expect(r.size).toBe(0)
  })

  it('450 個 id 分成 3 批查詢，每批不超過 200 個，避免查詢字串過長觸發 431', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `d${i}`)
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify({ deliveries: [] }), { status: 200 }))
    await fetchDeliveryStatuses(ids, { fetchFn: fetchFn as unknown as typeof fetch })
    expect(fetchFn).toHaveBeenCalledTimes(3)
    const sizes = fetchFn.mock.calls.map(([url]) => {
      const q = new URL(url).searchParams.get('ids') ?? ''
      return q.split(',').filter(Boolean).length
    })
    expect(sizes).toEqual([200, 200, 50])
  })

  it('逾時 10 秒後中止該批請求，回空 Map 而不是永遠掛住', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
      const promise = fetchDeliveryStatuses(['d1'], { fetchFn: fetchFn as unknown as typeof fetch })
      await vi.advanceTimersByTimeAsync(10_000)
      const r = await promise
      expect(r.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
