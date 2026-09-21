import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deliver, fetchDeliveryStatuses } from '../lib/notifyClient.js'

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
})
