// src/lib/vtmsLinkAfterSave.ts
//
// 排程儲存後的 VTMS 關聯同步。POST/PUT /api/schedules 會把 vtmsPlanId 濾掉
// （只能透過 PATCH /:id/vtms-link 寫入，那支會檢查 canLinkVtms），所以表單
// 必須在拿到 saved.id 之後另外呼叫一次。關聯失敗時排程本身已經存好，呼叫端
// 要把這兩件事分開告訴使用者。
import type { Schedule } from '../types'

export type VtmsLinkSync =
  | { status: 'skipped' }
  | { status: 'linked'; schedule: Schedule }
  | { status: 'failed'; error: unknown }

export async function syncVtmsLink(opts: {
  canLinkVtms: boolean
  savedId: string
  previous: string | null | undefined
  next: string
  setLink: (id: string, planId: string | null) => Promise<Schedule>
}): Promise<VtmsLinkSync> {
  if (!opts.canLinkVtms) return { status: 'skipped' }
  if ((opts.previous ?? '') === opts.next) return { status: 'skipped' }
  try {
    const schedule = await opts.setLink(opts.savedId, opts.next || null)
    return { status: 'linked', schedule }
  } catch (error) {
    return { status: 'failed', error }
  }
}
