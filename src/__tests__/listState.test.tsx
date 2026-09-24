// src/__tests__/listState.test.tsx
// ListState：列表區塊的載入／空／篩選後沒結果／失敗（UI 統一第 3 項 E）。
// 判斷順序寫死在元件裡，這裡把五種情況與「有資料時的錯誤提示」逐一釘住。
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListState } from '../components/shared/ListState'

const rows = <ul><li>PDN-260001</li></ul>

describe('ListState', () => {
  it('1. 有資料：只顯示資料，沒有狀態區塊', () => {
    render(<ListState noun="排程" loading={false} count={1}>{rows}</ListState>)
    expect(screen.getByText('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('1. 有資料且 loading：照常顯示資料，不顯示「載入中…」', () => {
    render(<ListState noun="排程" loading count={1}>{rows}</ListState>)
    expect(screen.getByText('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByText('載入中…')).toBeNull()
  })

  it('1. 有資料且有錯誤：資料仍在，錯誤提示在資料上方，重試會呼叫 onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ListState noun="帳號" loading={false} error="HTTP 500" count={3} onRetry={onRetry}>{rows}</ListState>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入帳號')
    expect(alert).toHaveTextContent('HTTP 500')
    const data = screen.getByText('PDN-260001')
    expect(alert.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('1. 有資料且有錯誤、沒給 onRetry：沒有重試按鈕', () => {
    render(<ListState noun="帳號" loading={false} error="HTTP 500" count={3}>{rows}</ListState>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
  })

  it('2. 沒有資料且失敗：只顯示失敗狀態，就算同時 loading、filtered 也一樣', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ListState noun="排程" loading filtered error="HTTP 503" count={0} onRetry={onRetry} onClearFilters={vi.fn()}>
        {rows}
      </ListState>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程')
    expect(alert).toHaveTextContent('HTTP 503')
    expect(screen.queryByText('載入中…')).toBeNull()
    expect(screen.queryByText(/沒有符合條件的/)).toBeNull()
    expect(screen.queryByText(/目前沒有/)).toBeNull()
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
    expect(screen.queryByText('PDN-260001')).toBeNull()

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('2. 錯誤訊息是空字串：仍是失敗狀態，只是沒有小字', () => {
    render(<ListState noun="排程" loading={false} error="" count={0}>{rows}</ListState>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程')
    expect(alert.querySelectorAll('p')).toHaveLength(1)
  })

  it('3. 沒有資料且 loading：只顯示「載入中…」', () => {
    render(<ListState noun="排程" loading filtered count={0} onClearFilters={vi.fn()}>{rows}</ListState>)
    expect(screen.getByRole('status')).toHaveTextContent('載入中…')
    expect(screen.queryByText(/沒有符合條件的/)).toBeNull()
    expect(screen.queryByText(/目前沒有/)).toBeNull()
    expect(screen.queryByText('PDN-260001')).toBeNull()
  })

  it('4. 篩選後沒結果：顯示「沒有符合條件的…」，清除按鈕會呼叫 onClearFilters', async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()
    render(<ListState noun="排程" loading={false} filtered count={0} onClearFilters={onClearFilters}>{rows}</ListState>)
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')
    await user.click(screen.getByRole('button', { name: '清除篩選' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('4. clearLabel 可以換成「清除搜尋」', () => {
    render(
      <ListState noun="排程" loading={false} filtered count={0} onClearFilters={vi.fn()} clearLabel="清除搜尋">
        {rows}
      </ListState>,
    )
    expect(screen.getByRole('button', { name: '清除搜尋' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
  })

  it('4. 沒給 onClearFilters：沒有清除按鈕', () => {
    render(<ListState noun="排程" loading={false} filtered count={0}>{rows}</ListState>)
    expect(screen.getByText('沒有符合條件的排程')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('5. 真的沒有：顯示「目前沒有…」與 emptyAction', () => {
    render(
      <ListState noun="排程" loading={false} count={0} emptyAction={<button type="button">新增排程</button>}>
        {rows}
      </ListState>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('目前沒有排程')
    expect(screen.getByRole('button', { name: '新增排程' })).toBeInTheDocument()
    expect(screen.queryByText('PDN-260001')).toBeNull()
  })

  it('沒有資料時不顯示重試按鈕，除非有錯誤', () => {
    render(<ListState noun="排程" loading={false} count={0} onRetry={vi.fn()}>{rows}</ListState>)
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
  })
})
