import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FallbackRecipient } from '../types'

const createNotifyRecipient = vi.fn()
const updateNotifyRecipient = vi.fn()
const deleteNotifyRecipient = vi.fn()

class FakeApiError extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string>) {
    super(message)
  }
}

vi.mock('../lib/api', () => ({
  api: {
    createNotifyRecipient: (...a: unknown[]) => createNotifyRecipient(...a),
    updateNotifyRecipient: (...a: unknown[]) => updateNotifyRecipient(...a),
    deleteNotifyRecipient: (...a: unknown[]) => deleteNotifyRecipient(...a),
  },
  ApiError: FakeApiError,
}))

const { FallbackRecipients } = await import('../components/settings/FallbackRecipients')

const amy: FallbackRecipient = { id: 'r1', name: 'Amy_Chen', note: 'QA 窗口', isActive: true }

beforeEach(() => {
  for (const fn of [createNotifyRecipient, updateNotifyRecipient, deleteNotifyRecipient]) {
    fn.mockReset()
    fn.mockResolvedValue({ ok: true })
  }
})

describe('FallbackRecipients', () => {
  it('清單為空時警告，說明信會直接放棄寄送', async () => {
    // 空清單是有後果的狀態，不能只顯示一片空白
    render(<FallbackRecipients recipients={[]} onChanged={vi.fn()} />)

    expect(screen.getByText(/沒有啟用中的代收人員/)).toBeInTheDocument()
    expect(screen.getByText(/放棄寄送/)).toBeInTheDocument()
  })

  it('全部停用時同樣警告，不因為清單有資料就當作已設定', async () => {
    render(<FallbackRecipients recipients={[{ ...amy, isActive: false }]} onChanged={vi.fn()} />)

    expect(screen.getByText(/沒有啟用中的代收人員/)).toBeInTheDocument()
  })

  it('有啟用中的人員時不警告', async () => {
    render(<FallbackRecipients recipients={[amy]} onChanged={vi.fn()} />)

    expect(screen.queryByText(/沒有啟用中的代收人員/)).not.toBeInTheDocument()
    expect(screen.getByText('Amy_Chen')).toBeInTheDocument()
  })

  it('新增成功後清空輸入框並通知外層重載', async () => {
    const onChanged = vi.fn()
    render(<FallbackRecipients recipients={[]} onChanged={onChanged} />)

    await userEvent.type(screen.getByPlaceholderText('Amy_Chen'), 'Kevin_Yu')
    await userEvent.type(screen.getByPlaceholderText('例：QA 窗口'), '備援')
    await userEvent.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() => expect(createNotifyRecipient).toHaveBeenCalledWith('Kevin_Yu', '備援'))
    expect(onChanged).toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Amy_Chen')).toHaveValue('')
  })

  it('新增失敗時顯示後端的逐欄位訊息，且不清空輸入框', async () => {
    // 後端那句話已經指出該怎麼修，換成通用訊息只會讓管理者不知道問題在哪
    createNotifyRecipient.mockRejectedValue(
      new FakeApiError(422, '驗證失敗', { name: '「@broken」無法組成有效信箱；請填公司帳號名或完整 email' }),
    )
    const onChanged = vi.fn()
    render(<FallbackRecipients recipients={[]} onChanged={onChanged} />)

    await userEvent.type(screen.getByPlaceholderText('Amy_Chen'), '@broken')
    await userEvent.click(screen.getByRole('button', { name: '新增' }))

    expect(await screen.findByText(/無法組成有效信箱/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Amy_Chen')).toHaveValue('@broken')
  })

  it('名稱空白時新增鈕停用', async () => {
    render(<FallbackRecipients recipients={[]} onChanged={vi.fn()} />)

    expect(screen.getByRole('button', { name: '新增' })).toBeDisabled()
  })

  it('取消勾選會停用而不是刪除', async () => {
    render(<FallbackRecipients recipients={[amy]} onChanged={vi.fn()} />)

    await userEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(updateNotifyRecipient).toHaveBeenCalledWith('r1', { isActive: false }))
    expect(deleteNotifyRecipient).not.toHaveBeenCalled()
  })

  it('刪除會呼叫刪除 API', async () => {
    render(<FallbackRecipients recipients={[amy]} onChanged={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '刪除' }))

    await waitFor(() => expect(deleteNotifyRecipient).toHaveBeenCalledWith('r1'))
  })

  it('備註沒改動就不送出更新', async () => {
    // 每次 blur 都打一次 API 會把稽核記錄灌滿沒有內容的異動
    render(<FallbackRecipients recipients={[amy]} onChanged={vi.fn()} />)

    const noteInput = screen.getByDisplayValue('QA 窗口')
    await userEvent.click(noteInput)
    await userEvent.tab()

    expect(updateNotifyRecipient).not.toHaveBeenCalled()
  })
})
